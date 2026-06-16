import { OHLCV } from './types';

// Simple Moving Average
export function sma(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result[i] = sum / period;
  }
  return result;
}

// Exponential Moving Average
export function ema(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  for (let i = 0; i < values.length; i++) {
    if (isNaN(prev)) {
      if (i >= period - 1) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += values[j];
        prev = sum / period;
        result[i] = prev;
      }
    } else {
      prev = values[i] * k + prev * (1 - k);
      result[i] = prev;
    }
  }
  return result;
}

// RSI
export function rsi(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  if (avgLoss === 0) result[period] = 100;
  else result[period] = 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) result[i] = 100;
    else result[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// Stochastic RSI (period, stochPeriod, kSmooth, dSmooth)
export function stochRsi(
  closes: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dSmooth = 3,
): { k: number[]; d: number[] } {
  const rsiValues = rsi(closes, rsiPeriod);
  const rawK: number[] = new Array(closes.length).fill(NaN);

  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const window = rsiValues.slice(i - stochPeriod + 1, i + 1).filter((v) => !isNaN(v));
    if (window.length < stochPeriod) continue;
    const minRsi = Math.min(...window);
    const maxRsi = Math.max(...window);
    rawK[i] = maxRsi === minRsi ? 0 : ((rsiValues[i] - minRsi) / (maxRsi - minRsi)) * 100;
  }

  const kSmoothed = smaArray(rawK, kSmooth);
  const dSmoothed = smaArray(kSmoothed, dSmooth);
  return { k: kSmoothed, d: dSmoothed };
}

function smaArray(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1).filter((v) => !isNaN(v));
    if (window.length === period) result[i] = window.reduce((a, b) => a + b, 0) / period;
  }
  return result;
}

// Fibonacci retracement levels for a high-low range
export function fibLevels(high: number, low: number) {
  const range = high - low;
  return {
    fib0: high,
    fib236: high - 0.236 * range,
    fib382: high - 0.382 * range,
    fib50: high - 0.5 * range,
    fib618: high - 0.618 * range,
    fib786: high - 0.786 * range,
    fib1: low,
  };
}

// Aggregate daily OHLCV into weekly candles
export function toWeekly(daily: OHLCV[]): OHLCV[] {
  const weeks: Map<string, OHLCV> = new Map();
  for (const candle of daily) {
    const d = new Date(candle.timestamp);
    // Get ISO week key: year-week
    const dayOfWeek = d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
    const key = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
    if (!weeks.has(key)) {
      weeks.set(key, {
        timestamp: monday.getTime(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
    } else {
      const w = weeks.get(key)!;
      w.high = Math.max(w.high, candle.high);
      w.low = Math.min(w.low, candle.low);
      w.close = candle.close;
      w.volume += candle.volume;
    }
  }
  return Array.from(weeks.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Check if EMA series is bullishly aligned (EMA20 > EMA60 > EMA120)
export function isBullishAlignment(closes: number[]): boolean {
  if (closes.length < 120) return false;
  const e20 = ema(closes, 20);
  const e60 = ema(closes, 60);
  const e120 = ema(closes, 120);
  const last = closes.length - 1;
  return !isNaN(e120[last]) && e20[last] > e60[last] && e60[last] > e120[last];
}

// Rolling average volume
export function avgVolume(ohlcv: OHLCV[], period = 20, endIdx?: number): number {
  const idx = endIdx ?? ohlcv.length - 1;
  const start = Math.max(0, idx - period);
  const slice = ohlcv.slice(start, idx);
  if (slice.length === 0) return 0;
  return slice.reduce((s, c) => s + c.volume, 0) / slice.length;
}
