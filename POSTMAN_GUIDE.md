# Postman Collection Guide for Order Execution Engine

This guide explains how to use the Postman collection to test and interact with the Order Execution Engine API.

## 📦 Files Included

1. **`Order_Execution_Engine_API.postman_collection.json`** - Main API collection
2. **`Order_Execution_Engine_Environment.postman_environment.json`** - Environment variables
3. **`POSTMAN_GUIDE.md`** - This guide

## 🚀 Quick Setup

### 1. Import Collection and Environment

1. Open Postman
2. Click **Import** button
3. Import both files:
   - `Order_Execution_Engine_API.postman_collection.json`
   - `Order_Execution_Engine_Environment.postman_environment.json`

### 2. Select Environment

1. In the top-right corner, select **"Order Execution Engine - Local"** environment
2. Verify the `baseUrl` is set to `http://localhost:3000`

### 3. Start Your Server

```bash
npm run dev
```

## 📋 Collection Structure

The collection is organized into 5 main folders:

### 1. Health & System
- **Health Check** - Verify system health
- **API Documentation** - Access OpenAPI docs

### 2. Order Management
- **Submit Order** - Create new market orders
- **Get Order Status** - Check order details
- **List Orders** - Get paginated order list
- **Get Order Events** - View order timeline
- **Cancel Order** - Cancel pending orders

### 3. Metrics & Monitoring
- **Get All Metrics** - Comprehensive system metrics
- **Get Routing Metrics** - DEX routing statistics
- **Get Performance Metrics** - Performance data
- **Get System Health** - Detailed health checks

### 4. WebSocket Examples
- **WebSocket Connection Info** - WebSocket endpoint documentation

### 5. Example Orders
- **Market Order - SOL to USDC** - Example swap
- **Market Order - USDC to SOL** - Reverse swap
- **Market Order - High Slippage** - Volatile market example

## 🔧 Environment Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `baseUrl` | API base URL | `http://localhost:3000` |
| `orderId` | Current order ID (auto-populated) | `""` |
| `userId` | Test user ID | `test-user-123` |
| `tokenIn` | Input token | `SOL` |
| `tokenOut` | Output token | `USDC` |
| `amountIn` | Order amount | `1.5` |
| `slippage` | Slippage tolerance | `0.01` |

## 🧪 Testing Workflow

### Step 1: Verify System Health
1. Run **Health Check** to ensure all services are running
2. Check **API Documentation** to explore available endpoints

### Step 2: Submit an Order
1. Use **Submit Order** or any **Example Order**
2. The response will include an `orderId`
3. This `orderId` is automatically saved to the environment

### Step 3: Monitor Order Status
1. Use **Get Order Status** to check current status
2. Use **Get Order Events** to see the complete timeline
3. The `orderId` variable is automatically populated

### Step 4: Check Metrics
1. Use **Get All Metrics** for overview
2. Use **Get Routing Metrics** for DEX decisions
3. Use **Get Performance Metrics** for system performance

## 📡 WebSocket Testing

### Using Postman WebSocket Support
1. Create a new WebSocket request in Postman
2. Use URL: `ws://localhost:3000/ws/orders/{orderId}`
3. Replace `{orderId}` with an actual order ID

### Using Browser Console
```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/ws/orders/your-order-id');

// Listen for messages
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Order update:', data);
};

// Connection events
ws.onopen = () => console.log('Connected to order updates');
ws.onclose = () => console.log('Disconnected from order updates');
ws.onerror = (error) => console.error('WebSocket error:', error);
```

## 🔄 Automated Testing

The collection includes automated test scripts that:

### Pre-request Scripts
- Auto-generate order IDs if not set
- Set up test data

### Test Scripts
- Verify status codes (200)
- Check response times (< 1000ms)
- Validate JSON headers
- Auto-extract order IDs from responses

## 📊 Example API Responses

### Submit Order Response
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Order submitted successfully",
  "websocketUrl": "/ws/orders/550e8400-e29b-41d4-a716-446655440000"
}
```

### Order Status Response
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "confirmed",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:05Z",
  "executionData": {
    "txHash": "0x1234567890abcdef",
    "executedPrice": 100.50,
    "dex": "raydium",
    "gasUsed": 0.0001
  },
  "events": [
    {
      "status": "pending",
      "timestamp": "2024-01-01T00:00:00Z",
      "data": {}
    },
    {
      "status": "routing",
      "timestamp": "2024-01-01T00:00:01Z",
      "data": {
        "raydiumPrice": 100.45,
        "meteoraPrice": 100.55
      }
    }
  ]
}
```

### Metrics Response
```json
{
  "orders": {
    "total": 150,
    "successful": 142,
    "failed": 8,
    "successRate": 94.67
  },
  "routing": {
    "raydium": 85,
    "meteora": 57,
    "totalRouted": 142
  },
  "performance": {
    "averageProcessingTime": 2.3,
    "queueSize": 5,
    "activeWorkers": 3
  },
  "recentActivity": {
    "lastHour": 12,
    "last24Hours": 45,
    "last7Days": 150
  }
}
```

## 🚨 Common Issues & Solutions

### 1. Connection Refused
- **Issue**: Can't connect to `localhost:3000`
- **Solution**: Ensure the server is running with `npm run dev`

### 2. Order Not Found
- **Issue**: 404 error when getting order status
- **Solution**: Verify the `orderId` is correct and the order exists

### 3. Invalid Request Body
- **Issue**: 400 error when submitting orders
- **Solution**: Check that all required fields are present and valid

### 4. WebSocket Connection Failed
- **Issue**: Can't connect to WebSocket
- **Solution**: Ensure the order ID is valid and the server supports WebSockets

## 🔧 Customization

### Adding New Environments
1. Duplicate the environment
2. Change `baseUrl` to your server URL
3. Update other variables as needed

### Adding New Tests
1. Create new requests in the collection
2. Add test scripts to validate responses
3. Use environment variables for dynamic data

### Running Collection
1. Use **Runner** to execute multiple requests
2. Set up data files for bulk testing
3. Configure iterations and delays

## 📈 Performance Testing

### Load Testing Setup
1. Use Postman Runner with multiple iterations
2. Set delays between requests
3. Monitor server metrics during testing

### Example Load Test
```bash
# Run collection with 100 iterations
newman run Order_Execution_Engine_API.postman_collection.json \
  --environment Order_Execution_Engine_Environment.postman_environment.json \
  --iteration-count 100 \
  --delay-request 1000
```

## 🔐 Security Testing

### Authentication (if added)
1. Add authorization headers to requests
2. Test with invalid tokens
3. Verify proper error responses

### Input Validation
1. Test with invalid order parameters
2. Verify proper error messages
3. Check for SQL injection attempts

## 📝 Best Practices

1. **Always check system health first**
2. **Use environment variables for dynamic data**
3. **Test both success and error scenarios**
4. **Monitor metrics during testing**
5. **Use WebSocket for real-time updates**
6. **Keep collection updated with API changes**

## 🆘 Support

If you encounter issues:

1. Check the server logs
2. Verify environment variables
3. Test with curl commands
4. Review the API documentation
5. Check the troubleshooting section in the README

---

**Happy Testing! 🚀** 