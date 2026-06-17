import { Exchange, StrategyId, FeeConfig } from './types';
import { getTopSymbols, fetchOHLCV } from './data-fetcher';
import { runStrategy } from './strategies';
import { buildScreenerResult } from './backtester';
import { walkForwardTest } from './walk-forward';
import { calcRiskMetrics } from './risk-metrics';
import { buildCompoundReport } from './compound-sim';
import { calcNetMetrics, DEFAULT_FEES } from './fee-model';
import { delay } from './utils';

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
  return v >= 1
    ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : `$${v.toFixed(6)}`;
}

export interface ReportItem {
  symbol:         string;
  lastClose:      number;
  entryPrice:     number;
  target1:        number;
  target2:        number;
  stopLoss:       number;
  winRate:        number;
  ev:             number;
  score:          number;
  wfVerdict:      string | null;
  wfEfficiency:   number | null;
  sharpe:         number | null;
  mdd:            number | null;
  cagr:           number | null;
  strategyDetail?: string;
}

export interface DailyReportOptions {
  exchange?:   Exchange;
  strategyId?: StrategyId;
  threshold?:  number;
  token?:      string;
  chatId?:     string;
  dryRun?:     boolean;
}

export interface DailyReportResult {
  success:     boolean;
  scanCount:   number;
  signalCount: number;
  reportCount: number;
  items:       ReportItem[];
  message:     string;
  sent:        boolean;
  sendError?:  string;
  error?:      string;
}

function buildMessage(
  items:      ReportItem[],
  exchange:   Exchange,
  strategy:   StrategyId,
  threshold:  number,
): string {
  const now    = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  const isKrw  = exchange !== 'binance';
  const fmt    = (p: number) => isKrw ? fmtKRW(p) : fmtUSD(p);
  const stars  = (s: number) => '★'.repeat(s) + '☆'.repeat(4 - s);
  const medals = ['🥇', '🥈', '🥉'];

  const passed  = items.filter(r => r.score >= 3);
  const skipped = items.filter(r => r.score < 3);

  let msg = `🔔 <b>EOD 일일 매매 리포트</b>\n`;
  msg += `📅 ${now}\n`;
  msg += `거래소: <b>${exchange.toUpperCase()}</b>  |  전략 ${strategy}번 (${STRATEGY_NAMES[strategy]})\n`;
  msg += `진입가 ±${threshold}% 이내 종목만 포함\n\n`;

  if (passed.length === 0) {
    msg += `오늘은 진입 조건을 충족하는 종목이 없습니다.\n`;
    if (skipped.length > 0)
      msg += `\n신호 발생했으나 조건 미달: ${skipped.map(r => r.symbol).join(', ')}`;
    return msg;
  }

  msg += `📊 <b>오늘 진입 대상 종목 (${passed.length}개)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  passed.forEach((item, idx) => {
    const medal   = medals[idx] ?? `<b>${idx + 1}위</b>`;
    const diff    = ((item.lastClose - item.entryPrice) / item.entryPrice * 100);
    const diffStr = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;

    msg += `\n${medal} <b>${item.symbol}</b>  ${stars(item.score)} (${item.score}/4)\n`;
    msg += `   현재가: ${fmt(item.lastClose)}  |  진입가: ${fmt(item.entryPrice)} (${diffStr})\n`;
    msg += `   백테 승률: <b>${item.winRate.toFixed(0)}%</b>  |  EV: ${item.ev >= 0 ? '+' : ''}${item.ev.toFixed(1)}%\n`;
    if (item.wfVerdict) {
      msg += `   WF: ${item.wfVerdict}(${(item.wfEfficiency ?? 0).toFixed(2)})`;
      if (item.sharpe !== null) msg += `  샤프: ${item.sharpe.toFixed(1)}`;
      if (item.mdd    !== null) msg += `  MDD: ${item.mdd.toFixed(0)}%`;
      if (item.cagr   !== null) msg += `  CAGR: ${item.cagr >= 0 ? '+' : ''}${item.cagr.toFixed(0)}%`;
      msg += `\n`;
    }
    msg += `   목표1: ${fmt(item.target1)} (+10%)  목표2: ${fmt(item.target2)} (+20%)  손절: ${fmt(item.stopLoss)}\n`;
    if (item.strategyDetail) msg += `   📌 ${item.strategyDetail}\n`;
  });

  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⚠️ 포지션 자본의 10~20% 권장 | 손절 필수 준수\n`;
  msg += `이 메시지는 자동 생성됩니다. 투자 결정은 본인 판단으로.`;
  return msg;
}

