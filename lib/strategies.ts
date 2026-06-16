import { OHLCV, StrategyId } from './types';
import { sma, ema, stochRsi, fibLevels, toWeekly, avgVolume, isBullishAlignment } from './indicators';
import { roundFigure } from './utils';

export interface StrategySignal {
  matched: boolean;
  entryPrice: number;
  detail?: string;
}

// ─────────────────────────────────────────────────────────────────
// Strategy 1: Long-term MA + Round Figure
// ─────────────────────────────────────────────────────────────────
export function runStrategy1(daily: OHLCV[]): StrategySignal {
  if (daily.length < 130) return { matched: false, entryPrice: 0 };

  const closes = daily.map((c) => c.close);
  const lastClose = closes[closes.length - 1];

  // Weekly bullish alignment check
  const weekly = toWeekly(daily);
  const wCloses = weekly.map((c) => c.close);
  if (!isBullishAlignment(wCloses)) return { matched: false, entryPrice: 0 };

  const sma60arr = sma(closes, 60);
  const sma120arr = sma(closes, 120);
  const last = closes.length - 1;
  const ma60 = sma60arr[last];
  const ma120 = sma120arr[last];

  if (isNaN(ma60) || isNaN(ma120)) return { matched: false, entryPrice: 0 };

  const near60 = Math.abs(lastClose - ma60) / ma60 <= 0.015;
  const near120 = Math.abs(lastClose - ma120) / ma120 <= 0.015;

  if (!near60 && !near120) return { matched: false, entryPrice: 0 };

  const targetMA = near60 && near120
    ? (Math.abs(lastClose - ma60) < Math.abs(lastClose - ma120) ? ma60 : ma120)
    : near60 ? ma60 : ma120;

  const entryPrice = roundFigure(targetMA);
  const maLabel = near60 && Math.abs(lastClose - ma60) <= Math.abs(lastClose - ma120) ? '60일 이평선' : '120일 이평선';

  return {
    matched: true,
    entryPrice,
    detail: `${maLabel}(${targetMA.toFixed(2)}) ±1.5% 내 눌림, 라운드피겨 진입가`,
  };
}

// ─────────────────────────────────────────────────────────────────
// Strategy 2: Volume Dry-up + Doji / Hammer
// ─────────────────────────────────────────────────────────────────
export function runStrategy2(daily: OHLCV[]): StrategySignal {
  if (daily.length < 20) return { matched: false, entryPrice: 0 };

  const n = daily.length;
  const yesterday = daily[n - 1];

  // Find strong bullish breakout candle in last 5 days (excluding yesterday)
  const lookback = daily.slice(n - 6, n - 1);
  const avg20Vol = avgVolume(daily, 20, n - 7);

  let breakoutIdx = -1;
  let breakoutVol = 0;
  for (let i = 0; i < lookback.length; i++) {
    const c = lookback[i];
    const isBullish = c.close > c.open;
    const bodyPct = (c.close - c.open) / c.open;
    const volSurge = c.volume > avg20Vol * 2;
    if (isBullish && bodyPct >= 0.02 && volSurge) {
      breakoutIdx = n - 6 + i;
      breakoutVol = c.volume;
      break;
    }
  }
  if (breakoutIdx < 0) return { matched: false, entryPrice: 0 };

  // Check 2-3 days of correction after breakout
  const correctionCandles = daily.slice(breakoutIdx + 1, n - 1);
  if (correctionCandles.length < 1 || correctionCandles.length > 3) return { matched: false, entryPrice: 0 };

  const bearish = correctionCandles.some((c) => c.close < c.open);
  if (!bearish) return { matched: false, entryPrice: 0 };

  const corrAvgVol = correctionCandles.reduce((s, c) => s + c.volume, 0) / correctionCandles.length;
  if (corrAvgVol >= breakoutVol * 0.30) return { matched: false, entryPrice: 0 };

  // Yesterday must be doji or hammer
  const body = Math.abs(yesterday.close - yesterday.open);
  const bodyPct = body / yesterday.open;
  const lowerShadow = Math.min(yesterday.open, yesterday.close) - yesterday.low;
  const isDoji = bodyPct < 0.005;
  const isHammer = lowerShadow > body * 2 && yesterday.close > yesterday.open;

  if (!isDoji && !isHammer) return { matched: false, entryPrice: 0 };

  const entryPrice = isDoji
    ? yesterday.close
    : yesterday.low + lowerShadow * 0.5;

  return {
    matched: true,
    entryPrice,
    detail: isDoji
      ? `도지 캔들 포착, 거래량 급감(돌파 대비 ${((corrAvgVol / breakoutVol) * 100).toFixed(0)}%)`
      : `망치형 캔들 포착, 거래량 급감(돌파 대비 ${((corrAvgVol / breakoutVol) * 100).toFixed(0)}%)`,
  };
}

