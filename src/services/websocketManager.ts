import { FastifyInstance, FastifyRequest } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { logger } from '../utils/logger';

/**
 * WebSocket connection interface
 */
interface WebSocketConnection {
  orderId: string;
  socket: SocketStream;
  connectedAt: Date;
}

/**
 * WebSocket message interface
 */
interface WebSocketMessage {
  orderId: string;
  status: string;
  data?: any;
  timestamp: Date;
}

/**
 * WebSocket Manager for real-time order status updates
 * Handles client connections and broadcasts order lifecycle events
 */
export class WebSocketManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private fastifyInstance?: FastifyInstance;

  /**
   * Set the Fastify instance for WebSocket registration
   * @param fastify - Fastify instance
   */
  public setFastifyInstance(fastify: FastifyInstance): void {
    this.fastifyInstance = fastify;
  }

  /**
   * Register WebSocket route for order status updates
   * @param orderId - Order identifier
   */
  public registerWebSocketRoute(orderId: string): void {
    if (!this.fastifyInstance) {
      throw new Error('Fastify instance not set');
    }

    this.fastifyInstance.get(`/ws/orders/${orderId}`, { websocket: true }, (connection, req) => {
      this.handleWebSocketConnection(orderId, connection, req);
    });
  }

  /**
   * Handle new WebSocket connection
   * @param orderId - Order identifier
   * @param socket - WebSocket stream
   * @param request - Fastify request
   */
  private handleWebSocketConnection(
    orderId: string, 
    socket: SocketStream, 
    request: FastifyRequest
  ): void {
    const connection: WebSocketConnection = {
      orderId,
      socket,
      connectedAt: new Date()
    };

    this.connections.set(orderId, connection);

    logger.getLogger().info('WebSocket connected', {
      orderId,
      clientIp: request.ip,
      userAgent: request.headers['user-agent']
    });

    // Send initial connection confirmation
    this.sendMessage(orderId, {
      orderId,
      status: 'connected',
      timestamp: new Date()
    });

    // Handle connection close
    socket.socket.on('close', () => {
      this.connections.delete(orderId);
      logger.getLogger().info('WebSocket disconnected', { orderId });
    });

    // Handle connection errors
    socket.socket.on('error', (error: Error) => {
      logger.logError(orderId, error, { context: 'WebSocket error' });
      this.connections.delete(orderId);
    });

    // Handle incoming messages (if any)
    socket.socket.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        logger.getLogger().info('WebSocket message received', {
          orderId,
          message: data
        });
      } catch (error) {
        logger.logError(orderId, error, { context: 'WebSocket message parsing' });
      }
    });
  }

  /**
   * Send message to specific order's WebSocket connection
   * @param orderId - Order identifier
   * @param message - Message to send
   */
  public sendMessage(orderId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(orderId);
    
    if (!connection) {
      logger.getLogger().warn('No WebSocket connection found for order', { orderId });
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      connection.socket.socket.send(messageStr);
      
      logger.getLogger().debug('WebSocket message sent', {
        orderId,
        status: message.status,
        messageLength: messageStr.length
      });
    } catch (error) {
      logger.logError(orderId, error, { context: 'WebSocket message sending' });
      this.connections.delete(orderId);
    }
  }

  /**
   * Emit order status update to connected clients
   * @param orderId - Order identifier
   * @param status - Order status
   * @param data - Additional data
   */
  public emitToOrder(orderId: string, status: string, data?: any): void {
    const message: WebSocketMessage = {
      orderId,
      status,
      data,
      timestamp: new Date()
    };

    this.sendMessage(orderId, message);
  }

  /**
   * Broadcast message to all connected clients
   * @param message - Message to broadcast
   */
  public broadcast(message: Omit<WebSocketMessage, 'orderId'>): void {
    const messageStr = JSON.stringify(message);
    
    for (const [orderId, connection] of this.connections) {
      try {
        connection.socket.socket.send(messageStr);
      } catch (error) {
        logger.logError(orderId, error, { context: 'WebSocket broadcast' });
        this.connections.delete(orderId);
      }
    }
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats(): {
    totalConnections: number;
    connections: Array<{ orderId: string; connectedAt: Date }>;
  } {
    const connections = Array.from(this.connections.entries()).map(([orderId, conn]) => ({
      orderId,
      connectedAt: conn.connectedAt
    }));

    return {
      totalConnections: this.connections.size,
      connections
    };
  }

  /**
   * Close all WebSocket connections
   */
  public closeAllConnections(): void {
    for (const [orderId, connection] of this.connections) {
      try {
        connection.socket.socket.close();
      } catch (error) {
        logger.logError(orderId, error, { context: 'WebSocket close' });
      }
    }
    
    this.connections.clear();
    logger.getLogger().info('All WebSocket connections closed');
  }

  /**
   * Check if order has active WebSocket connection
   * @param orderId - Order identifier
   */
  public hasConnection(orderId: string): boolean {
    return this.connections.has(orderId);
  }
}
