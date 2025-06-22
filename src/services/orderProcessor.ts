// src/services/orderProcessor.ts
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Order, OrderStatus, ExecutionData } from '../types/order';
import { MockDexRouter } from './mockDexRouter';
import { WebSocketManager } from './websocketManager';
import { logger } from '../utils/logger';
import { databaseConfig } from '../config/database';
import { RoutingDecision } from '../types/dex';

/**
 * Order Processor Service
 * Handles order execution lifecycle with queue management and DEX routing
 */
export class OrderProcessor {
  private queue!: Queue;
  private worker!: Worker;
  private dexRouter: MockDexRouter;
  private redis: IORedis;
  private wsManager: WebSocketManager;
  private pgPool: any;

  constructor(wsManager: WebSocketManager) {
    this.wsManager = wsManager;
    this.redis = databaseConfig.getRedisClient();
    this.pgPool = databaseConfig.getPostgreSQLPool();
    
    this.dexRouter = new MockDexRouter();
    this.setupQueue();
    this.setupWorker();
  }

  /**
   * Initialize BullMQ queue with retry and backoff configuration
   */
  private setupQueue(): void {
    this.queue = new Queue('order-execution', {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    logger.getLogger().info('Order execution queue initialized');
  }

  /**
   * Setup worker with concurrency limits and rate limiting
   */
  private setupWorker(): void {
    this.worker = new Worker(
      'order-execution',
      async (job: Job<Order>) => {
        return await this.processOrder(job.data);
      },
      { 
        connection: this.redis,
        concurrency: 10,
        limiter: {
          max: 100,
          duration: 60000, // 100 jobs per minute
        }
      }
    );

    this.worker.on('completed', (job) => {
      logger.getLogger().info('Order completed successfully', {
        orderId: job.data.id,
        duration: Date.now() - job.timestamp
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.logError(job?.data?.id || null, err, { 
        context: 'Order processing failed',
        attempts: job?.attemptsMade
      });
    });

    this.worker.on('error', (err) => {
      logger.logError(null, err, { context: 'Worker error' });
    });

    this.worker.on('stalled', (jobId) => {
      logger.getLogger().warn('Job stalled', { jobId });
    });

    logger.getLogger().info('Order execution worker initialized');
  }

  /**
   * Submit order to processing queue
   * @param order - Order to be processed
   */
  public async submitOrder(order: Order): Promise<void> {
    try {
      // Persist order to database
      await this.persistOrder(order);
      
      // Add to processing queue
      await this.queue.add('execute-order', order, {
        jobId: order.id,
        delay: 0
      });
      
      // Update status to pending
      await this.updateOrderStatus(order.id, 'pending');
      
      logger.getLogger().info('Order submitted for processing', {
        orderId: order.id,
        type: order.type,
        amount: order.amountIn
      });
    } catch (error) {
      logger.logError(order.id, error, { context: 'Order submission' });
      throw error;
    }
  }

  /**
   * Process order through the complete execution lifecycle
   * @param order - Order to process
   * @returns Promise<ExecutionData> - Execution result
   */
  private async processOrder(order: Order): Promise<ExecutionData> {
    const startTime = Date.now();
    
    try {
      logger.getLogger().info('Starting order processing', {
        orderId: order.id,
        type: order.type
      });

      // Routing phase - Get quotes from both DEXs
      await this.updateOrderStatus(order.id, 'routing');
      logger.logOrderEvent(order.id, 'routing');
      
      const [raydiumQuote, meteoraQuote] = await Promise.all([
        this.dexRouter.getRaydiumQuote(order.tokenIn, order.tokenOut, order.amountIn),
        this.dexRouter.getMeteorQuote(order.tokenIn, order.tokenOut, order.amountIn)
      ]);

      // Select best DEX based on quotes
      const routingDecision = this.dexRouter.selectBestDex(raydiumQuote, meteoraQuote, order.amountIn);
      
      // Log routing decision
      logger.logRoutingDecision(order.id, routingDecision);
      await this.persistRoutingDecision(order.id, routingDecision);
      
      // Building phase - Prepare transaction
      await this.updateOrderStatus(order.id, 'building');
      logger.logOrderEvent(order.id, 'building');
      await this.simulateDelay(500);

      // Submission phase - Send transaction
      await this.updateOrderStatus(order.id, 'submitted');
      logger.logOrderEvent(order.id, 'submitted');
      
      // Execution phase - Execute swap
      const result = await this.dexRouter.executeSwap(routingDecision.dex, order);
      
      const executionData: ExecutionData = {
        txHash: result.txHash,
        executedPrice: result.executedPrice,
        dex: routingDecision.dex,
        gasUsed: result.gasUsed
      };

      // Update final status
      await this.updateOrderStatus(order.id, 'confirmed', executionData);
      logger.logExecutionResult(order.id, result);
      
      // Update metrics
      await this.updateMetrics(routingDecision.dex, true);
      
      const duration = Date.now() - startTime;
      logger.logPerformance('order_processing', duration, {
        orderId: order.id,
        dex: routingDecision.dex
      });
      
      return executionData;

    } catch (error) {
      const executionData: ExecutionData = {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      await this.updateOrderStatus(order.id, 'failed', executionData);
      await this.updateMetrics('', false);
      
      logger.logError(order.id, error, { 
        context: 'Order processing',
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }

  /**
   * Update order status and emit WebSocket notification
   * @param orderId - Order identifier
   * @param status - New status
   * @param data - Additional execution data
   */
  private async updateOrderStatus(
    orderId: string, 
    status: OrderStatus, 
    data?: ExecutionData
  ): Promise<void> {
    try {
      // Update in Redis for real-time access
      const orderKey = `order:${orderId}`;
      await this.redis.hset(orderKey, {
        status,
        updatedAt: new Date().toISOString(),
        ...(data && { executionData: JSON.stringify(data) })
      });

      // Update in PostgreSQL for persistence
      await this.pgPool.query(
        'UPDATE orders SET status = $1, updated_at = $2, execution_data = $3 WHERE id = $4',
        [status, new Date(), data ? JSON.stringify(data) : null, orderId]
      );

      // Log order event
      await this.pgPool.query(
        'INSERT INTO order_events (order_id, status, data) VALUES ($1, $2, $3)',
        [orderId, status, data ? JSON.stringify(data) : null]
      );

      // Emit WebSocket update
      this.wsManager.emitToOrder(orderId, status, data);
      
      logger.logOrderEvent(orderId, status, data);
    } catch (error) {
      logger.logError(orderId, error, { context: 'Status update' });
      throw error;
    }
  }

  /**
   * Persist order to database
   * @param order - Order to persist
   */
  private async persistOrder(order: Order): Promise<void> {
    await this.pgPool.query(
      `INSERT INTO orders (id, type, token_in, token_out, amount_in, slippage, status, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [order.id, order.type, order.tokenIn, order.tokenOut, order.amountIn, order.slippage, order.status, order.userId]
    );
  }

  /**
   * Persist routing decision to database
   * @param orderId - Order identifier
   * @param decision - Routing decision
   */
  private async persistRoutingDecision(orderId: string, decision: RoutingDecision): Promise<void> {
    await this.pgPool.query(
      `INSERT INTO routing_decisions (order_id, selected_dex, price, fee, reason, alternatives) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, decision.dex, decision.price, decision.fee, decision.reason, JSON.stringify(decision.alternatives)]
    );
  }

  /**
   * Update execution metrics
   * @param dex - DEX used for execution
   * @param success - Whether execution was successful
   */
  private async updateMetrics(dex: string, success: boolean): Promise<void> {
    await this.redis.incr('stats:total_orders');
    
    if (success) {
      await this.redis.incr('stats:successful_orders');
      if (dex) {
        await this.redis.incr(`stats:${dex}_routed`);
      }
    } else {
      await this.redis.incr('stats:failed_orders');
    }
  }

  /**
   * Get comprehensive metrics
   * @returns Promise<Record<string, number>> - Metrics data
   */
  public async getMetrics(): Promise<Record<string, number>> {
    const [total, successful, failed, raydium, meteora] = await Promise.all([
      this.redis.get('stats:total_orders'),
      this.redis.get('stats:successful_orders'),
      this.redis.get('stats:failed_orders'),
      this.redis.get('stats:raydium_routed'),
      this.redis.get('stats:meteora_routed')
    ]);

    const totalOrders = parseInt(total || '0');
    const successfulOrders = parseInt(successful || '0');

    return {
      totalOrders,
      successfulOrders,
      failedOrders: parseInt(failed || '0'),
      raydiumRouted: parseInt(raydium || '0'),
      meteoraRouted: parseInt(meteora || '0'),
      successRate: totalOrders > 0 ? (successfulOrders / totalOrders) * 100 : 0
    };
  }

  /**
   * Get order by ID
   * @param orderId - Order identifier
   * @returns Promise<Order | null> - Order data
   */
  public async getOrder(orderId: string): Promise<Order | null> {
    try {
      const result = await this.pgPool.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        id: row.id,
        type: row.type,
        tokenIn: row.token_in,
        tokenOut: row.token_out,
        amountIn: parseFloat(row.amount_in),
        slippage: parseFloat(row.slippage),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        executionData: row.execution_data,
        userId: row.user_id
      };
    } catch (error) {
      logger.logError(orderId, error, { context: 'Get order' });
      throw error;
    }
  }

  /**
   * Get order events
   * @param orderId - Order identifier
   * @returns Promise<Array<any>> - Order events
   */
  public async getOrderEvents(orderId: string): Promise<Array<any>> {
    const result = await this.pgPool.query(
      'SELECT * FROM order_events WHERE order_id = $1 ORDER BY timestamp ASC',
      [orderId]
    );
    
    return result.rows;
  }

  /**
   * Utility method to simulate processing delays
   * @param ms - Delay in milliseconds
   * @returns Promise<void>
   */
  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close all connections and cleanup resources
   */
  public async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    logger.getLogger().info('Order processor closed');
  }
}
