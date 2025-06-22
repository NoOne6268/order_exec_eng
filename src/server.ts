// src/server.ts
import Fastify, { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { config } from 'dotenv';
import { OrderProcessor } from './services/orderProcessor';
import { WebSocketManager } from './services/websocketManager';
import { orderRoutes } from './routes/orders';
import { metricsRoutes } from './routes/metrics';
import { databaseConfig } from './config/database';
import { logger } from './utils/logger';

// Load environment variables
config();

/**
 * Order Execution Server
 * Main application server with order processing, WebSocket support, and API endpoints
 */
class OrderExecutionServer {
  private fastify: FastifyInstance;
  private orderProcessor: OrderProcessor;
  private wsManager: WebSocketManager;

  constructor() {
    this.fastify = Fastify({ 
      logger: {
        level: process.env.LOG_LEVEL || 'info'
      }
    });
    
    this.wsManager = new WebSocketManager();
    this.orderProcessor = new OrderProcessor(this.wsManager);
    
    this.setupPlugins();
    this.setupRoutes();
    this.setupGlobalErrorHandler();
  }

  /**
   * Setup Fastify plugins
   */
  private async setupPlugins(): Promise<void> {
    // Register WebSocket support
    await this.fastify.register(websocket);
    
    // CORS support
    await this.fastify.register(cors, {
      origin: true,
      credentials: true
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Set WebSocket manager's Fastify instance
    this.wsManager.setFastifyInstance(this.fastify);
    
    // Register route modules
    this.fastify.register(orderRoutes, { 
      prefix: '/api/orders',
      orderProcessor: this.orderProcessor,
      wsManager: this.wsManager
    });
    
    this.fastify.register(metricsRoutes, { 
      prefix: '/api/metrics',
      orderProcessor: this.orderProcessor
    });

    // Health check endpoint
    this.fastify.get('/health', async () => {
      return { 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'order-execution-engine'
      };
    });

    // Root endpoint with API information
    this.fastify.get('/', async () => {
      return {
        name: 'Order Execution Engine',
        version: '1.0.0',
        description: 'DEX Order Execution Engine with WebSocket support',
        endpoints: {
          orders: '/api/orders',
          metrics: '/api/metrics',
          health: '/health',
          websocket: '/ws/orders/:orderId'
        },
        documentation: 'See README.md for API documentation'
      };
    });
  }

  /**
   * Setup global error handler
   */
  private setupGlobalErrorHandler(): void {
    this.fastify.setErrorHandler((error, request, reply) => {
      logger.logError(null, error, { 
        context: 'Global error handler',
        url: request.url,
        method: request.method
      });
      
      reply.status(500).send({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Initialize database and start server
   */
  public async start(): Promise<void> {
    try {
      // Initialize database tables
      await databaseConfig.initializeTables();
      logger.getLogger().info('Database initialized successfully');

      const port = parseInt(process.env.PORT || '3000');
      const host = process.env.HOST || '0.0.0.0';
      
      await this.fastify.listen({ port, host });
      
      logger.getLogger().info(`Server running on http://${host}:${port}`);
      logger.getLogger().info('Order Execution Engine started successfully');
      
      // Log startup information
      console.log(`
🚀 Order Execution Engine Started!
📍 Server: http://${host}:${port}
📊 Metrics: http://${host}:${port}/api/metrics
🔍 Health: http://${host}:${port}/health
📚 API Docs: http://${host}:${port}/
      `);
      
    } catch (err) {
      logger.logError(null, err, { context: 'Server startup' });
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  }

  /**
   * Gracefully shutdown the server
   */
  public async stop(): Promise<void> {
    try {
      logger.getLogger().info('Shutting down server...');
      
      // Close WebSocket connections
      this.wsManager.closeAllConnections();
      
      // Close order processor
      await this.orderProcessor.close();
      
      // Close database connections
      await databaseConfig.close();
      
      // Close Fastify server
      await this.fastify.close();
      
      logger.getLogger().info('Server shutdown completed');
    } catch (error) {
      logger.logError(null, error, { context: 'Server shutdown' });
      console.error('Error during shutdown:', error);
    }
  }

  /**
   * Get server instance for testing
   */
  public getFastifyInstance(): FastifyInstance {
    return this.fastify;
  }
}

// Start server
const server = new OrderExecutionServer();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  logger.logError(null, error, { context: 'Uncaught exception' });
  console.error('Uncaught exception:', error);
  await server.stop();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  logger.logError(null, reason, { context: 'Unhandled rejection', promise: promise.toString() });
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  await server.stop();
  process.exit(1);
});

// Start the server
server.start().catch(async (error) => {
  logger.logError(null, error, { context: 'Server start failure' });
  console.error('Failed to start server:', error);
  await server.stop();
  process.exit(1);
});
