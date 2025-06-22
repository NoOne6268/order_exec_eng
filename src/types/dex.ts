export interface DexQuote {
  dex: DexName;
  price: number;
  fee: number;
  liquidity: number;
  estimatedGas: number;
  timestamp: Date;
  amountOut: number;
  priceImpact: number;
}

export type DexName = 'raydium' | 'meteora';

export interface SwapResult {
  txHash: string;
  executedPrice: number;
  gasUsed: number;
  slippageImpact: number;
  dex: DexName;
  timestamp: Date;
}

export interface RoutingDecision {
  dex: DexName;
  price: number;
  fee: number;
  estimatedGas: number;
  reason: string;
  alternatives: DexQuote[];
}

export interface DexConfig {
  name: DexName;
  baseUrl: string;
  timeout: number;
  retries: number;
}

export interface PoolInfo {
  dex: DexName;
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  reserveIn: number;
  reserveOut: number;
  fee: number;
  lastUpdate: Date;
}
