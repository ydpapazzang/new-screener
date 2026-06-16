import { Exchange, FeeConfig, NetMetrics } from './types';

// 거래소별 기본 수수료 (편도 %)
export const DEFAULT_FEES: Record<Exchange, FeeConfig> = {
  upbit:   { feeRate: 0.05, slippageRate: 0.10 },
  binance: { feeRate: 0.10, slippageRate: 0.08 },
  bithumb: { feeRate: 0.25, slippageRate: 0.15 },
};

// 왕복 총비용 = (수수료 + 슬리피지) × 2
export function roundTripCost(cfg: FeeConfig): number {
  return (cfg.feeRate + cfg.slippageRate) * 2;
}

// 익절 시 순수익: 목표 수익률 − 왕복비용
export function netWinPct(grossWinPct: number, cfg: FeeConfig): number {
  return grossWinPct - roundTripCost(cfg);
}

// 손절 시 순손실: 손절 손실 − 왕복비용 (비용은 손실에 더해짐)
export function netLossPct(grossLossPct: number, cfg: FeeConfig): number {
  return grossLossPct - roundTripCost(cfg);
}

// 기댓값(EV): 승률 × 순수익 + 패율 × 순손실
export function calcEV(
  winRatePct: number,
  cfg: FeeConfig,
  targetPct = 10,
  stopPct = -5,
): number {
  const wr     = winRatePct / 100;
  const nWin   = netWinPct(targetPct, cfg);
  const nLoss  = netLossPct(stopPct, cfg);
  return wr * nWin + (1 - wr) * nLoss;
}

// 손익분기 승률: EV = 0 이 되는 최소 승률
// wr × netWin + (1-wr) × netLoss = 0
// wr = |netLoss| / (netWin + |netLoss|)
export function breakEvenWinRate(
  cfg: FeeConfig,
  targetPct = 10,
  stopPct = -5,
): number {
  const nWin  = netWinPct(targetPct, cfg);
  const nLoss = Math.abs(netLossPct(stopPct, cfg));
  if (nWin + nLoss <= 0) return 100;
  return (nLoss / (nWin + nLoss)) * 100;
}

// 전체 지표 한꺼번에 계산
export function calcNetMetrics(
  winRatePct: number,
  cfg: FeeConfig,
  targetPct = 10,
  stopPct = -5,
): NetMetrics {
  return {
    roundTripCost:    parseFloat(roundTripCost(cfg).toFixed(3)),
    netWinPct:        parseFloat(netWinPct(targetPct, cfg).toFixed(2)),
    netLossPct:       parseFloat(netLossPct(stopPct, cfg).toFixed(2)),
    expectedValue:    parseFloat(calcEV(winRatePct, cfg, targetPct, stopPct).toFixed(2)),
    breakEvenWinRate: parseFloat(breakEvenWinRate(cfg, targetPct, stopPct).toFixed(1)),
  };
}
