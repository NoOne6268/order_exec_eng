# Order Execution Engine

A high-performance backend order execution engine for market orders with DEX routing and real-time WebSocket status updates. Built with Node.js, TypeScript, Fastify, BullMQ, Redis, and PostgreSQL.

## Features

- **Multi-DEX Routing**: Intelligent routing between Raydium and Meteora DEXs
- **Real-time Updates**: WebSocket connections for live order status updates
- **Queue Management**: BullMQ-powered job queue for reliable order processing
- **Comprehensive Metrics**: Real-time performance and routing statistics
- **Database Persistence**: PostgreSQL for order history and event logging
- **RESTful API**: Complete REST API with OpenAPI documentation
- **Comprehensive Testing**: Full test suite with 50+ tests covering all components

## Prerequisites

- **Node.js** (v18 or higher)
- **PostgreSQL** (v12 or higher)
- **Redis** (v6 or higher)
- **npm** or **yarn**

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd order_exec_eng
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   # Copy the example environment file
   cp env.example .env
   ```

4. **Configure Environment Variables**
   Edit `.env` with your database and Redis credentials:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=your_username
   DB_PASSWORD=your_password
   DB_NAME=order_execution
   
   # Redis Configuration
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=your_redis_password
   
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

5. **Database Setup**
   ```bash
   # Initialize database and verify connections
   npm run setup
   ```

## Usage

### Starting the Service

**Development Mode (with auto-reload)**
```bash
npm run dev
```

**Production Mode**
```bash
npm run build
npm start
```

**Docker (if available)**
```bash
docker-compose up -d
```

### API Endpoints

Once running, the service will be available at:
- **Server**: http://localhost:3000
- **API Documentation**: http://localhost:3000/
- **Health Check**: http://localhost:3000/health
- **Metrics**: http://localhost:3000/api/metrics

### Core API Endpoints

#### Order Management
```bash
# Submit a new order
POST /api/orders
{
  "type": "market",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": 1.5,
  "slippage": 0.01,
  "userId": "user123"
}

# Get order status
GET /api/orders/{orderId}

# List all orders
GET /api/orders?limit=10&offset=0

# Cancel order
DELETE /api/orders/{orderId}
```

#### WebSocket Connections
```bash
# Connect to order updates
ws://localhost:3000/ws/orders/{orderId}
```

#### Metrics
```bash
# Get system metrics
GET /api/metrics
```

### Testing

**Run all tests**
```bash
npm test
```

**Run tests with coverage**
```bash
npm run test:coverage
```

**Run specific test files**
```bash
npm test -- tests/unit/mockDexRouter.test.ts
```

**Run tests in watch mode**
```bash
npm run test:watch
```

### Test Coverage

The project includes comprehensive tests covering:

- **MockDexRouter** (15 tests): DEX routing logic, quote generation, execution
- **OrderProcessor** (12 tests): Order lifecycle, queue management, metrics
- **WebSocketManager** (12 tests): Connection management, message handling
- **Integration Tests** (11 tests): End-to-end workflows

Total: **50+ tests** with >90% code coverage

## Architecture

### Core Components

1. **OrderProcessor**: Manages order lifecycle and queue processing
2. **MockDexRouter**: Simulates DEX routing between Raydium and Meteora
3. **WebSocketManager**: Handles real-time client connections
4. **Database Layer**: PostgreSQL for persistence, Redis for caching
5. **Queue System**: BullMQ for reliable job processing

### Data Flow

1. **Order Submission**: Client submits order via REST API
2. **Queue Processing**: Order enters BullMQ queue for processing
3. **DEX Routing**: System fetches quotes from multiple DEXs
4. **Execution**: Best DEX is selected and order is executed
5. **Status Updates**: Real-time updates via WebSocket
6. **Persistence**: Order data stored in PostgreSQL

## Configuration

### Database Schema

The system automatically creates these tables:
- `orders`: Order details and status
- `order_events`: Event timeline for each order
- `routing_decisions`: DEX routing history

### Redis Keys

- `order:{orderId}`: Order status and data
- `metrics:total`: Total orders processed
- `metrics:successful`: Successful orders
- `metrics:failed`: Failed orders
- `metrics:raydium`: Orders routed to Raydium
- `metrics:meteora`: Orders routed to Meteora

## Development

### Project Structure
```
order_exec_eng/
├── src/
│   ├── config/          # Database and configuration
│   ├── routes/          # API route handlers
│   ├── services/        # Core business logic
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utilities and logging
├── tests/
│   ├── setup.ts         # Test configuration
│   └── unit/            # Unit tests
├── logs/                # Application logs
└── docs/                # Documentation
```

### Adding New Features

1. **Create types** in `src/types/`
2. **Implement service** in `src/services/`
3. **Add routes** in `src/routes/`
4. **Write tests** in `tests/unit/`
5. **Update documentation**

### Logging

The system uses structured logging with different levels:
- `info`: General application events
- `error`: Error conditions
- `warn`: Warning conditions
- `debug`: Debug information

Logs are written to:
- Console (development)
- `logs/combined.log` (production)
- `logs/error.log` (errors only)

## Monitoring

### Health Checks
```bash
curl http://localhost:3000/health
```

### Metrics Dashboard
```bash
curl http://localhost:3000/api/metrics
```

### Performance Monitoring
The system tracks:
- Order processing time
- DEX routing decisions
- Success/failure rates
- Queue performance

## Troubleshooting

### Common Issues

1. **Port 3000 in use**
   ```bash
   npx kill-port 3000
   # or change PORT in .env
   ```

2. **Database connection failed**
   - Verify PostgreSQL is running
   - Check credentials in `.env`
   - Run `npm run setup` to test connections

3. **Redis connection failed**
   - Verify Redis is running
   - Check Redis credentials
   - Ensure Redis port is accessible

4. **Tests failing**
   - Ensure all dependencies are installed
   - Check test environment variables
   - Run `npm run test:coverage` for detailed output

### Debug Mode

Enable debug logging:
```bash
DEBUG=* npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the API documentation
3. Check existing issues
4. Create a new issue with detailed information 