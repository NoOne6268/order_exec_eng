import { MockDexRouter } from '../../src/services/mockDexRouter';
import { Order } from '../../src/types/order';
import { DexQuote, DexName } from '../../src/types/dex';

describe('MockDexRouter', () => {
  let dexRouter: MockDexRouter;
  let mockOrder: Order;

  beforeEach(() => {
    dexRouter = new MockDexRouter();
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

  describe('getRaydiumQuote', () => {
    it('should return a valid Raydium quote with correct structure', async () => {
      const quote = await dexRouter.getRaydiumQuote('SOL', 'USDC', 1.5);

      expect(quote).toHaveProperty('dex', 'raydium');
      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('fee');
      expect(quote).toHaveProperty('liquidity');
      expect(quote).toHaveProperty('estimatedGas');
      expect(quote).toHaveProperty('timestamp');
      expect(quote).toHaveProperty('amountOut');
      expect(quote).toHaveProperty('priceImpact');
      expect(typeof quote.price).toBe('number');
      expect(typeof quote.fee).toBe('number');
      expect(quote.fee).toBe(0.0025); // 0.25% fee
    });

    it('should return different prices for different amounts', async () => {
      const quote1 = await dexRouter.getRaydiumQuote('SOL', 'USDC', 1.0);
      const quote2 = await dexRouter.getRaydiumQuote('SOL', 'USDC', 2.0);

      expect(quote1.amountOut).not.toBe(quote2.amountOut);
      expect(quote1.priceImpact).not.toBe(quote2.priceImpact);
    });

    it('should calculate amountOut correctly based on price and fees', async () => {
      const quote = await dexRouter.getRaydiumQuote('SOL', 'USDC', 1.0);
      const expectedAmountOut = 1.0 * quote.price * (1 - quote.fee);

      expect(quote.amountOut).toBeCloseTo(expectedAmountOut, 6);
    });
  });

  describe('getMeteorQuote', () => {
    it('should return a valid Meteora quote with correct structure', async () => {
      const quote = await dexRouter.getMeteorQuote('SOL', 'USDC', 1.5);

      expect(quote).toHaveProperty('dex', 'meteora');
      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('fee');
      expect(quote).toHaveProperty('liquidity');
      expect(quote).toHaveProperty('estimatedGas');
      expect(quote).toHaveProperty('timestamp');
      expect(quote).toHaveProperty('amountOut');
      expect(quote).toHaveProperty('priceImpact');
      expect(typeof quote.price).toBe('number');
      expect(typeof quote.fee).toBe('number');
      expect(quote.fee).toBe(0.002); // 0.2% fee
    });

    it('should have lower fees than Raydium', async () => {
      const raydiumQuote = await dexRouter.getRaydiumQuote('SOL', 'USDC', 1.0);
      const meteoraQuote = await dexRouter.getMeteorQuote('SOL', 'USDC', 1.0);

      expect(meteoraQuote.fee).toBeLessThan(raydiumQuote.fee);
    });

    it('should calculate price impact based on amount and liquidity', async () => {
      const quote = await dexRouter.getMeteorQuote('SOL', 'USDC', 1000);
      const expectedImpact = (1000 / 800000) * 0.08;

      expect(quote.priceImpact).toBeCloseTo(expectedImpact, 6);
    });
  });

  describe('selectBestDex', () => {
    it('should select Meteora when it has better total cost', async () => {
      const raydiumQuote: DexQuote = {
        dex: 'raydium',
        price: 100,
        fee: 0.0025,
        liquidity: 1000000,
        estimatedGas: 0.0001,
        timestamp: new Date(),
        amountOut: 99.75,
        priceImpact: 0.001
      };

      const meteoraQuote: DexQuote = {
        dex: 'meteora',
        price: 99,
        fee: 0.002,
        liquidity: 800000,
        estimatedGas: 0.00008,
        timestamp: new Date(),
        amountOut: 98.802,
        priceImpact: 0.0008
      };

      const decision = dexRouter.selectBestDex(raydiumQuote, meteoraQuote, 1.0);

      expect(decision.dex).toBe('meteora');
      expect(decision.reason).toContain('better total cost');
    });

    it('should select Raydium when it has better total cost', async () => {
      const raydiumQuote: DexQuote = {
        dex: 'raydium',
        price: 99,
        fee: 0.0025,
        liquidity: 1000000,
        estimatedGas: 0.0001,
        timestamp: new Date(),
        amountOut: 98.7525,
        priceImpact: 0.001
      };

      const meteoraQuote: DexQuote = {
        dex: 'meteora',
        price: 100,
        fee: 0.002,
        liquidity: 800000,
        estimatedGas: 0.00008,
        timestamp: new Date(),
        amountOut: 99.8,
        priceImpact: 0.0008
      };

      const decision = dexRouter.selectBestDex(raydiumQuote, meteoraQuote, 1.0);

      expect(decision.dex).toBe('raydium');
      expect(decision.reason).toContain('better total cost');
    });

    it('should select based on liquidity when costs are equal', async () => {
      const raydiumQuote: DexQuote = {
        dex: 'raydium',
        price: 100,
        fee: 0.0025,
        liquidity: 1200000,
        estimatedGas: 0.0001,
        timestamp: new Date(),
        amountOut: 99.75,
        priceImpact: 0.001
      };

      const meteoraQuote: DexQuote = {
        dex: 'meteora',
        price: 100,
        fee: 0.0025,
        liquidity: 800000,
        estimatedGas: 0.0001,
        timestamp: new Date(),
        amountOut: 99.75,
        priceImpact: 0.001
      };

      const decision = dexRouter.selectBestDex(raydiumQuote, meteoraQuote, 1.0);

      expect(decision.dex).toBe('raydium');
      expect(decision.reason).toContain('higher liquidity');
    });

    it('should include alternatives in the decision', async () => {
      const raydiumQuote: DexQuote = {
        dex: 'raydium',
        price: 100,
        fee: 0.0025,
        liquidity: 1000000,
        estimatedGas: 0.0001,
        timestamp: new Date(),
        amountOut: 99.75,
        priceImpact: 0.001
      };

      const meteoraQuote: DexQuote = {
        dex: 'meteora',
        price: 99,
        fee: 0.002,
        liquidity: 800000,
        estimatedGas: 0.00008,
        timestamp: new Date(),
        amountOut: 98.802,
        priceImpact: 0.0008
      };

      const decision = dexRouter.selectBestDex(raydiumQuote, meteoraQuote, 1.0);

      expect(decision.alternatives).toHaveLength(2);
      expect(decision.alternatives).toContain(raydiumQuote);
      expect(decision.alternatives).toContain(meteoraQuote);
    });
  });

  describe('executeSwap', () => {
    it('should execute swap and return valid result', async () => {
      const result = await dexRouter.executeSwap('raydium', mockOrder);

      expect(result).toHaveProperty('txHash');
      expect(result).toHaveProperty('executedPrice');
      expect(result).toHaveProperty('gasUsed');
      expect(result).toHaveProperty('slippageImpact');
      expect(result).toHaveProperty('dex', 'raydium');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.txHash).toBe('string');
      expect(result.txHash).toHaveLength(64); // 64 character hex string
      expect(typeof result.executedPrice).toBe('number');
      expect(typeof result.gasUsed).toBe('number');
    });

    it('should return different gas usage for different DEXs', async () => {
      const raydiumResult = await dexRouter.executeSwap('raydium', mockOrder);
      const meteoraResult = await dexRouter.executeSwap('meteora', mockOrder);

      expect(raydiumResult.gasUsed).toBe(0.0001);
      expect(meteoraResult.gasUsed).toBe(0.00008);
    });

    it('should apply slippage to executed price', async () => {
      const result = await dexRouter.executeSwap('raydium', mockOrder);

      // Slippage should be between 1 and 1-slippage
      expect(result.slippageImpact).toBeLessThanOrEqual(1);
      expect(result.slippageImpact).toBeGreaterThanOrEqual(1 - mockOrder.slippage);
    });

    it('should generate unique transaction hashes', async () => {
      const result1 = await dexRouter.executeSwap('raydium', mockOrder);
      const result2 = await dexRouter.executeSwap('meteora', mockOrder);

      expect(result1.txHash).not.toBe(result2.txHash);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full routing and execution flow', async () => {
      // Get quotes from both DEXs
      const raydiumQuote = await dexRouter.getRaydiumQuote('SOL', 'USDC', 1.0);
      const meteoraQuote = await dexRouter.getMeteorQuote('SOL', 'USDC', 1.0);

      // Select best DEX
      const routingDecision = dexRouter.selectBestDex(raydiumQuote, meteoraQuote, 1.0);

      // Execute swap on selected DEX
      const executionResult = await dexRouter.executeSwap(routingDecision.dex, mockOrder);

      // Verify the flow
      expect(routingDecision.dex).toBe(executionResult.dex);
      expect(executionResult.txHash).toBeDefined();
      expect(executionResult.executedPrice).toBeGreaterThan(0);
    });

    it('should handle different token pairs correctly', async () => {
      const solUsdcQuote = await dexRouter.getRaydiumQuote('SOL', 'USDC', 1.0);
      const ethUsdtQuote = await dexRouter.getRaydiumQuote('ETH', 'USDT', 1.0);

      expect(solUsdcQuote.dex).toBe('raydium');
      expect(ethUsdtQuote.dex).toBe('raydium');
      expect(solUsdcQuote.price).not.toBe(ethUsdtQuote.price);
    });
  });
}); 