// Test setup file
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Mock external dependencies
jest.mock('ioredis', () => {
  const mockRedis = {
    on: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    hset: jest.fn().mockResolvedValue(1),
    hget: jest.fn().mockResolvedValue('test'),
    incr: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue('0'),
    quit: jest.fn().mockResolvedValue('OK'),
  };
  return jest.fn(() => mockRedis);
});

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
    query: jest.fn().mockResolvedValue({ rows: [] }),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  })),
}));

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'test-job-id' }),
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock Fastify
jest.mock('fastify', () => {
  const mockFastify = {
    register: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    listen: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    setErrorHandler: jest.fn(),
    log: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  };
  return jest.fn(() => mockFastify);
});

// Mock WebSocket
jest.mock('@fastify/websocket', () => jest.fn());

// Mock CORS
jest.mock('@fastify/cors', () => jest.fn());

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    logPerformance: jest.fn(),
    logError: jest.fn(),
    logOrderEvent: jest.fn(),
    logRoutingDecision: jest.fn(),
    logExecutionResult: jest.fn(),
    getLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Global test timeout
jest.setTimeout(30000);

// Suppress console logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}; 