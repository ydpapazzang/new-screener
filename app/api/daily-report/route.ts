import { NextRequest, NextResponse } from 'next/server';
import { Exchange, StrategyId, FeeConfig } from '@/lib/types';
import { getTopSymbols, fetchOHLCV } from '@/lib/data-fetcher';
import { runStrategy } from '@/lib/strategies';
import { buildScreenerResult } from '@/lib/backtester';
import { walkForwardTest } from '@/lib/walk-forward';
import { calcRiskMetrics } from '@/lib/risk-metrics';
import { buildCompoundReport } from '@/lib/compound-sim';
import { calcNetMetrics, DEFAULT_FEES } from '@/lib/fee-model';
import { delay } from '@/lib/utils';

export const maxDuration = 300;

const STRATEGY_NAMES: Record<number, string> = {
  1: '장기이평선+라운드피겨',
  2: '거래량급감+도지/망치',
  3: '피보나치 0.5~0.618',
  4: 'StochRSI 과매도',
  5: '박스권 리테스트',
};

function fmtKRW(v: number) {
  if (v >= 100_000_000) return `₩${(v / 100_000_000).toFixed(2)}억`;
  if (v >= 10_000)      return `₩${Math.round(v).toLocaleString('ko-KR')}`;
  return `₩${v.toFixed(4)}`;
}
function fmtUSD(v: number) {
  return v >= 1 ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `$${v.toFixed(6)}`;
}

function buildMessage(
  reportItems: ReportItem[],
  exchange: Exchange,
  strategy: StrategyId,
  threshold: number,
): string {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  const isKrw = exchange !== 'binance';
  const fmt   = (p: number) => isKrw ? fmtKRW(p) : fmtUSD(p);
  const stars  = (s: number) => '★'.repeat(s) + '☆'.repeat(4 - s);

  const passed = reportItems.filter(r => r.score >= 3);
  const skipped = reportItems.filter(r => r.score < 3);

  let msg = `🔔 <b>EOD 일일 매매 리포트</b>\n`;
  msg += `📅 ${now}\n`;
  msg += `거래소: <b>${exchange.toUpperCase()}</b>  |  전략 ${strategy}번 (${STRATEGY_NAMES[strategy]})\n`;
  msg += `진입가 ±${threshold}% 이내 종목만 포함\n\n`;

  if (passed.length === 0) {
    msg += `오늘은 진입 조건을 충족하는 종목이 없습니다.\n`;
    if (skipped.length > 0) {
      msg += `\n신호 발생했으나 조건 미달: ${skipped.map(r => r.symbol).join(', ')}`;
    }
    return msg;
  }

  msg += `📊 <b>오늘 진입 대상 종목 (${passed.length}개)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  const medals = ['🥇', '🥈', '🥉'];
  passed.forEach((item, idx) => {
    const medal   = medals[idx] ?? `<b>${idx + 1}위</b>`;
    const priceDiff = ((item.lastClose - item.entryPrice) / item.entryPrice * 100);
    const diffStr = `${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(1)}%`;

    msg += `\n${medal} <b>${item.symbol}</b>  ${stars(item.score)} (${item.score}/4)\n`;
    msg += `   현재가: ${fmt(item.lastClose)}  |  진입가: ${fmt(item.entryPrice)} (${diffStr})\n`;
    msg += `   백테 승률: <b>${item.winRate.toFixed(0)}%</b>  |  EV: ${item.ev >= 0 ? '+' : ''}${item.ev.toFixed(1)}%\n`;

    if (item.wfVerdict) {
      msg += `   WF: ${item.wfVerdict}(${(item.wfEfficiency ?? 0).toFixed(2)})`;
      if (item.sharpe !== null) msg += `  |  샤프: ${item.sharpe.toFixed(1)}`;
      if (item.mdd !== null)    msg += `  MDD: ${item.mdd.toFixed(0)}%`;
      if (item.cagr !== null)   msg += `  |  CAGR: ${item.cagr >= 0 ? '+' : ''}${item.cagr.toFixed(0)}%`;
      msg += `\n`;
    }

    msg += `   목표: ${fmt(item.target1)} (+10%)  /  ${fmt(item.target2)} (+20%)  /  손절: ${fmt(item.stopLoss)}\n`;
    if (item.strategyDetail) msg += `   📌 ${item.strategyDetail}\n`;
  });

  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⚠️ 포지션 자본의 10~20% 권장 | 손절 필수 준수\n`;
  msg += `이 메시지는 자동 생성됩니다. 투자 결정은 본인 판단으로.`;

  return msg;
}

