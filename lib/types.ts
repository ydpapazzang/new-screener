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
