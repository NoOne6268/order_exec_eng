import { Pool, PoolConfig } from 'pg';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';

/**
 * Database configuration and connection management
 * Handles both PostgreSQL and Redis connections
 */
export class DatabaseConfig {
  private pgPool!: Pool;
  private redisClient!: IORedis;
  private adminPool!: Pool;

  constructor() {
    this.setupPostgreSQL();
    this.setupRedis();
  }

  /**
   * Initialize PostgreSQL connection pool
   */
  private setupPostgreSQL(): void {
    const config: PoolConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'order_execution',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    // Create admin pool for database creation
    this.adminPool = new Pool({
      ...config,
      database: 'postgres' // Connect to default postgres database
    });

    this.pgPool = new Pool(config);

    this.pgPool.on('error', (err) => {
      logger.logError(null, err, { context: 'PostgreSQL pool error' });
    });

    this.pgPool.on('connect', () => {
      logger.getLogger().info('Connected to PostgreSQL database');
    });
  }

  /**
   * Initialize Redis connection
   */
  private setupRedis(): void {
    this.redisClient = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 30000,
      commandTimeout: 30000,
      keepAlive: 30000,
      family: 4,
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.redisClient.on('error', (err) => {
      logger.logError(null, err, { context: 'Redis connection error' });
    });

    this.redisClient.on('connect', () => {
      logger.getLogger().info('Connected to Redis');
    });

    this.redisClient.on('ready', () => {
      logger.getLogger().info('Redis is ready');
    });

    this.redisClient.on('reconnecting', () => {
      logger.getLogger().warn('Redis reconnecting...');
    });
  }

  /**
   * Get PostgreSQL pool instance
   */
  public getPostgreSQLPool(): Pool {
    return this.pgPool;
  }

  /**
   * Get Redis client instance
   */
  public getRedisClient(): IORedis {
    return this.redisClient;
  }

  /**
   * Create database if it doesn't exist
   */
  private async createDatabaseIfNotExists(): Promise<void> {
    const dbName = process.env.DB_NAME || 'order_execution';
    
    try {
      // Check if database exists
      const result = await this.adminPool.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [dbName]
      );

      if (result.rows.length === 0) {
        logger.getLogger().info(`Creating database: ${dbName}`);
        await this.adminPool.query(`CREATE DATABASE "${dbName}"`);
        logger.getLogger().info(`Database ${dbName} created successfully`);
      } else {
        logger.getLogger().info(`Database ${dbName} already exists`);
      }
    } catch (error) {
      logger.logError(null, error, { context: 'Database creation' });
      throw error;
    }
  }

  /**
   * Initialize database tables
   */
  public async initializeTables(): Promise<void> {
    try {
      // First, ensure database exists
      await this.createDatabaseIfNotExists();
      
      // Close admin pool as it's no longer needed
      await this.adminPool.end();
      
      const client = await this.pgPool.connect();
      
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS orders (
            id VARCHAR(255) PRIMARY KEY,
            type VARCHAR(50) NOT NULL,
            token_in VARCHAR(255) NOT NULL,
            token_out VARCHAR(255) NOT NULL,
            amount_in DECIMAL(20, 8) NOT NULL,
            slippage DECIMAL(5, 4) NOT NULL,
            status VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            execution_data JSONB,
            user_id VARCHAR(255)
          );

          CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
          CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
          CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

          CREATE TABLE IF NOT EXISTS order_events (
            id SERIAL PRIMARY KEY,
            order_id VARCHAR(255) NOT NULL,
            status VARCHAR(50) NOT NULL,
            data JSONB,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id)
          );

          CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
          CREATE INDEX IF NOT EXISTS idx_order_events_timestamp ON order_events(timestamp);

          CREATE TABLE IF NOT EXISTS routing_decisions (
            id SERIAL PRIMARY KEY,
            order_id VARCHAR(255) NOT NULL,
            selected_dex VARCHAR(50) NOT NULL,
            price DECIMAL(20, 8) NOT NULL,
            fee DECIMAL(10, 8) NOT NULL,
            reason TEXT,
            alternatives JSONB,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id)
          );

          CREATE INDEX IF NOT EXISTS idx_routing_decisions_order_id ON routing_decisions(order_id);
          CREATE INDEX IF NOT EXISTS idx_routing_decisions_dex ON routing_decisions(selected_dex);
        `);

        logger.getLogger().info('Database tables initialized successfully');
      } catch (error) {
        logger.logError(null, error, { context: 'Database initialization' });
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.logError(null, error, { context: 'Database setup' });
      throw error;
    }
  }

  /**
   * Close all database connections
   */
  public async close(): Promise<void> {
    try {
      await this.pgPool.end();
      await this.redisClient.quit();
      logger.getLogger().info('Database connections closed');
    } catch (error) {
      logger.logError(null, error, { context: 'Database close' });
    }
  }
}

// Export singleton instance
export const databaseConfig = new DatabaseConfig();
