import { OHLCV, StrategyId, FeeConfig, TradeRecord } from './types';
import { collectTrades } from './risk-metrics';

export interface SimPoint {
  trade: number;
  date: string;
  capital: number;
  drawdown: number;  // % from peak
}

export interface MonthlyReturn {
  month: string;     // "2024-03"
  returnPct: number; // 그 달 복리 수익률 %
  tradeCount: number;
}

export interface SimResult {
  positionPct: number;
  initialCapital: number;
  finalCapital: number;
  totalReturnPct: number;
  cagr: number;           // 연환산 복리 수익률 %
  maxDrawdownPct: number; // 자본 기준 최대 낙폭 %
  maxDrawdownAmt: number; // 실금액 최대 낙폭
  tradeCount: number;
  winCount: number;
  curve: SimPoint[];
  monthlyReturns: MonthlyReturn[];
}

export interface CompoundReport {
  ticker: string;
  strategyId: StrategyId;
  initialCapital: number;
  kellyPct: number;       // 켈리 공식 최적 비율
  halfKellyPct: number;
  trades: TradeRecord[];
  scenarios: SimResult[]; // 10%, 20%, 50% 비교
  custom: SimResult;      // 사용자 지정 비율 결과
}

// ─── 켈리 공식 ────────────────────────────────
// Kelly% = p − q/r   (p=승률, q=패율, r=손익비)
export function kellyPct(trades: TradeRecord[]): number {
  const wins   = trades.filter(t => t.outcome === 'win');
  const losses = trades.filter(t => t.outcome === 'loss');
  if (!trades.length || !wins.length || !losses.length) return 0;

  const p  = wins.length / trades.length;
  const q  = 1 - p;
  const avgWin  = wins.reduce((s, t)   => s + t.netReturnPct, 0) / wins.length   / 100;
  const avgLoss = losses.reduce((s, t) => s + Math.abs(t.netReturnPct), 0) / losses.length / 100;
  const r = avgLoss > 0 ? avgWin / avgLoss : 0;

  const k = r > 0 ? p - q / r : 0;
  return parseFloat((Math.max(0, Math.min(k * 100, 100))).toFixed(1));
}

// ─── 단일 시뮬레이션 실행 ──────────────────────
export function runSimulation(
  trades: TradeRecord[],
  initialCapital: number,
  positionPct: number,
): SimResult {
  let capital = initialCapital;
  let peak    = initialCapital;
  let maxDD   = 0;
  let maxDDAmt = 0;
  let wins    = 0;

  const curve: SimPoint[] = [];

  for (const t of trades) {
    const invested   = capital * (positionPct / 100);
    const pnl        = invested * (t.netReturnPct / 100);
    capital         += pnl;
    if (t.outcome === 'win') wins++;

    if (capital > peak) peak = capital;
    const ddPct = (peak - capital) / peak * 100;
    const ddAmt = peak - capital;
    if (ddPct > maxDD)   { maxDD = ddPct; maxDDAmt = ddAmt; }

    curve.push({
      trade:    t.tradeIndex + 1,
      date:     t.date,
      capital:  parseFloat(capital.toFixed(0)),
      drawdown: parseFloat(ddPct.toFixed(2)),
    });
  }

  // CAGR
  let cagr = 0;
  if (trades.length >= 2) {
    const first = new Date(trades[0].date).getTime();
    const last  = new Date(trades[trades.length - 1].date).getTime();
    const years = (last - first) / (365.25 * 24 * 3600 * 1000);
    if (years > 0 && capital > 0) {
      cagr = (Math.pow(capital / initialCapital, 1 / years) - 1) * 100;
    }
  }

  // 월별 수익률
  const monthlyMap = new Map<string, { start: number; end: number; count: number }>();
  let prevCapital = initialCapital;
  for (const pt of curve) {
    const month = pt.date.slice(0, 7);
    if (!monthlyMap.has(month)) monthlyMap.set(month, { start: prevCapital, end: pt.capital, count: 0 });
    const m = monthlyMap.get(month)!;
    m.end   = pt.capital;
    m.count++;
    prevCapital = pt.capital;
  }
  const monthlyReturns: MonthlyReturn[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { start, end, count }]) => ({
      month,
      returnPct: parseFloat(((end - start) / start * 100).toFixed(2)),
      tradeCount: count,
    }));

  return {
    positionPct,
    initialCapital,
    finalCapital:    parseFloat(capital.toFixed(0)),
    totalReturnPct:  parseFloat(((capital - initialCapital) / initialCapital * 100).toFixed(2)),
    cagr:            parseFloat(cagr.toFixed(2)),
    maxDrawdownPct:  parseFloat(maxDD.toFixed(2)),
    maxDrawdownAmt:  parseFloat(maxDDAmt.toFixed(0)),
    tradeCount:      trades.length,
    winCount:        wins,
    curve,
    monthlyReturns,
  };
}

// ─── 전체 리포트 생성 ──────────────────────────
export function buildCompoundReport(
  daily: OHLCV[],
  strategyId: StrategyId,
  cfg: FeeConfig,
  initialCapital: number,
  customPct: number,
): CompoundReport {
  const trades  = collectTrades(daily, strategyId, cfg);
  const kelly   = kellyPct(trades);
  const halfK   = parseFloat((kelly / 2).toFixed(1));

  const SCENARIO_PCTS = [10, 20, 50];
  const scenarios = SCENARIO_PCTS.map(p => runSimulation(trades, initialCapital, p));
  const custom    = runSimulation(trades, initialCapital, customPct);

  return {
    ticker:         '',
    strategyId,
    initialCapital,
    kellyPct:       kelly,
    halfKellyPct:   halfK,
    trades,
    scenarios,
    custom,
  };
}
