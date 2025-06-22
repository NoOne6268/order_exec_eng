// src/types/order.ts
export interface Order {
  id: string;
  type: OrderType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  slippage: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt?: Date;
  executionData?: ExecutionData;
  userId?: string;
}

export type OrderType = 'market' | 'limit' | 'sniper';

export type OrderStatus = 
  | 'pending' 
  | 'routing' 
  | 'building' 
  | 'submitted' 
  | 'confirmed' 
  | 'failed';

export interface ExecutionData {
  txHash?: string;
  executedPrice?: number;
  dex?: string;
  gasUsed?: number;
  error?: string;
}

// src/types/dex.ts
export interface DexQuote {
  dex: DexName;
  price: number;
  fee: number;
  liquidity: number;
  estimatedGas: number;
  timestamp: Date;
}

export type DexName = 'raydium' | 'meteora';

export interface SwapResult {
  txHash: string;
  executedPrice: number;
  gasUsed: number;
  slippageImpact: number;
}
