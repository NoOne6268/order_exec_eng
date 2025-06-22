import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OrderProcessor } from '../services/orderProcessor';
import { logger } from '../utils/logger';

/**
 * Metrics response interface
 */
interface MetricsResponse {
  orders: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
  routing: {
    raydium: number;
    meteora: number;
    totalRouted: number;
  };
  performance: {
    averageProcessingTime: number;
    queueSize: number;
    activeWorkers: number;
  };
  recentActivity: {
    lastHour: number;
    last24Hours: number;
    last7Days: number;
  };
}

/**
 * Register metrics routes with Fastify
 * @param fastify - Fastify instance
 * @param options - Route options containing services
 */
export async function metricsRoutes(
  fastify: FastifyInstance,
  options: {
    orderProcessor: OrderProcessor;
  }
): Promise<void> {
  const { orderProcessor } = options;

  /**
   * GET /api/metrics
   * Get comprehensive system metrics
   */
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get basic metrics from Redis
      const basicMetrics = await orderProcessor.getMetrics();

      // Get additional metrics from database
      const pgPool = orderProcessor['pgPool'];
      
      // Get recent activity metrics
      const [lastHour, last24Hours, last7Days] = await Promise.all([
        pgPool.query(
          'SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL \'1 hour\''
        ),
        pgPool.query(
          'SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL \'24 hours\''
        ),
        pgPool.query(
          'SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL \'7 days\''
        )
      ]);

      // Get average processing time
      const avgTimeResult = await pgPool.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_time
        FROM orders 
        WHERE status IN ('confirmed', 'failed') 
        AND updated_at IS NOT NULL
      `);

      // Get queue statistics
      const queueStats = await orderProcessor['queue'].getJobCounts();

      // Get routing statistics from database
      const routingStats = await pgPool.query(`
        SELECT 
          selected_dex,
          COUNT(*) as count
        FROM routing_decisions 
        GROUP BY selected_dex
      `);

      const raydiumCount = routingStats.rows.find((row: any) => row.selected_dex === 'raydium')?.count || 0;
      const meteoraCount = routingStats.rows.find((row: any) => row.selected_dex === 'meteora')?.count || 0;

      const response: MetricsResponse = {
        orders: {
          total: basicMetrics.totalOrders,
          successful: basicMetrics.successfulOrders,
          failed: basicMetrics.failedOrders,
          successRate: basicMetrics.successRate
        },
        routing: {
          raydium: parseInt(raydiumCount),
          meteora: parseInt(meteoraCount),
          totalRouted: parseInt(raydiumCount) + parseInt(meteoraCount)
        },
        performance: {
          averageProcessingTime: parseFloat(avgTimeResult.rows[0]?.avg_time || '0'),
          queueSize: queueStats.waiting + queueStats.active + queueStats.delayed,
          activeWorkers: queueStats.active
        },
        recentActivity: {
          lastHour: parseInt(lastHour.rows[0].count),
          last24Hours: parseInt(last24Hours.rows[0].count),
          last7Days: parseInt(last7Days.rows[0].count)
        }
      };

      logger.getLogger().info('Metrics requested', {
        totalOrders: response.orders.total,
        successRate: response.orders.successRate
      });

      return reply.status(200).send(response);

    } catch (error) {
      logger.logError(null, error, { context: 'Metrics endpoint' });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve metrics'
      });
    }
  });

  /**
   * GET /api/metrics/routing
   * Get detailed DEX routing statistics
   */
  fastify.get('/routing', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const pgPool = orderProcessor['pgPool'];

      // Get routing decisions with reasons
      const routingDecisions = await pgPool.query(`
        SELECT 
          selected_dex,
          COUNT(*) as count,
          AVG(price) as avg_price,
          AVG(fee) as avg_fee,
          COUNT(CASE WHEN reason LIKE '%better total cost%' THEN 1 END) as cost_based_decisions,
          COUNT(CASE WHEN reason LIKE '%higher liquidity%' THEN 1 END) as liquidity_based_decisions
        FROM routing_decisions 
        GROUP BY selected_dex
      `);

      // Get recent routing decisions
      const recentDecisions = await pgPool.query(`
        SELECT 
          order_id,
          selected_dex,
          price,
          fee,
          reason,
          timestamp
        FROM routing_decisions 
        ORDER BY timestamp DESC 
        LIMIT 10
      `);

      const response = {
        summary: routingDecisions.rows.map((row: any) => ({
          dex: row.selected_dex,
          count: parseInt(row.count),
          averagePrice: parseFloat(row.avg_price),
          averageFee: parseFloat(row.avg_fee),
          costBasedDecisions: parseInt(row.cost_based_decisions),
          liquidityBasedDecisions: parseInt(row.liquidity_based_decisions)
        })),
        recentDecisions: recentDecisions.rows.map((row: any) => ({
          orderId: row.order_id,
          dex: row.selected_dex,
          price: parseFloat(row.price),
          fee: parseFloat(row.fee),
          reason: row.reason,
          timestamp: row.timestamp
        }))
      };

      return reply.status(200).send(response);

    } catch (error) {
      logger.logError(null, error, { context: 'Routing metrics endpoint' });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve routing metrics'
      });
    }
  });

  /**
   * GET /api/metrics/performance
   * Get detailed performance metrics
   */
  fastify.get('/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const pgPool = orderProcessor['pgPool'];

      // Get processing time distribution
      const processingTimes = await pgPool.query(`
        SELECT 
          status,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_time,
          MIN(EXTRACT(EPOCH FROM (updated_at - created_at))) as min_time,
          MAX(EXTRACT(EPOCH FROM (updated_at - created_at))) as max_time
        FROM orders 
        WHERE updated_at IS NOT NULL
        GROUP BY status
      `);

      // Get hourly activity for the last 24 hours
      const hourlyActivity = await pgPool.query(`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as count
        FROM orders 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY hour
        ORDER BY hour
      `);

      // Get queue statistics
      const queueStats = await orderProcessor['queue'].getJobCounts();

      const response = {
        processingTimes: processingTimes.rows.map((row: any) => ({
          status: row.status,
          count: parseInt(row.count),
          averageTime: parseFloat(row.avg_time || '0'),
          minTime: parseFloat(row.min_time || '0'),
          maxTime: parseFloat(row.max_time || '0')
        })),
        hourlyActivity: hourlyActivity.rows.map((row: any) => ({
          hour: row.hour,
          count: parseInt(row.count)
        })),
        queue: {
          waiting: queueStats.waiting,
          active: queueStats.active,
          completed: queueStats.completed,
          failed: queueStats.failed,
          delayed: queueStats.delayed
        }
      };

      return reply.status(200).send(response);

    } catch (error) {
      logger.logError(null, error, { context: 'Performance metrics endpoint' });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve performance metrics'
      });
    }
  });

  /**
   * GET /api/metrics/health
   * Get system health status
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const healthChecks = await Promise.allSettled([
        // Check Redis connection
        orderProcessor['redis'].ping(),
        // Check PostgreSQL connection
        orderProcessor['pgPool'].query('SELECT 1'),
        // Check queue health
        orderProcessor['queue'].getJobCounts()
      ]);

      const redisHealthy = healthChecks[0].status === 'fulfilled';
      const postgresHealthy = healthChecks[1].status === 'fulfilled';
      const queueHealthy = healthChecks[2].status === 'fulfilled';

      const overallHealth = redisHealthy && postgresHealthy && queueHealthy;

      const response = {
        status: overallHealth ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          redis: {
            status: redisHealthy ? 'healthy' : 'unhealthy',
            error: healthChecks[0].status === 'rejected' ? (healthChecks[0] as any).reason?.message : null
          },
          postgres: {
            status: postgresHealthy ? 'healthy' : 'unhealthy',
            error: healthChecks[1].status === 'rejected' ? (healthChecks[1] as any).reason?.message : null
          },
          queue: {
            status: queueHealthy ? 'healthy' : 'unhealthy',
            error: healthChecks[2].status === 'rejected' ? (healthChecks[2] as any).reason?.message : null
          }
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
      };

      const statusCode = overallHealth ? 200 : 503;
      return reply.status(statusCode).send(response);

    } catch (error) {
      logger.logError(null, error, { context: 'Health check endpoint' });
      
      return reply.status(503).send({
        status: 'unhealthy',
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
