import { WebSocketManager } from '../../src/services/websocketManager';
import { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../src/utils/logger');

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;
  let mockFastify: jest.Mocked<FastifyInstance>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock Fastify instance
    mockFastify = {
      get: jest.fn(),
      register: jest.fn().mockResolvedValue(undefined),
      listen: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      setErrorHandler: jest.fn(),
      log: {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    } as any;

    wsManager = new WebSocketManager();
  });

  describe('setFastifyInstance', () => {
    it('should set the Fastify instance', () => {
      wsManager.setFastifyInstance(mockFastify);

      expect(wsManager['fastifyInstance']).toBe(mockFastify);
    });
  });

  describe('registerWebSocketRoute', () => {
    it('should register WebSocket route for order', () => {
      wsManager.setFastifyInstance(mockFastify);

      wsManager.registerWebSocketRoute('test-order-123');

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/ws/orders/test-order-123',
        { websocket: true },
        expect.any(Function)
      );
    });

    it('should throw error if Fastify instance not set', () => {
      expect(() => {
        wsManager.registerWebSocketRoute('test-order-123');
      }).toThrow('Fastify instance not set');
    });
  });

  describe('handleWebSocketConnection', () => {
    it('should handle new WebSocket connection', () => {
      const mockSocket = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('test-order-123');

      // Get the registered handler
      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket, mockRequest);
      }

      // Verify connection is stored
      expect(wsManager['connections'].has('test-order-123')).toBe(true);

      // Verify initial message is sent
      const sent = mockSocket.socket.send.mock.calls[0][0];
      const parsed = JSON.parse(sent);
      expect(parsed.orderId).toBe('test-order-123');
      expect(parsed.status).toBe('connected');
      expect(typeof parsed.timestamp).toBe('string');
    });

    it('should handle connection close', () => {
      const mockSocket = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('test-order-123');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket, mockRequest);
      }

      // Simulate connection close
      const closeHandler = mockSocket.socket.on.mock.calls.find(
        (call: any) => call[0] === 'close'
      )?.[1];
      if (closeHandler) closeHandler();

      // Verify connection is removed
      expect(wsManager['connections'].has('test-order-123')).toBe(false);
    });

    it('should handle connection errors', () => {
      const mockSocket = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('test-order-123');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket, mockRequest);
      }

      // Simulate connection error
      const errorHandler = mockSocket.socket.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      if (errorHandler) errorHandler(new Error('Connection error'));

      // Verify connection is removed
      expect(wsManager['connections'].has('test-order-123')).toBe(false);
    });

    it('should handle incoming messages', () => {
      const mockSocket = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('test-order-123');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket, mockRequest);
      }

      // Simulate incoming message
      const messageHandler = mockSocket.socket.on.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];
      if (messageHandler) {
        const testMessage = JSON.stringify({ type: 'ping' });
        messageHandler(Buffer.from(testMessage));
      }

      // Verify message is processed (no errors thrown)
      expect(mockSocket.socket.send).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('should send message to specific order connection', () => {
      const mockSocket = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('test-order-123');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket, mockRequest);
      }

      const testMessage = {
        orderId: 'test-order-123',
        status: 'confirmed',
        data: { txHash: '0x123' },
        timestamp: new Date(),
      };

      wsManager.sendMessage('test-order-123', testMessage);

      expect(mockSocket.socket.send).toHaveBeenCalledWith(
        JSON.stringify(testMessage)
      );
    });

    it('should handle missing connection gracefully', () => {
      const testMessage = {
        orderId: 'non-existent',
        status: 'confirmed',
        timestamp: new Date(),
      };

      // Should not throw error
      expect(() => {
        wsManager.sendMessage('non-existent', testMessage);
      }).not.toThrow();
    });

    it('should handle send errors and remove connection', () => {
      const mockSocket = {
        socket: {
          on: jest.fn(),
          send: jest.fn().mockImplementation(() => {
            throw new Error('Send error');
          }),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('test-order-123');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket, mockRequest);
      }

      const testMessage = {
        orderId: 'test-order-123',
        status: 'confirmed',
        timestamp: new Date(),
      };

      wsManager.sendMessage('test-order-123', testMessage);

      // Verify connection is removed due to error
      expect(wsManager['connections'].has('test-order-123')).toBe(false);
    });
  });

  describe('emitToOrder', () => {
    it('should emit status update to order', () => {
      const mockSocket = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('test-order-123');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket, mockRequest);
      }

      wsManager.emitToOrder('test-order-123', 'confirmed', { txHash: '0x123' });

      // Find the last call to send (should be the confirmed status)
      const sent = mockSocket.socket.send.mock.calls.find((call: any) => call[0].includes('confirmed'))[0];
      const parsed = JSON.parse(sent);
      expect(parsed.orderId).toBe('test-order-123');
      expect(parsed.status).toBe('confirmed');
      expect(parsed.data).toEqual({ txHash: '0x123' });
      expect(typeof parsed.timestamp).toBe('string');
    });
  });

  describe('broadcast', () => {
    it('should broadcast message to all connections', () => {
      const mockSocket1 = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockSocket2 = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('order-1');
      wsManager.registerWebSocketRoute('order-2');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket1, mockRequest);
      }

      const registeredHandler2 = mockFastify.get.mock.calls[1]?.[2] as Function;
      expect(typeof registeredHandler2).toBe('function');
      if (typeof registeredHandler2 === 'function') {
        registeredHandler2.call(mockFastify, mockSocket2, mockRequest);
      }

      const broadcastMessage = {
        status: 'system_maintenance',
        data: { message: 'Scheduled maintenance' },
        timestamp: new Date(),
      };

      wsManager.broadcast(broadcastMessage);

      expect(mockSocket1.socket.send).toHaveBeenCalledWith(
        JSON.stringify(broadcastMessage)
      );
      expect(mockSocket2.socket.send).toHaveBeenCalledWith(
        JSON.stringify(broadcastMessage)
      );
    });

    it('should handle broadcast errors gracefully', () => {
      const mockSocket1 = {
        socket: {
          on: jest.fn(),
          send: jest.fn().mockImplementation(() => {
            throw new Error('Send error');
          }),
          close: jest.fn(),
        },
      } as any;

      const mockSocket2 = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('order-1');
      wsManager.registerWebSocketRoute('order-2');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket1, mockRequest);
      }

      const registeredHandler2 = mockFastify.get.mock.calls[1]?.[2] as Function;
      expect(typeof registeredHandler2).toBe('function');
      if (typeof registeredHandler2 === 'function') {
        registeredHandler2.call(mockFastify, mockSocket2, mockRequest);
      }

      const broadcastMessage = {
        status: 'system_maintenance',
        timestamp: new Date(),
      };

      // Should not throw error
      expect(() => {
        wsManager.broadcast(broadcastMessage);
      }).not.toThrow();

      // Verify working connection still receives message
      expect(mockSocket2.socket.send).toHaveBeenCalledWith(
        JSON.stringify(broadcastMessage)
      );

      // Verify failed connection is removed
      expect(wsManager['connections'].has('order-1')).toBe(false);
    });
  });

  describe('getConnectionStats', () => {
    it('should return connection statistics', () => {
      const mockSocket1 = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockSocket2 = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('order-1');
      wsManager.registerWebSocketRoute('order-2');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket1, mockRequest);
      }

      const registeredHandler2 = mockFastify.get.mock.calls[1]?.[2] as Function;
      expect(typeof registeredHandler2).toBe('function');
      if (typeof registeredHandler2 === 'function') {
        registeredHandler2.call(mockFastify, mockSocket2, mockRequest);
      }

      const stats = wsManager.getConnectionStats();

      expect(stats.totalConnections).toBe(2);
      expect(stats.connections).toHaveLength(2);
      expect(stats.connections[0]).toHaveProperty('orderId');
      expect(stats.connections[0]).toHaveProperty('connectedAt');
    });

    it('should return empty stats when no connections', () => {
      const stats = wsManager.getConnectionStats();

      expect(stats.totalConnections).toBe(0);
      expect(stats.connections).toHaveLength(0);
    });
  });

  describe('closeAllConnections', () => {
    it('should close all WebSocket connections', () => {
      const mockSocket1 = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockSocket2 = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('order-1');
      wsManager.registerWebSocketRoute('order-2');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket1, mockRequest);
      }

      const registeredHandler2 = mockFastify.get.mock.calls[1]?.[2] as Function;
      expect(typeof registeredHandler2).toBe('function');
      if (typeof registeredHandler2 === 'function') {
        registeredHandler2.call(mockFastify, mockSocket2, mockRequest);
      }

      wsManager.closeAllConnections();

      expect(mockSocket1.socket.close).toHaveBeenCalled();
      expect(mockSocket2.socket.close).toHaveBeenCalled();
      expect(wsManager['connections'].size).toBe(0);
    });

    it('should handle close errors gracefully', () => {
      const mockSocket = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn().mockImplementation(() => {
            throw new Error('Close error');
          }),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('order-1');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket, mockRequest);
      }

      // Should not throw error
      expect(() => {
        wsManager.closeAllConnections();
      }).not.toThrow();

      expect(wsManager['connections'].size).toBe(0);
    });
  });

  describe('hasConnection', () => {
    it('should return true for existing connection', () => {
      const mockSocket = {
        socket: {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        },
      } as any;

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      } as any;

      wsManager.setFastifyInstance(mockFastify);
      wsManager.registerWebSocketRoute('test-order-123');

      const registeredHandler = mockFastify.get.mock.calls[0]?.[2] as Function;
      expect(typeof registeredHandler).toBe('function');
      if (typeof registeredHandler === 'function') {
        registeredHandler.call(mockFastify, mockSocket, mockRequest);
      }

      expect(wsManager.hasConnection('test-order-123')).toBe(true);
    });

    it('should return false for non-existent connection', () => {
      expect(wsManager.hasConnection('non-existent')).toBe(false);
    });
  });
}); 