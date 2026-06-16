import { OHLCV, StrategyId, FeeConfig, TradeRecord, RiskMetrics } from './types';
import { runStrategy } from './strategies';
import { roundTripCost } from './fee-model';

const HOLD_DAYS   = 30;
const MIN_CONTEXT = 130;

// 단일 트레이드 결과 판정 → 수수료 반영 순수익률 반환
function judgeTradeReturn(
  daily: OHLCV[],
  signalIdx: number,
  entryPrice: number,
  cfg: FeeConfig,
  targetPct = 10,
  stopPct   = -5,
): { outcome: 'win' | 'loss' | 'neutral'; grossPct: number; netPct: number; holdDays: number } {
  const rtc    = roundTripCost(cfg);
  const target = entryPrice * (1 + targetPct / 100);
  const stop   = entryPrice * (1 + stopPct  / 100);

  for (let j = signalIdx + 1; j < Math.min(signalIdx + 1 + HOLD_DAYS, daily.length); j++) {
    const c = daily[j];
    if (c.low <= stop) {
      const holdDays = j - signalIdx;
      return { outcome: 'loss', grossPct: stopPct, netPct: stopPct - rtc, holdDays };
    }
    if (c.high >= target) {
      const holdDays = j - signalIdx;
      return { outcome: 'win', grossPct: targetPct, netPct: targetPct - rtc, holdDays };
    }
  }
  return { outcome: 'neutral', grossPct: 0, netPct: -rtc, holdDays: HOLD_DAYS };
}

// 과거 1년 트레이드 시리즈 수집
export function collectTrades(
  daily: OHLCV[],
  strategyId: StrategyId,
  cfg: FeeConfig,
): TradeRecord[] {
  const trades: TradeRecord[] = [];
  const yearAgo   = Math.max(MIN_CONTEXT, daily.length - 365);

  for (let i = yearAgo; i < daily.length - HOLD_DAYS; i++) {
    const slice  = daily.slice(0, i + 1);
    const signal = runStrategy(strategyId, slice);
    if (!signal.matched) continue;

    const { outcome, grossPct, netPct, holdDays } = judgeTradeReturn(
      daily, i, signal.entryPrice, cfg,
    );
    if (outcome === 'neutral') continue;

    trades.push({
      tradeIndex:    trades.length,
      date:          new Date(daily[i].timestamp).toISOString().slice(0, 10),
      outcome,
      grossReturnPct: parseFloat(grossPct.toFixed(2)),
      netReturnPct:   parseFloat(netPct.toFixed(2)),
      holdingDays:    holdDays,
    });
  }
  return trades;
}

// ──────────────────────────────────────────────
// 통계 계산
// ──────────────────────────────────────────────

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[], avg: number): number {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function downsideDev(arr: number[]): number {
  // 하방편차: 손실(음수) 수익률만 사용
  const losses = arr.filter(v => v < 0);
  if (!losses.length) return 0;
  const mse = losses.reduce((s, v) => s + v ** 2, 0) / arr.length; // 전체 N으로 나눔
  return Math.sqrt(mse);
}

function maxDrawdown(equityCurve: number[]): number {
  let peak = equityCurve[0] ?? 100;
  let maxDD = 0;
  for (const val of equityCurve) {
    if (val > peak) peak = val;
    const dd = (peak - val) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function buildReturnDistribution(returns: number[]) {
  const bins = [
    { range: '<−5%',  min: -Infinity, max: -5 },
    { range: '−5~−3%', min: -5, max: -3 },
    { range: '−3~0%', min: -3, max: 0 },
    { range: '0~3%',  min: 0,  max: 3 },
    { range: '3~6%',  min: 3,  max: 6 },
    { range: '6~9%',  min: 6,  max: 9 },
    { range: '9~12%', min: 9,  max: 12 },
    { range: '>12%',  min: 12, max: Infinity },
  ];
  return bins.map(b => ({
    range: b.range,
    count: returns.filter(r => r >= b.min && r < b.max).length,
  }));
}

// 메인 함수: 트레이드 시리즈 → 전체 리스크 지표
export function calcRiskMetrics(
  daily: OHLCV[],
  strategyId: StrategyId,
  cfg: FeeConfig,
): RiskMetrics {
  const trades  = collectTrades(daily, strategyId, cfg);
  const returns = trades.map(t => t.netReturnPct);

  const wins  = trades.filter(t => t.outcome === 'win');
  const losses= trades.filter(t => t.outcome === 'loss');

  const avgRet  = mean(returns);
  const sigma   = stdDev(returns, avgRet);
  const downSD  = downsideDev(returns);

  const sharpe  = sigma   > 0 ? avgRet / sigma   : 0;
  const sortino = downSD  > 0 ? avgRet / downSD  : (avgRet > 0 ? 99 : 0);

  const grossWin  = wins.reduce((s, t)   => s + t.netReturnPct, 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(t.netReturnPct), 0);
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);

  // 에쿼티 커브 (복리)
  let equity = 100;
  const equityCurve = trades.map((t) => {
    equity = equity * (1 + t.netReturnPct / 100);
    return { trade: t.tradeIndex + 1, equity: parseFloat(equity.toFixed(2)), date: t.date };
  });
  const equityValues = [100, ...equityCurve.map(e => e.equity)];
  const mdd = maxDrawdown(equityValues);

  return {
    tradeCount: trades.length,
    winCount:   wins.length,
    lossCount:  losses.length,
    winRate:    trades.length > 0 ? parseFloat((wins.length / trades.length * 100).toFixed(1)) : 0,
    avgNetReturn:  parseFloat(avgRet.toFixed(3)),
    stdDev:        parseFloat(sigma.toFixed(3)),
    bestTrade:     returns.length ? parseFloat(Math.max(...returns).toFixed(2)) : 0,
    worstTrade:    returns.length ? parseFloat(Math.min(...returns).toFixed(2)) : 0,
    sharpeRatio:   parseFloat(sharpe.toFixed(3)),
    sortinoRatio:  parseFloat(Math.min(sortino, 99).toFixed(3)),
    profitFactor:  parseFloat(Math.min(pf, 99).toFixed(3)),
    maxDrawdown:   parseFloat(mdd.toFixed(2)),
    avgWin:  wins.length  ? parseFloat(mean(wins.map(t  => t.netReturnPct)).toFixed(2)) : 0,
    avgLoss: losses.length? parseFloat(mean(losses.map(t => t.netReturnPct)).toFixed(2)) : 0,
    equityCurve,
    returnDistribution: buildReturnDistribution(returns),
    trades,
  };
}