async function sendTelegram(token: string, chatId: string, text: string) {
  const res  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = await res.json();
  return data as { ok: boolean; description?: string };
}

export async function runDailyReport(opts: DailyReportOptions = {}): Promise<DailyReportResult> {
  const exchange   = opts.exchange   ?? 'upbit';
  const strategyId = opts.strategyId ?? 1;
  const threshold  = opts.threshold  ?? 3;
  const token      = opts.token      ?? '';
  const chatId     = opts.chatId     ?? '';
  const dryRun     = opts.dryRun     ?? false;
  const cfg: FeeConfig = {
    feeRate:      DEFAULT_FEES[exchange].feeRate,
    slippageRate: DEFAULT_FEES[exchange].slippageRate,
  };

  try {
    // ── 1단계: 스캔 ──────────────────────────────
    const symbols      = await getTopSymbols(exchange, 35);
    const screenerHits: { symbol: string; daily: ReturnType<typeof fetchOHLCV> extends Promise<infer T> ? T : never; entryPrice: number; detail?: string }[] = [];

    for (const symbol of symbols) {
      try {
        const daily = await fetchOHLCV(exchange, symbol, '1d', 500);
        if (daily.length < 50) continue;

        const signal = runStrategy(strategyId, daily);
        if (!signal.matched) continue;

        // ── 2단계: 진입가 도달 여부 ──────────────
        const priceDiff = Math.abs(daily[daily.length - 1].close - signal.entryPrice)
                          / signal.entryPrice * 100;
        if (priceDiff > threshold) continue;

        screenerHits.push({ symbol, daily, entryPrice: signal.entryPrice, detail: signal.detail });
        await delay(50);
      } catch { continue; }
    }

    // ── 3단계: 분석 ──────────────────────────────
    const items: ReportItem[] = [];

    for (const { symbol, daily, entryPrice, detail } of screenerHits) {
      const result = buildScreenerResult(symbol, exchange, strategyId, daily, entryPrice, detail);
      const nm     = calcNetMetrics(result.winRate, cfg);

      let wfVerdict: string | null = null, wfEfficiency: number | null = null;
      let sharpe:    number | null = null, mdd: number | null = null;
      let cagr:      number | null = null;

      try { const wf = walkForwardTest(daily, strategyId, symbol); wfVerdict = wf.verdict; wfEfficiency = wf.efficiencyRatio; } catch { /**/ }
      try { const r  = calcRiskMetrics(daily, strategyId, cfg);    sharpe = r.sharpeRatio; mdd = r.maxDrawdown; } catch { /**/ }
      try { const c  = buildCompoundReport(daily, strategyId, cfg, 1_000_000, 20); cagr = c.custom.cagr; } catch { /**/ }

      const score =
        (nm.expectedValue > 0   ? 1 : 0) +
        (wfVerdict === '강건'   ? 1 : 0) +
        (sharpe !== null && mdd !== null && sharpe > 1.0 && mdd < 25 ? 1 : 0) +
        (cagr !== null && cagr > 0 ? 1 : 0);

      items.push({
        symbol,
        lastClose:      result.lastClose,
        entryPrice:     result.entryPrice,
        target1:        result.target1,
        target2:        result.target2,
        stopLoss:       result.stopLoss,
        winRate:        result.winRate,
        ev:             nm.expectedValue,
        score,
        wfVerdict, wfEfficiency, sharpe, mdd, cagr,
        strategyDetail: result.strategyDetail,
      });
    }

    // ── 4단계: 정렬 ──────────────────────────────
    items.sort((a, b) => b.score - a.score || b.winRate - a.winRate || b.ev - a.ev);

    const message = buildMessage(items, exchange, strategyId, threshold);

    // ── 5단계: 전송 ──────────────────────────────
    let sent = false, sendError: string | undefined;
    if (!dryRun && token && chatId) {
      try {
        const r = await sendTelegram(token, chatId, message);
        sent = r.ok;
        if (!r.ok) sendError = r.description;
      } catch (e) { sendError = String(e); }
    }

    return {
      success:     true,
      scanCount:   symbols.length,
      signalCount: screenerHits.length,
      reportCount: items.length,
      items,
      message,
      sent,
      sendError,
    };
  } catch (error) {
    return { success: false, scanCount: 0, signalCount: 0, reportCount: 0, items: [], message: '', sent: false, error: String(error) };
  }
}
