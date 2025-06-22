import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { Order, OrderType } from '../types/order';
import { OrderProcessor } from '../services/orderProcessor';
import { WebSocketManager } from '../services/websocketManager';
import { logger } from '../utils/logger';

/**
 * Order execution request interface
 */
interface OrderExecutionRequest {
  type: OrderType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  slippage: number;
  userId?: string;
}

/**
 * Order execution response interface
 */
interface OrderExecutionResponse {
  orderId: string;
  status: string;
  message: string;
  websocketUrl: string;
}

/**
 * Order status response interface
 */
interface OrderStatusResponse {
  orderId: string;
  status: string;
  createdAt: Date;
  updatedAt?: Date;
  executionData?: any;
  events?: Array<any>;
}

/**
 * Register order routes with Fastify
 * @param fastify - Fastify instance
 * @param options - Route options containing services
 */
export async function orderRoutes(
  fastify: FastifyInstance,
  options: {
    orderProcessor: OrderProcessor;
    wsManager: WebSocketManager;
  }
): Promise<void> {
  const { orderProcessor, wsManager } = options;

  /**
   * POST /api/orders/execute
   * Submit a new order for execution
   */
  fastify.post<{ Body: OrderExecutionRequest }>('/execute', {
    schema: {
      body: {
        type: 'object',
        required: ['type', 'tokenIn', 'tokenOut', 'amountIn', 'slippage'],
        properties: {
          type: { type: 'string', enum: ['market', 'limit', 'sniper'] },
          tokenIn: { type: 'string', minLength: 1 },
          tokenOut: { type: 'string', minLength: 1 },
          amountIn: { type: 'number', minimum: 0.000001 },
          slippage: { type: 'number', minimum: 0.001, maximum: 0.5 },
          userId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: OrderExecutionRequest }>, reply: FastifyReply) => {
    try {
      const { type, tokenIn, tokenOut, amountIn, slippage, userId } = request.body;

      // Validate order parameters
      if (amountIn <= 0) {
        return reply.status(400).send({
          error: 'Invalid amount',
          message: 'Amount must be greater than 0'
        });
      }

      if (slippage < 0.001 || slippage > 0.5) {
        return reply.status(400).send({
          error: 'Invalid slippage',
          message: 'Slippage must be between 0.1% and 50%'
        });
      }

      // Generate unique order ID
      const orderId = uuidv4();

      // Create order object
      const order: Order = {
        id: orderId,
        type,
        tokenIn,
        tokenOut,
        amountIn,
        slippage,
        status: 'pending',
        createdAt: new Date(),
        userId
      };

      // Submit order for processing
      await orderProcessor.submitOrder(order);

      // Register WebSocket route for this order
      wsManager.registerWebSocketRoute(orderId);

      const response: OrderExecutionResponse = {
        orderId,
        status: 'pending',
        message: 'Order submitted successfully',
        websocketUrl: `/ws/orders/${orderId}`
      };

      logger.getLogger().info('Order execution request processed', {
        orderId,
        type,
        amountIn,
        userId
      });

      return reply.status(200).send(response);

    } catch (error) {
      logger.logError(null, error, { context: 'Order execution endpoint' });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to submit order for execution'
      });
    }
  });

  /**
   * GET /api/orders/:orderId
   * Get order status and details
   */
  fastify.get<{ Params: { orderId: string } }>('/:orderId', {
    schema: {
      params: {
        type: 'object',
        required: ['orderId'],
        properties: {
          orderId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply) => {
    try {
      const { orderId } = request.params;

      // Get order from database
      const order = await orderProcessor.getOrder(orderId);

      if (!order) {
        return reply.status(404).send({
          error: 'Order not found',
          message: `Order with ID ${orderId} does not exist`
        });
      }

      // Get order events for timeline
      const events = await orderProcessor.getOrderEvents(orderId);

      const response: OrderStatusResponse = {
        orderId: order.id,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        executionData: order.executionData,
        events
      };

      return reply.status(200).send(response);

    } catch (error) {
      logger.logError(request.params.orderId, error, { context: 'Get order endpoint' });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve order details'
      });
    }
  });

  /**
   * GET /api/orders
   * Get list of orders with pagination
   */
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'string', enum: ['pending', 'routing', 'building', 'submitted', 'confirmed', 'failed'] },
          userId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { page?: number; limit?: number; status?: string; userId?: string } }>, reply: FastifyReply) => {
    try {
      const { page = 1, limit = 20, status, userId } = request.query;
      const offset = (page - 1) * limit;

      // Build query with filters
      let query = 'SELECT * FROM orders WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (userId) {
        query += ` AND user_id = $${paramIndex}`;
        params.push(userId);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await orderProcessor['pgPool'].query(query, params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) FROM orders WHERE 1=1';
      const countParams: any[] = [];
      paramIndex = 1;

      if (status) {
        countQuery += ` AND status = $${paramIndex}`;
        countParams.push(status);
        paramIndex++;
      }

      if (userId) {
        countQuery += ` AND user_id = $${paramIndex}`;
        countParams.push(userId);
        paramIndex++;
      }

      const countResult = await orderProcessor['pgPool'].query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      const orders = result.rows.map((row: any) => ({
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
      }));

      return reply.status(200).send({
        orders,
        pagination: {
          page,
          limit,
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      });

    } catch (error) {
      logger.logError(null, error, { context: 'List orders endpoint' });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve orders'
      });
    }
  });

  /**
   * GET /api/orders/:orderId/events
   * Get order events timeline
   */
  fastify.get<{ Params: { orderId: string } }>('/:orderId/events', {
    schema: {
      params: {
        type: 'object',
        required: ['orderId'],
        properties: {
          orderId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply) => {
    try {
      const { orderId } = request.params;

      // Verify order exists
      const order = await orderProcessor.getOrder(orderId);
      if (!order) {
        return reply.status(404).send({
          error: 'Order not found',
          message: `Order with ID ${orderId} does not exist`
        });
      }

      // Get order events
      const events = await orderProcessor.getOrderEvents(orderId);

      return reply.status(200).send({
        orderId,
        events
      });

    } catch (error) {
      logger.logError(request.params.orderId, error, { context: 'Get order events endpoint' });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve order events'
      });
    }
  });

  /**
   * DELETE /api/orders/:orderId
   * Cancel an order (only if it's still pending)
   */
  fastify.delete<{ Params: { orderId: string } }>('/:orderId', {
    schema: {
      params: {
        type: 'object',
        required: ['orderId'],
        properties: {
          orderId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply) => {
    try {
      const { orderId } = request.params;

      // Get order status
      const order = await orderProcessor.getOrder(orderId);
      if (!order) {
        return reply.status(404).send({
          error: 'Order not found',
          message: `Order with ID ${orderId} does not exist`
        });
      }

      // Check if order can be cancelled
      if (order.status !== 'pending') {
        return reply.status(400).send({
          error: 'Cannot cancel order',
          message: `Order is in ${order.status} status and cannot be cancelled`
        });
      }

      // Update order status to cancelled
      await orderProcessor['pgPool'].query(
        'UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3',
        ['cancelled', new Date(), orderId]
      );

      // Log cancellation event
      await orderProcessor['pgPool'].query(
        'INSERT INTO order_events (order_id, status, data) VALUES ($1, $2, $3)',
        [orderId, 'cancelled', JSON.stringify({ reason: 'User cancelled' })]
      );

      logger.getLogger().info('Order cancelled', { orderId });

      return reply.status(200).send({
        message: 'Order cancelled successfully',
        orderId
      });

    } catch (error) {
      logger.logError(request.params.orderId, error, { context: 'Cancel order endpoint' });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to cancel order'
      });
    }
  });
}
