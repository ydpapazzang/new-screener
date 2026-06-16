import { OHLCV, StrategyId, ScreenerResult, Exchange } from './types';
import { runStrategy } from './strategies';

interface BacktestResult {
  winRate: number;
  signalCount: number;
  target1: number;
  target2: number;
  stopLoss: number;
  expectedReturn: number;
}

// Scan historical data and compute win rate for a given strategy
export function backtest(
  daily: OHLCV[],
  strategyId: StrategyId,
  entryPrice: number,
): BacktestResult {
  // Target and stop levels
  const target1 = entryPrice * 1.10;
  const target2 = entryPrice * 1.20;
  const stopLoss = entryPrice * 0.95;
  const expectedReturn = ((target1 - entryPrice) / entryPrice) * 100;

  // Scan past 1 year of daily data for historical signals
  const yearAgo = daily.length - 365;
  const scanStart = Math.max(50, yearAgo); // need enough data for indicators

  let totalSignals = 0;
  let wins = 0;

  for (let i = scanStart; i < daily.length - 30; i++) {
    const historicalSlice = daily.slice(0, i + 1);
    const signal = runStrategy(strategyId, historicalSlice);
    if (!signal.matched) continue;

    const historicalEntry = signal.entryPrice;
    const historicalTarget1 = historicalEntry * 1.10;
    const historicalStop = historicalEntry * 0.95;

    totalSignals++;

    // Check forward 30 candles: did price hit target or stop first?
    const future = daily.slice(i + 1, i + 31);
    let outcome: 'win' | 'loss' | 'neutral' = 'neutral';

    for (const candle of future) {
      if (candle.low <= historicalStop) {
        outcome = 'loss';
        break;
      }
      if (candle.high >= historicalTarget1) {
        outcome = 'win';
        break;
      }
    }

    if (outcome === 'win') wins++;
  }

  const winRate = totalSignals > 0 ? (wins / totalSignals) * 100 : 0;

  return { winRate, signalCount: totalSignals, target1, target2, stopLoss, expectedReturn };
}

export function buildScreenerResult(
  ticker: string,
  exchange: Exchange,
  strategyId: StrategyId,
  daily: OHLCV[],
  entryPrice: number,
  strategyDetail?: string,
): ScreenerResult {
  const lastClose = daily[daily.length - 1].close;
  const bt = backtest(daily, strategyId, entryPrice);

  return {
    ticker,
    exchange,
    strategy: strategyId,
    lastClose,
    entryPrice,
    target1: bt.target1,
    target2: bt.target2,
    stopLoss: bt.stopLoss,
    expectedReturn: bt.expectedReturn,
    winRate: bt.winRate,
    signalCount: bt.signalCount,
    strategyDetail,
  };
}
