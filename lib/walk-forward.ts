import { OHLCV, StrategyId } from './types';
import { runStrategy } from './strategies';

export interface WFWindow {
  windowIndex: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  inSampleSignals: number;
  inSampleWins: number;
  inSampleWinRate: number;
  outSampleSignals: number;
  outSampleWins: number;
  outSampleWinRate: number;
}

export interface WFSummary {
  ticker: string;
  strategyId: StrategyId;
  windows: WFWindow[];
  // 학습 구간 통합 승률
  totalInSampleSignals: number;
  totalInSampleWins: number;
  avgInSampleWinRate: number;
  // 검증 구간 통합 승률 (진짜 승률)
  totalOutSampleSignals: number;
  totalOutSampleWins: number;
  avgOutSampleWinRate: number;
  // 과적합 지표
  efficiencyRatio: number;
  verdict: string;
  verdictLevel: 'robust' | 'good' | 'caution' | 'overfit' | 'insufficient';
  interpretation: string;
}

const TRAIN_DAYS = 180;   // 학습 구간: 6개월
const TEST_DAYS  = 60;    // 검증 구간: 2개월
const STEP_DAYS  = 60;    // 슬라이딩 스텝: 2개월
const HOLD_DAYS  = 30;    // 최대 포지션 보유 일수
const MIN_CTX    = 130;   // 지표 계산을 위한 최소 선행 데이터

