import { createLogger, format, transports, Logger } from 'winston';

/**
 * Custom logger utility for the Order Execution Engine
 * Provides structured logging with different levels and formats
 */
export class LoggerService {
  private logger: Logger;

  constructor() {
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      defaultMeta: { service: 'order-execution-engine' },
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.simple()
          )
        }),
        new transports.File({ 
          filename: 'logs/error.log', 
          level: 'error' 
        }),
        new transports.File({ 
          filename: 'logs/combined.log' 
        })
      ]
    });
  }

  /**
   * Log order lifecycle events
   * @param orderId - Unique order identifier
   * @param status - Current order status
   * @param data - Additional order data
   */
  public logOrderEvent(orderId: string, status: string, data?: any): void {
    this.logger.info('Order status update', {
      orderId,
      status,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log DEX routing decisions
   * @param orderId - Order identifier
   * @param decision - Routing decision details
   */
  public logRoutingDecision(orderId: string, decision: any): void {
    this.logger.info('DEX routing decision', {
      orderId,
      selectedDex: decision.dex,
      price: decision.price,
      reason: decision.reason,
      alternatives: decision.alternatives?.length || 0
    });
  }

  /**
   * Log execution results
   * @param orderId - Order identifier
   * @param result - Execution result
   */
  public logExecutionResult(orderId: string, result: any): void {
    this.logger.info('Order execution completed', {
      orderId,
      txHash: result.txHash,
      executedPrice: result.executedPrice,
      dex: result.dex,
      success: true
    });
  }

  /**
   * Log errors with context
   * @param orderId - Order identifier (if applicable)
   * @param error - Error object or message
   * @param context - Additional context
   */
  public logError(orderId: string | null, error: any, context?: any): void {
    this.logger.error('Error occurred', {
      orderId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log performance metrics
   * @param operation - Operation name
   * @param duration - Duration in milliseconds
   * @param metadata - Additional metadata
   */
  public logPerformance(operation: string, duration: number, metadata?: any): void {
    this.logger.info('Performance metric', {
      operation,
      duration,
      metadata,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log queue statistics
   * @param stats - Queue statistics
   */
  public logQueueStats(stats: any): void {
    this.logger.info('Queue statistics', {
      ...stats,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get the underlying winston logger
   */
  public getLogger(): Logger {
    return this.logger;
  }
}

// Export singleton instance
export const logger = new LoggerService();
