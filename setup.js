#!/usr/bin/env node

/**
 * Setup script for Order Execution Engine
 * Helps initialize database and verify environment
 */

const { Pool } = require('pg');
const IORedis = require('ioredis');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '5432';
const DB_NAME = process.env.DB_NAME || 'order_execution';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'password';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || '6379';

async function checkPostgreSQL() {
  console.log('🔍 Checking PostgreSQL connection...');
  
  const adminPool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: 'postgres',
    user: DB_USER,
    password: DB_PASSWORD,
  });

  try {
    await adminPool.query('SELECT 1');
    console.log('✅ PostgreSQL connection successful');
    
    // Check if database exists
    const result = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [DB_NAME]
    );

    if (result.rows.length === 0) {
      console.log(`📦 Creating database: ${DB_NAME}`);
      await adminPool.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`✅ Database ${DB_NAME} created successfully`);
    } else {
      console.log(`✅ Database ${DB_NAME} already exists`);
    }

    await adminPool.end();
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    console.log('\n💡 Make sure PostgreSQL is running and credentials are correct');
    console.log('   You can set database credentials in your .env file:');
    console.log('   DB_HOST=localhost');
    console.log('   DB_PORT=5432');
    console.log('   DB_NAME=order_execution');
    console.log('   DB_USER=postgres');
    console.log('   DB_PASSWORD=your_password');
    return false;
  }
}

async function checkRedis() {
  console.log('🔍 Checking Redis connection...');
  
  const redis = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    lazyConnect: true,
  });

  try {
    await redis.ping();
    console.log('✅ Redis connection successful');
    await redis.quit();
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.log('\n💡 Make sure Redis is running');
    console.log('   You can set Redis credentials in your .env file:');
    console.log('   REDIS_HOST=localhost');
    console.log('   REDIS_PORT=6379');
    return false;
  }
}

async function createLogsDirectory() {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
    console.log('✅ Created logs directory');
  } else {
    console.log('✅ Logs directory already exists');
  }
}

async function main() {
  console.log('🚀 Order Execution Engine Setup\n');
  
  // Check if .env file exists
  if (!fs.existsSync('.env')) {
    console.log('📝 Creating .env file from template...');
    if (fs.existsSync('env.example')) {
      fs.copyFileSync('env.example', '.env');
      console.log('✅ .env file created from env.example');
      console.log('   Please edit .env file with your database credentials');
    } else {
      console.log('❌ env.example file not found');
      return;
    }
  }

  // Create logs directory
  await createLogsDirectory();

  // Check database connections
  const pgOk = await checkPostgreSQL();
  const redisOk = await checkRedis();

  console.log('\n📊 Setup Summary:');
  console.log(`   PostgreSQL: ${pgOk ? '✅' : '❌'}`);
  console.log(`   Redis: ${redisOk ? '✅' : '❌'}`);

  if (pgOk && redisOk) {
    console.log('\n🎉 Setup completed successfully!');
    console.log('   You can now start the server with: npm run dev');
  } else {
    console.log('\n⚠️  Setup incomplete. Please fix the issues above before starting the server.');
    process.exit(1);
  }
}

// Run setup
main().catch(console.error); 