function dateStr(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// 특정 시점(signalIdx)에서 진입 → 최대 HOLD_DAYS 후 결과 판정
// 중요: 미래 데이터는 signalIdx + 1부터 허용된 범위까지만 사용
function judgeOutcome(
  daily: OHLCV[],
  signalIdx: number,
  entryPrice: number,
  maxFwdIdx: number, // 이 인덱스 이후 데이터는 참조 금지
): 'win' | 'loss' | 'neutral' {
  const target = entryPrice * 1.10;
  const stop   = entryPrice * 0.95;
  const limit  = Math.min(signalIdx + 1 + HOLD_DAYS, maxFwdIdx);

  for (let j = signalIdx + 1; j < limit; j++) {
    if (daily[j].low  <= stop)   return 'loss';
    if (daily[j].high >= target) return 'win';
  }
  return 'neutral';
}

// [startIdx, endIdx) 구간에서 전략 신호를 스캔하고 결과 집계
// context: 지표 계산에는 data[0..i] 전체를 사용하되, 신호 발생 탐색은 [startIdx, endIdx) 에서만
function scanPeriod(
  daily: OHLCV[],
  scanStart: number,
  scanEnd: number,
  strategyId: StrategyId,
  fwdLimit: number,  // 미래 참조 한계 인덱스
): { signals: number; wins: number; neutral: number } {
  let signals = 0;
  let wins    = 0;
  let neutral = 0;

  for (let i = Math.max(scanStart, MIN_CTX); i < scanEnd; i++) {
    // 지표 계산: i 시점까지의 전체 데이터 사용 (look-ahead 없음)
    const slice  = daily.slice(0, i + 1);
    const signal = runStrategy(strategyId, slice);
    if (!signal.matched) continue;

    const outcome = judgeOutcome(daily, i, signal.entryPrice, fwdLimit);
    if (outcome === 'neutral') { neutral++; continue; }
    signals++;
    if (outcome === 'win') wins++;
  }

  return { signals, wins, neutral };
}

export function walkForwardTest(
  daily: OHLCV[],
  strategyId: StrategyId,
  ticker: string,
): WFSummary {
  const n = daily.length;
  const windows: WFWindow[] = [];

  // 첫 번째 학습 구간 시작점: 전체 데이터의 앞쪽부터 순서대로 슬라이딩
  // 데이터가 충분히 없으면 가능한 최대 구간부터 시작
  let start = Math.max(0, n - TRAIN_DAYS - TEST_DAYS - STEP_DAYS * 4);

  for (let w = 0; w < 5; w++) {
    const trainEnd = start + TRAIN_DAYS;
    const testEnd  = trainEnd + TEST_DAYS;
    if (testEnd > n) break;

    // 학습 구간 스캔 (in-sample)
    const inResult = scanPeriod(
      daily, start, trainEnd, strategyId,
      trainEnd + HOLD_DAYS, // 학습 구간 검증 시에는 trainEnd + HOLD까지 forward 허용
    );

    // 검증 구간 스캔 (out-of-sample) — 이게 진짜 승률
    const outResult = scanPeriod(
      daily, trainEnd, testEnd, strategyId,
      testEnd + HOLD_DAYS, // 단, 전체 n 범위 초과 금지
    );

    const inRate  = inResult.signals  > 0 ? (inResult.wins  / inResult.signals)  * 100 : 0;
    const outRate = outResult.signals > 0 ? (outResult.wins / outResult.signals) * 100 : 0;

    windows.push({
      windowIndex: w,
      trainStart: dateStr(daily[start].timestamp),
      trainEnd:   dateStr(daily[trainEnd - 1].timestamp),
      testStart:  dateStr(daily[trainEnd].timestamp),
      testEnd:    dateStr(daily[testEnd  - 1].timestamp),
      inSampleSignals:  inResult.signals,
      inSampleWins:     inResult.wins,
      inSampleWinRate:  parseFloat(inRate.toFixed(1)),
      outSampleSignals: outResult.signals,
      outSampleWins:    outResult.wins,
      outSampleWinRate: parseFloat(outRate.toFixed(1)),
    });

    start += STEP_DAYS;
  }

  // ── 통합 집계 ──
  const totalIn     = windows.reduce((s, w) => s + w.inSampleSignals,  0);
  const totalInWins = windows.reduce((s, w) => s + w.inSampleWins,     0);
  const totalOut    = windows.reduce((s, w) => s + w.outSampleSignals, 0);
  const totalOutWins= windows.reduce((s, w) => s + w.outSampleWins,    0);

  const avgIn  = totalIn  > 0 ? (totalInWins  / totalIn)  * 100 : 0;
  const avgOut = totalOut > 0 ? (totalOutWins / totalOut) * 100 : 0;
  const eff    = avgIn    > 0 ? avgOut / avgIn : 0;

  // ── 판정 ──
  let verdict: string;
  let verdictLevel: WFSummary['verdictLevel'];
  let interpretation: string;

  if (totalOut < 3) {
    verdict       = '샘플 부족';
    verdictLevel  = 'insufficient';
    interpretation= '검증 구간 신호가 3개 미만입니다. 더 많은 데이터가 필요합니다.';
  } else if (eff >= 0.80) {
    verdict       = '강건 (Robust)';
    verdictLevel  = 'robust';
    interpretation= `샘플 외 승률(${avgOut.toFixed(1)}%)이 학습 승률(${avgIn.toFixed(1)}%)의 ${(eff*100).toFixed(0)}%를 유지합니다. 전략이 새로운 데이터에서도 잘 작동합니다.`;
  } else if (eff >= 0.60) {
    verdict       = '양호 (Good)';
    verdictLevel  = 'good';
    interpretation= `샘플 외 승률이 학습 승률의 ${(eff*100).toFixed(0)}% 수준입니다. 실전에서 소폭 성과 저하를 예상하세요.`;
  } else if (eff >= 0.40) {
    verdict       = '주의 (Caution)';
    verdictLevel  = 'caution';
    interpretation= `샘플 외 승률이 학습 대비 ${((1-eff)*100).toFixed(0)}% 급감했습니다. 포지션 크기를 줄이고 신중히 사용하세요.`;
  } else {
    verdict       = '과적합 (Overfitted)';
    verdictLevel  = 'overfit';
    interpretation= `학습 승률(${avgIn.toFixed(1)}%) 대비 실전 승률(${avgOut.toFixed(1)}%)이 크게 낮습니다. 이 종목에서 전략 신뢰도가 낮습니다.`;
  }

  return {
    ticker,
    strategyId,
    windows,
    totalInSampleSignals:  totalIn,
    totalInSampleWins:     totalInWins,
    avgInSampleWinRate:    parseFloat(avgIn.toFixed(1)),
    totalOutSampleSignals: totalOut,
    totalOutSampleWins:    totalOutWins,
    avgOutSampleWinRate:   parseFloat(avgOut.toFixed(1)),
    efficiencyRatio:       parseFloat(eff.toFixed(2)),
    verdict,
    verdictLevel,
    interpretation,
  };
}
