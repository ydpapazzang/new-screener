export type Exchange = 'upbit' | 'binance' | 'bithumb';
export type StrategyId = 1 | 2 | 3 | 4 | 5;

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ScreenerResult {
  ticker: string;
  exchange: Exchange;
  strategy: StrategyId;
  lastClose: number;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  expectedReturn: number;
  winRate: number;
  signalCount: number;
  strategyDetail?: string;
}

export interface ChartData {
  ohlcv: OHLCV[];
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  indicators: IndicatorLines;
}

export interface IndicatorLines {
  sma60?: number[];
  sma120?: number[];
  ema20?: number[];
  fib618?: number;
  fib50?: number;
  resistance?: number;
  stochK?: number[];
  stochD?: number[];
}

export interface FeeConfig {
  feeRate: number;       // 거래소 수수료 % (편도), 예: 0.05
  slippageRate: number;  // 슬리피지 % (편도), 예: 0.10
}

export interface NetMetrics {
  roundTripCost: number;   // 왕복 총비용 %
  netWinPct: number;       // 익절 시 순수익 %
  netLossPct: number;      // 손절 시 순손실 %
  expectedValue: number;   // 기댓값 EV %
  breakEvenWinRate: number;// 손익분기 최소 승률 %
}

export interface TradeRecord {
  tradeIndex: number;
  date: string;
  outcome: 'win' | 'loss';
  grossReturnPct: number;  // 수수료 전 수익률
  netReturnPct: number;    // 수수료/슬리피지 차감 후 순수익률
  holdingDays: number;     // 포지션 보유 일수
}

export interface RiskMetrics {
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  // 수익률 분포
  avgNetReturn: number;
  stdDev: number;
  bestTrade: number;
  worstTrade: number;
  // 비율 지표
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  // 손실 지표
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  // 시각화 데이터
  equityCurve: { trade: number; equity: number; date: string }[];
  returnDistribution: { range: string; count: number }[];
  trades: TradeRecord[];
}

export interface ScreenerApiResponse {
  results: ScreenerResult[];
  scannedCount: number;
  duration: number;
  error?: string;
}

export interface ChartApiResponse {
  data: ChartData;
  error?: string;
}
