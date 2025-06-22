import { OrderProcessor } from '../../src/services/orderProcessor';
import { WebSocketManager } from '../../src/services/websocketManager';
import { Order, OrderStatus } from '../../src/types/order';
import { MockDexRouter } from '../../src/services/mockDexRouter';

// Mock dependencies
jest.mock('../../src/services/websocketManager');
jest.mock('../../src/services/mockDexRouter');
jest.mock('../../src/config/database');
jest.mock('../../src/utils/logger');

describe('OrderProcessor', () => {
  let orderProcessor: OrderProcessor;
  let mockWsManager: jest.Mocked<WebSocketManager>;
  let mockOrder: Order;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock WebSocket manager
    mockWsManager = {
      emitToOrder: jest.fn(),
      registerWebSocketRoute: jest.fn(),
      setFastifyInstance: jest.fn(),
      sendMessage: jest.fn(),
      broadcast: jest.fn(),
      getConnectionStats: jest.fn(),
      closeAllConnections: jest.fn(),
      hasConnection: jest.fn(),
    } as any;

    // Create order processor
    orderProcessor = new OrderProcessor(mockWsManager);

    // Mock Redis and PostgreSQL
    (orderProcessor as any).redis = {
      hset: jest.fn().mockResolvedValue(1),
      hget: jest.fn().mockResolvedValue('test'),
      incr: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue('0'),
    };

    (orderProcessor as any).pgPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    // Mock order
    mockOrder = {
      id: 'test-order-123',
      type: 'market',
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amountIn: 1.5,
      slippage: 0.01,
      status: 'pending',
      createdAt: new Date(),
      userId: 'user123'
    };
  });

  describe('submitOrder', () => {
    it('should submit order to queue successfully', async () => {
      const mockQueue = (orderProcessor as any).queue;
      const mockUpdateStatus = jest.spyOn(orderProcessor as any, 'updateOrderStatus');

      await orderProcessor.submitOrder(mockOrder);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute-order',
        mockOrder,
        expect.objectContaining({
          jobId: mockOrder.id,
          delay: 0
        })
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(mockOrder.id, 'pending');
    });

    it('should persist order to database', async () => {
      const mockPersistOrder = jest.spyOn(orderProcessor as any, 'persistOrder');

      await orderProcessor.submitOrder(mockOrder);

      expect(mockPersistOrder).toHaveBeenCalledWith(mockOrder);
    });

    it('should handle submission errors gracefully', async () => {
      const mockQueue = (orderProcessor as any).queue;
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      await expect(orderProcessor.submitOrder(mockOrder)).rejects.toThrow('Queue error');
    });
  });

  describe('processOrder', () => {
    it('should process order through complete lifecycle', async () => {
      const mockUpdateStatus = jest.spyOn(orderProcessor as any, 'updateOrderStatus');
      const mockPersistRoutingDecision = jest.spyOn(orderProcessor as any, 'persistRoutingDecision');
      const mockUpdateMetrics = jest.spyOn(orderProcessor as any, 'updateMetrics');

      // Mock DEX router responses
      const mockDexRouter = (orderProcessor as any).dexRouter;
      mockDexRouter.getRaydiumQuote.mockResolvedValue({
        dex: 'raydium',
        price: 100,
        fee: 0.0025,
        liquidity: 1000000,
        estimatedGas: 0.0001,
        timestamp: new Date(),
        amountOut: 99.75,
        priceImpact: 0.001
      });

      mockDexRouter.getMeteorQuote.mockResolvedValue({
        dex: 'meteora',
        price: 99,
        fee: 0.002,
        liquidity: 800000,
        estimatedGas: 0.00008,
        timestamp: new Date(),
        amountOut: 98.802,
        priceImpact: 0.0008
      });

      mockDexRouter.selectBestDex.mockReturnValue({
        dex: 'meteora',
        price: 99,
        fee: 0.002,
        estimatedGas: 0.00008,
        reason: 'Better total cost',
        alternatives: []
      });

      mockDexRouter.executeSwap.mockResolvedValue({
        txHash: '0x1234567890abcdef',
        executedPrice: 99.5,
        gasUsed: 0.00008,
        slippageImpact: 0.995,
        dex: 'meteora',
        timestamp: new Date()
      });

      const result = await (orderProcessor as any).processOrder(mockOrder);

      // Verify status updates
      expect(mockUpdateStatus).toHaveBeenCalledWith(mockOrder.id, 'routing');
      expect(mockUpdateStatus).toHaveBeenCalledWith(mockOrder.id, 'building');
      expect(mockUpdateStatus).toHaveBeenCalledWith(mockOrder.id, 'submitted');
      expect(mockUpdateStatus).toHaveBeenCalledWith(mockOrder.id, 'confirmed', expect.any(Object));

      // Verify routing decision persistence
      expect(mockPersistRoutingDecision).toHaveBeenCalled();

      // Verify metrics update
      expect(mockUpdateMetrics).toHaveBeenCalledWith('meteora', true);

      // Verify result
      expect(result).toHaveProperty('txHash');
      expect(result).toHaveProperty('executedPrice');
      expect(result).toHaveProperty('dex', 'meteora');
    });

    it('should handle processing errors and mark order as failed', async () => {
      const mockUpdateStatus = jest.spyOn(orderProcessor as any, 'updateOrderStatus');
      const mockUpdateMetrics = jest.spyOn(orderProcessor as any, 'updateMetrics');

      // Mock DEX router to throw error
      const mockDexRouter = (orderProcessor as any).dexRouter;
      mockDexRouter.getRaydiumQuote.mockRejectedValue(new Error('DEX error'));

      await expect((orderProcessor as any).processOrder(mockOrder)).rejects.toThrow('DEX error');

      expect(mockUpdateStatus).toHaveBeenCalledWith(mockOrder.id, 'failed', expect.any(Object));
      expect(mockUpdateMetrics).toHaveBeenCalledWith('', false);
    });

    it('should log performance metrics', async () => {
      const mockLogPerformance = jest.spyOn(require('../../src/utils/logger').logger, 'logPerformance');

      // Mock successful processing
      const mockDexRouter = (orderProcessor as any).dexRouter;
      mockDexRouter.getRaydiumQuote.mockResolvedValue({
        dex: 'raydium',
        price: 100,
        fee: 0.0025,
        liquidity: 1000000,
        estimatedGas: 0.0001,
        timestamp: new Date(),
        amountOut: 99.75,
        priceImpact: 0.001
      });

      mockDexRouter.getMeteorQuote.mockResolvedValue({
        dex: 'meteora',
        price: 99,
        fee: 0.002,
        liquidity: 800000,
        estimatedGas: 0.00008,
        timestamp: new Date(),
        amountOut: 98.802,
        priceImpact: 0.0008
      });

      mockDexRouter.selectBestDex.mockReturnValue({
        dex: 'meteora',
        price: 99,
        fee: 0.002,
        estimatedGas: 0.00008,
        reason: 'Better total cost',
        alternatives: []
      });

      mockDexRouter.executeSwap.mockResolvedValue({
        txHash: '0x1234567890abcdef',
        executedPrice: 99.5,
        gasUsed: 0.00008,
        slippageImpact: 0.995,
        dex: 'meteora',
        timestamp: new Date()
      });

      await (orderProcessor as any).processOrder(mockOrder);

      expect(mockLogPerformance).toHaveBeenCalledWith(
        'order_processing',
        expect.any(Number),
        expect.objectContaining({
          orderId: mockOrder.id,
          dex: 'meteora'
        })
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('should update status in Redis and PostgreSQL', async () => {
      const mockRedis = (orderProcessor as any).redis;
      const mockPgPool = (orderProcessor as any).pgPool;

      await (orderProcessor as any).updateOrderStatus(mockOrder.id, 'confirmed', { txHash: '0x123' });

      expect(mockRedis.hset).toHaveBeenCalledWith(
        `order:${mockOrder.id}`,
        expect.objectContaining({
          status: 'confirmed',
          executionData: JSON.stringify({ txHash: '0x123' })
        })
      );

      expect(mockPgPool.query).toHaveBeenCalledWith(
        'UPDATE orders SET status = $1, updated_at = $2, execution_data = $3 WHERE id = $4',
        ['confirmed', expect.any(Date), JSON.stringify({ txHash: '0x123' }), mockOrder.id]
      );
    });

    it('should log order events', async () => {
      const mockPgPool = (orderProcessor as any).pgPool;

      await (orderProcessor as any).updateOrderStatus(mockOrder.id, 'routing');

      expect(mockPgPool.query).toHaveBeenCalledWith(
        'INSERT INTO order_events (order_id, status, data) VALUES ($1, $2, $3)',
        [mockOrder.id, 'routing', null]
      );
    });

    it('should emit WebSocket updates', async () => {
      await (orderProcessor as any).updateOrderStatus(mockOrder.id, 'confirmed', { txHash: '0x123' });

      expect(mockWsManager.emitToOrder).toHaveBeenCalledWith(
        mockOrder.id,
        'confirmed',
        { txHash: '0x123' }
      );
    });
  });

  describe('getMetrics', () => {
    it('should return comprehensive metrics', async () => {
      const mockRedis = (orderProcessor as any).redis;
      mockRedis.get
        .mockResolvedValueOnce('100') // total
        .mockResolvedValueOnce('90')  // successful
        .mockResolvedValueOnce('10')  // failed
        .mockResolvedValueOnce('60')  // raydium
        .mockResolvedValueOnce('30'); // meteora

      const metrics = await orderProcessor.getMetrics();

      expect(metrics).toEqual({
        totalOrders: 100,
        successfulOrders: 90,
        failedOrders: 10,
        raydiumRouted: 60,
        meteoraRouted: 30,
        successRate: 90
      });
    });

    it('should handle missing metrics gracefully', async () => {
      const mockRedis = (orderProcessor as any).redis;
      mockRedis.get.mockResolvedValue(null);

      const metrics = await orderProcessor.getMetrics();

      expect(metrics).toEqual({
        totalOrders: 0,
        successfulOrders: 0,
        failedOrders: 0,
        raydiumRouted: 0,
        meteoraRouted: 0,
        successRate: 0
      });
    });
  });

  describe('getOrder', () => {
    it('should return order by ID', async () => {
      const mockPgPool = (orderProcessor as any).pgPool;
      const mockOrderData = {
        id: 'test-order-123',
        type: 'market',
        token_in: 'SOL',
        token_out: 'USDC',
        amount_in: '1.5',
        slippage: '0.01',
        status: 'confirmed',
        created_at: new Date(),
        updated_at: new Date(),
        execution_data: JSON.stringify({ txHash: '0x123' }),
        user_id: 'user123'
      };

      mockPgPool.query.mockResolvedValue({ rows: [mockOrderData] });

      const order = await orderProcessor.getOrder('test-order-123');

      expect(order).toEqual({
        id: 'test-order-123',
        type: 'market',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 1.5,
        slippage: 0.01,
        status: 'confirmed',
        createdAt: mockOrderData.created_at,
        updatedAt: mockOrderData.updated_at,
        executionData: mockOrderData.execution_data,
        userId: 'user123'
      });
    });

    it('should return null for non-existent order', async () => {
      const mockPgPool = (orderProcessor as any).pgPool;
      mockPgPool.query.mockResolvedValue({ rows: [] });

      const order = await orderProcessor.getOrder('non-existent');

      expect(order).toBeNull();
    });
  });

  describe('getOrderEvents', () => {
    it('should return order events timeline', async () => {
      const mockPgPool = (orderProcessor as any).pgPool;
      const mockEvents = [
        { id: 1, order_id: 'test-order-123', status: 'pending', timestamp: new Date() },
        { id: 2, order_id: 'test-order-123', status: 'confirmed', timestamp: new Date() }
      ];

      mockPgPool.query.mockResolvedValue({ rows: mockEvents });

      const events = await orderProcessor.getOrderEvents('test-order-123');

      expect(events).toEqual(mockEvents);
      expect(mockPgPool.query).toHaveBeenCalledWith(
        'SELECT * FROM order_events WHERE order_id = $1 ORDER BY timestamp ASC',
        ['test-order-123']
      );
    });
  });

  describe('close', () => {
    it('should close all connections gracefully', async () => {
      const mockWorker = (orderProcessor as any).worker;
      const mockQueue = (orderProcessor as any).queue;

      await orderProcessor.close();

      expect(mockWorker.close).toHaveBeenCalled();
      expect(mockQueue.close).toHaveBeenCalled();
    });
  });
}); 