interface ReportItem {
  symbol: string;
  lastClose: number;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  winRate: number;
  ev: number;
  score: number;
  wfVerdict: string | null;
  wfEfficiency: number | null;
  sharpe: number | null;
  mdd: number | null;
  cagr: number | null;
  strategyDetail?: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exchange    = (searchParams.get('exchange') ?? 'upbit') as Exchange;
  const strategyId  = parseInt(searchParams.get('strategy') ?? '1') as StrategyId;
  const feeRate     = parseFloat(searchParams.get('feeRate')      ?? String(DEFAULT_FEES[exchange].feeRate));
  const slipRate    = parseFloat(searchParams.get('slippageRate') ?? String(DEFAULT_FEES[exchange].slippageRate));
  const threshold   = parseFloat(searchParams.get('threshold')    ?? '3');  // 진입가 ±% 허용 범위
  const token       = searchParams.get('token')  ?? '';
  const chatId      = searchParams.get('chatId') ?? '';
  const dryRun      = searchParams.get('dryRun') === 'true';  // 알림 없이 결과만 반환

  const cfg: FeeConfig = { feeRate, slippageRate: slipRate };

  try {
    // ── 1단계: 스크리너 스캔 ──────────────────────
    const symbols = await getTopSymbols(exchange, 35);
    const screenerHits = [];

    for (const symbol of symbols) {
      try {
        const daily = await fetchOHLCV(exchange, symbol, '1d', 500);
        if (daily.length < 50) continue;

        const signal = runStrategy(strategyId, daily);
        if (!signal.matched) continue;

        const result = buildScreenerResult(symbol, exchange, strategyId, daily, signal.entryPrice, signal.detail);

        // ── 2단계: 진입가 도달 여부 ──────────────
        const priceDiff = Math.abs(result.lastClose - result.entryPrice) / result.entryPrice * 100;
        if (priceDiff > threshold) continue;

        screenerHits.push({ result, daily });
        await delay(50);
      } catch { continue; }
    }

    // ── 3단계: 각 종목 분석 ──────────────────────
    const reportItems: ReportItem[] = [];

    for (const { result, daily } of screenerHits) {
      const nm = calcNetMetrics(result.winRate, cfg);

      let wfVerdict: string | null = null;
      let wfEfficiency: number | null = null;
      let sharpe: number | null = null;
      let mdd: number | null = null;
      let cagr: number | null = null;

      try {
        const wf = walkForwardTest(daily, strategyId, result.ticker);
        wfVerdict    = wf.verdict;
        wfEfficiency = wf.efficiencyRatio;
      } catch { /* 샘플 부족 시 skip */ }

      try {
        const risk = calcRiskMetrics(daily, strategyId, cfg);
        sharpe = risk.sharpeRatio;
        mdd    = risk.maxDrawdown;
      } catch { /* skip */ }

      try {
        const compound = buildCompoundReport(daily, strategyId, cfg, 1_000_000, 20);
        cagr = compound.custom.cagr;
      } catch { /* skip */ }

      // ── 4단계: 점수 산정 ─────────────────────
      const evPass       = nm.expectedValue > 0;
      const wfPass       = wfVerdict === '강건';
      const riskPass     = sharpe !== null && mdd !== null && sharpe > 1.0 && mdd < 25;
      const compoundPass = cagr !== null && cagr > 0;

      const score =
        (evPass       ? 1 : 0) +
        (wfPass       ? 1 : 0) +
        (riskPass     ? 1 : 0) +
        (compoundPass ? 1 : 0);

      reportItems.push({
        symbol:         result.ticker,
        lastClose:      result.lastClose,
        entryPrice:     result.entryPrice,
        target1:        result.target1,
        target2:        result.target2,
        stopLoss:       result.stopLoss,
        winRate:        result.winRate,
        ev:             nm.expectedValue,
        score,
        wfVerdict,
        wfEfficiency,
        sharpe,
        mdd,
        cagr,
        strategyDetail: result.strategyDetail,
      });
    }

    // ── 5단계: 정렬 (점수 → 승률 → EV) ──────────
    reportItems.sort((a, b) =>
      b.score   - a.score   ||
      b.winRate - a.winRate ||
      b.ev      - a.ev
    );

    // ── 6단계: 텔레그램 전송 ─────────────────────
    const message = buildMessage(reportItems, exchange, strategyId, threshold);
    let sent = false;
    let sendError: string | undefined;

    if (!dryRun && token && chatId) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
        });
        const data = await res.json();
        sent = data.ok;
        if (!data.ok) sendError = data.description;
      } catch (e) {
        sendError = String(e);
      }
    }

    return NextResponse.json({
      success:     true,
      scanCount:   symbols.length,
      signalCount: screenerHits.length,
      reportCount: reportItems.length,
      items:       reportItems,
      message,
      sent,
      sendError,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