// ─────────────────────────────────────────────────────────────────
// Strategy 3: Fibonacci 0.5 ~ 0.618 Retracement
// ─────────────────────────────────────────────────────────────────
export function runStrategy3(daily: OHLCV[]): StrategySignal {
  if (daily.length < 30) return { matched: false, entryPrice: 0 };

  const recent30 = daily.slice(-30);
  const highs = recent30.map((c) => c.high);
  const lows = recent30.map((c) => c.low);

  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);
  const lastClose = daily[daily.length - 1].close;

  // Only valid if high comes before low in time (downward pull back from recent high)
  const highIdx = highs.lastIndexOf(swingHigh);
  const lowIdx = lows.indexOf(swingLow);

  if (swingHigh <= swingLow) return { matched: false, entryPrice: 0 };

  const fibs = fibLevels(swingHigh, swingLow);

  // Close should be between fib618 and fib50 (pulled back into golden zone)
  if (lastClose >= fibs.fib618 && lastClose <= fibs.fib50) {
    return {
      matched: true,
      entryPrice: fibs.fib618,
      detail: `피보나치 0.618(${fibs.fib618.toFixed(4)}) ~ 0.5(${fibs.fib50.toFixed(4)}) 황금비율 구간 안착`,
    };
  }

  // Also accept if close is within 1% of fib618 from below
  if (Math.abs(lastClose - fibs.fib618) / fibs.fib618 <= 0.01) {
    return {
      matched: true,
      entryPrice: fibs.fib618,
      detail: `피보나치 0.618 라인(${fibs.fib618.toFixed(4)}) 근접 지지 확인`,
    };
  }

  void highIdx; void lowIdx;
  return { matched: false, entryPrice: 0 };
}

// ─────────────────────────────────────────────────────────────────
// Strategy 4: Stochastic RSI Oversold Golden Cross
// ─────────────────────────────────────────────────────────────────
export function runStrategy4(daily: OHLCV[]): StrategySignal {
  if (daily.length < 60) return { matched: false, entryPrice: 0 };

  const closes = daily.map((c) => c.close);
  const weekly = toWeekly(daily);
  const wCloses = weekly.map((c) => c.close);
  const wSma20 = sma(wCloses, 20);
  const wLast = wSma20[wSma20.length - 1];

  // Must be above weekly SMA20
  if (isNaN(wLast) || weekly[weekly.length - 1].close < wLast) return { matched: false, entryPrice: 0 };

  const { k, d } = stochRsi(closes, 14, 14, 3, 3);
  const last = k.length - 1;
  const kNow = k[last];
  const dNow = d[last];
  const kPrev = k[last - 1];
  const dPrev = d[last - 1];

  if (isNaN(kNow) || isNaN(dNow)) return { matched: false, entryPrice: 0 };

  // Both K and D must be < 20 (oversold)
  if (kNow > 20 || dNow > 20) return { matched: false, entryPrice: 0 };

  // Golden cross: K crossed above D, or about to (diff < 1)
  const goldenCross = (!isNaN(kPrev) && !isNaN(dPrev) && kPrev <= dPrev && kNow > dNow);
  const nearCross = Math.abs(kNow - dNow) < 1 && kNow >= dNow;

  if (!goldenCross && !nearCross) return { matched: false, entryPrice: 0 };

  const entryPrice = daily[last].low;

  return {
    matched: true,
    entryPrice,
    detail: goldenCross
      ? `StochRSI(${kNow.toFixed(1)}, ${dNow.toFixed(1)}) 과매도 골든크로스 발생`
      : `StochRSI(${kNow.toFixed(1)}, ${dNow.toFixed(1)}) 골든크로스 임박`,
  };
}

// ─────────────────────────────────────────────────────────────────
// Strategy 5: Box Breakout + First Retest (S/R Flip)
// ─────────────────────────────────────────────────────────────────
export function runStrategy5(daily: OHLCV[]): StrategySignal {
  if (daily.length < 55) return { matched: false, entryPrice: 0 };

  const n = daily.length;
  const yesterday = daily[n - 1];

  // Consolidation zone: days 8 to 50 ago (before the recent 7-day breakout window)
  const consolidation = daily.slice(n - 55, n - 7);
  const boxHigh = Math.max(...consolidation.map((c) => c.high));
  const avg20 = avgVolume(daily, 20, n - 8);

  // Find breakout candle in last 7 days (excluding yesterday)
  const breakoutWindow = daily.slice(n - 7, n - 1);
  const breakoutCandle = breakoutWindow.find(
    (c) => c.close > boxHigh && c.volume > avg20 * 1.5,
  );
  if (!breakoutCandle) return { matched: false, entryPrice: 0 };

  // Yesterday must be retest: close within ±1.5% of boxHigh, or touched it intraday
  const retestHigh = yesterday.close <= boxHigh * 1.015;
  const retestLow = yesterday.close >= boxHigh * 0.985;
  const touchedIntraday = yesterday.low <= boxHigh * 1.01 && yesterday.high >= boxHigh * 0.99;

  if ((!retestHigh || !retestLow) && !touchedIntraday) return { matched: false, entryPrice: 0 };

  return {
    matched: true,
    entryPrice: boxHigh,
    detail: `${consolidation.length}일 박스권 돌파 후 S/R Flip 첫 리테스트 (저항→지지: ${boxHigh.toFixed(4)})`,
  };
}

// ─────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────
export function runStrategy(id: StrategyId, daily: OHLCV[]): StrategySignal {
  switch (id) {
    case 1: return runStrategy1(daily);
    case 2: return runStrategy2(daily);
    case 3: return runStrategy3(daily);
    case 4: return runStrategy4(daily);
    case 5: return runStrategy5(daily);
  }
}
