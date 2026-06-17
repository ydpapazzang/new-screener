'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Exchange, StrategyId, FeeConfig, ScreenerResult } from '@/lib/types';
import { calcNetMetrics } from '@/lib/fee-model';
import { loadAlertConfig, sendTelegramAlert } from './alert-settings';
import { Button } from './ui/button';
import {
  LayoutDashboard, Play, Send, CheckCircle2, XCircle, Minus,
  ChevronUp, ChevronDown, Loader2,
} from 'lucide-react';

interface Props {
  results: ScreenerResult[];
  exchange: Exchange;
  strategy: StrategyId;
  feeConfig: FeeConfig;
  displayCurrency: 'KRW' | 'USD';
  usdKrwRate: number;
  onSelectTicker: (ticker: string) => void;
}

type PassState = true | false | null; // true=pass, false=fail, null=미분석

interface TickerRow {
  symbol: string;
  entryPrice: number;
  ev: number;
  evPass: boolean;
  wfVerdict: string | null;
  wfEfficiency: number | null;
  wfPass: PassState;
  sharpe: number | null;
  mdd: number | null;
  riskPass: PassState;
  cagr: number | null;
  kellyPct: number | null;
  compoundPass: PassState;
  score: number;   // 통과한 필터 수 (0~4)
  status: 'pending' | 'loading' | 'done' | 'error';
  errorMsg?: string;
}

const STRATEGY_NAMES: Record<number, string> = {
  1: '장기이평선+라운드피겨',
  2: '거래량급감+도지/망치',
  3: '피보나치 0.5~0.618',
  4: 'StochRSI 과매도',
  5: '박스권 리테스트',
};

function Badge({ pass, label }: { pass: PassState; label: string }) {
  if (pass === null) return <span className="text-[10px] text-muted-foreground">—</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
      pass
        ? 'bg-green-900/30 border border-green-700/40 text-green-400'
        : 'bg-red-900/20 border border-red-800/30 text-red-400'
    }`}>
      {pass ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function ScoreBadge({ score, total = 4 }: { score: number; total?: number }) {
  const color =
    score === 4 ? 'bg-green-900/40 border-green-600/50 text-green-300' :
    score === 3 ? 'bg-yellow-900/30 border-yellow-700/40 text-yellow-300' :
    score === 2 ? 'bg-orange-900/20 border-orange-800/30 text-orange-400' :
                  'bg-muted/30 border-border text-muted-foreground';
  return (
    <span className={`inline-flex items-center justify-center rounded-full border w-12 h-6 text-[11px] font-bold ${color}`}>
      {score}/{total}
    </span>
  );
}

function WfBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return <span className="text-[10px] text-muted-foreground">—</span>;
  const map: Record<string, { color: string; short: string }> = {
    '강건': { color: 'text-green-400 bg-green-900/30 border-green-700/40', short: '강건' },
    '양호': { color: 'text-yellow-400 bg-yellow-900/20 border-yellow-700/30', short: '양호' },
    '주의': { color: 'text-orange-400 bg-orange-900/20 border-orange-800/30', short: '주의' },
    '과적합': { color: 'text-red-400 bg-red-900/20 border-red-800/30', short: '과적합' },
    '샘플부족': { color: 'text-muted-foreground bg-muted/20 border-border', short: '부족' },
  };
  const s = map[verdict] ?? { color: 'text-muted-foreground bg-muted/20 border-border', short: verdict };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${s.color}`}>
      {s.short}
    </span>
  );
}

function buildAlertMessage(
  rows: TickerRow[],
  exchange: Exchange,
  strategy: StrategyId,
  displayCurrency: 'KRW' | 'USD',
  usdKrwRate: number,
): string {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const stratName = STRATEGY_NAMES[strategy] ?? `전략 ${strategy}`;
  const cur = displayCurrency;

  const fmtPrice = (p: number) => {
    if (cur === 'USD') p = p / usdKrwRate;
    return cur === 'KRW'
      ? `₩${Math.round(p).toLocaleString('ko-KR')}`
      : `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };

  const allPass = rows.filter(r => r.score === 4 && r.status === 'done');
  const partial = rows.filter(r => r.score === 3 && r.status === 'done');
  const rest    = rows.filter(r => r.score < 3 && r.status === 'done');

  let msg = `🔔 <b>EOD 퀀트 스크리너</b>\n`;
  msg += `📅 ${now}\n`;
  msg += `거래소: <b>${exchange.toUpperCase()}</b>  |  전략 ${strategy}번 (${stratName})\n\n`;

  if (allPass.length > 0) {
    msg += `✅ <b>4/4 통과 — 매매 대상 (${allPass.length}개)</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n`;
    for (const r of allPass) {
      msg += `📌 <b>${r.symbol}</b>\n`;
      msg += `   진입가: ${fmtPrice(r.entryPrice)}\n`;
      msg += `   EV ${r.ev >= 0 ? '+' : ''}${r.ev.toFixed(1)}%`;
      if (r.wfVerdict)        msg += ` | WF ${r.wfVerdict}(${(r.wfEfficiency ?? 0).toFixed(2)})`;
      if (r.sharpe !== null)  msg += ` | 샤프 ${r.sharpe.toFixed(1)}`;
      if (r.mdd !== null)     msg += ` MDD ${r.mdd.toFixed(0)}%`;
      if (r.cagr !== null)    msg += ` | CAGR ${r.cagr >= 0 ? '+' : ''}${r.cagr.toFixed(0)}%`;
      msg += `\n\n`;
    }
  }

  if (partial.length > 0) {
    msg += `⚠️ <b>3/4 통과 — 참고 (${partial.length}개)</b>\n`;
    msg += partial.map(r => `• ${r.symbol} (EV ${r.ev >= 0 ? '+' : ''}${r.ev.toFixed(1)}%)`).join('\n');
    msg += `\n\n`;
  }

  if (rest.length > 0) {
    msg += `❌ <b>미통과 (${rest.length}개)</b>\n`;
    msg += rest.map(r => r.symbol).join(', ');
    msg += `\n`;
  }

  if (allPass.length === 0 && partial.length === 0) {
    msg += `오늘은 조건을 통과한 종목이 없습니다.\n`;
  }

  return msg;
}

const CONCURRENCY = 2;

export default function DashboardPanel({
  results,
  exchange,
  strategy,
  feeConfig,
  displayCurrency,
  usdKrwRate,
  onSelectTicker,
}: Props) {
  const [rows,    setRows]    = useState<TickerRow[]>([]);
  const [running, setRunning] = useState(false);
  const [done,    setDone]    = useState(0);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sortKey, setSortKey] = useState<'score' | 'ev' | 'sharpe' | 'cagr'>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const abortRef = useRef(false);

  // 스크리너 결과 변경 시 rows 초기화
  useEffect(() => {
    if (!results.length) { setRows([]); return; }
    const initialized = results.map<TickerRow>(r => {
      const nm = calcNetMetrics(r.winRate, feeConfig);
      return {
        symbol:      r.ticker,
        entryPrice:  r.entryPrice,
        ev:          nm.expectedValue,
        evPass:      nm.expectedValue > 0,
        wfVerdict: null, wfEfficiency: null, wfPass: null,
        sharpe: null, mdd: null, riskPass: null,
        cagr: null, kellyPct: null, compoundPass: null,
        score:  nm.expectedValue > 0 ? 1 : 0,
        status: 'pending',
      };
    });
    setRows(initialized);
    setDone(0);
    setSendResult(null);
  }, [results, feeConfig]);

  const analyzeOne = useCallback(async (symbol: string) => {
    if (abortRef.current) return;

    const params = (path: string, extra: Record<string, string>) =>
      `/api/${path}?exchange=${exchange}&symbol=${encodeURIComponent(symbol)}&strategy=${strategy}&feeRate=${feeConfig.feeRate}&slippageRate=${feeConfig.slippageRate}` +
      Object.entries(extra).map(([k, v]) => `&${k}=${v}`).join('');

    // 상태: loading
    setRows(prev => prev.map(r => r.symbol === symbol ? { ...r, status: 'loading' } : r));

    try {
      const [wfRes, riskRes, compRes] = await Promise.all([
        fetch(params('walkforward', {})).then(r => r.json()),
        fetch(params('risk', {})).then(r => r.json()),
        fetch(params('compound', { positionPct: '20', initialCapital: '1000000' })).then(r => r.json()),
      ]);

      setRows(prev => prev.map(r => {
        if (r.symbol !== symbol) return r;

        const wfVerdict    = wfRes.verdict    ?? null;
        const wfEfficiency = wfRes.efficiencyRatio ?? null;
        const wfPass: PassState = wfVerdict === '강건' ? true : wfVerdict ? false : null;

        const sharpe = riskRes.sharpeRatio ?? null;
        const mdd    = riskRes.maxDrawdown ?? null;
        const riskPass: PassState = (sharpe !== null && mdd !== null)
          ? (sharpe > 1.0 && mdd < 25)
          : null;

        const cagr    = compRes.custom?.cagr ?? null;
        const kellyPct = compRes.kellyPct ?? null;
        const compoundPass: PassState = cagr !== null ? cagr > 0 : null;

        const score =
          (r.evPass ? 1 : 0) +
          (wfPass === true ? 1 : 0) +
          (riskPass === true ? 1 : 0) +
          (compoundPass === true ? 1 : 0);

        return { ...r, wfVerdict, wfEfficiency, wfPass, sharpe, mdd, riskPass, cagr, kellyPct, compoundPass, score, status: 'done' };
      }));
    } catch (e) {
      setRows(prev => prev.map(r => r.symbol === symbol
        ? { ...r, status: 'error', errorMsg: String(e) }
        : r));
    }

    setDone(d => d + 1);
  }, [exchange, strategy, feeConfig]);

  const runAll = useCallback(async () => {
    if (!rows.length) return;
    abortRef.current = false;
    setRunning(true);
    setDone(0);
    setSendResult(null);

    // 초기화 (pending으로)
    setRows(prev => prev.map(r => ({
      ...r,
      wfVerdict: null, wfEfficiency: null, wfPass: null,
      sharpe: null, mdd: null, riskPass: null,
      cagr: null, kellyPct: null, compoundPass: null,
      score: r.evPass ? 1 : 0,
      status: 'pending',
    })));

    const symbols = rows.map(r => r.symbol);
    for (let i = 0; i < symbols.length; i += CONCURRENCY) {
      if (abortRef.current) break;
      await Promise.all(symbols.slice(i, i + CONCURRENCY).map(analyzeOne));
    }

    setRunning(false);
  }, [rows, analyzeOne]);

  const sendAlert = useCallback(async () => {
    const cfg = loadAlertConfig();
    if (!cfg.token || !cfg.chatId) {
      setSendResult({ ok: false, msg: '텔레그램 설정을 먼저 완료하세요' });
      return;
    }
    setSending(true);
    const text = buildAlertMessage(rows, exchange, strategy, displayCurrency, usdKrwRate);
    const result = await sendTelegramAlert(cfg, text);
    setSendResult(result.ok ? { ok: true, msg: '알림 전송 완료!' } : { ok: false, msg: result.error ?? '전송 실패' });
    setSending(false);
  }, [rows, exchange, strategy, displayCurrency, usdKrwRate]);

  // 정렬
  const sorted = [...rows].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    if (sortKey === 'score')  return mul * (a.score - b.score);
    if (sortKey === 'ev')     return mul * (a.ev - b.ev);
    if (sortKey === 'sharpe') return mul * ((a.sharpe ?? -99) - (b.sharpe ?? -99));
    if (sortKey === 'cagr')   return mul * ((a.cagr ?? -999) - (b.cagr ?? -999));
    return 0;
  });

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k
      ? sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />
      : null;

  const analysisComplete = rows.length > 0 && rows.every(r => r.status === 'done' || r.status === 'error');
  const passCount = rows.filter(r => r.score >= 4).length;

  if (!results.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">다중 종목 전체 분석 대시보드</span>
          <span className="text-xs text-muted-foreground">— 4개 필터 자동 통과 여부 판별</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {analysisComplete && (
            <>
              <span className="text-xs text-muted-foreground">
                완료: <span className="font-bold text-foreground">{rows.filter(r => r.status === 'done').length}/{rows.length}</span>
                {passCount > 0 && (
                  <span className="ml-2 font-bold text-green-400">✅ 4/4 통과: {passCount}개</span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={sendAlert}
                disabled={sending}
                className="h-7 text-xs gap-1.5"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                텔레그램 알림
              </Button>
            </>
          )}
          <Button
            size="sm"
            onClick={runAll}
            disabled={running}
            className="h-7 text-xs gap-1.5"
          >
            {running
              ? <><Loader2 className="h-3 w-3 animate-spin" />분석 중... {done}/{rows.length}</>
              : <><Play className="h-3 w-3" />전체 분석 실행</>}
          </Button>
        </div>
      </div>

      {/* 전송 결과 */}
      {sendResult && (
        <div className={`flex items-center gap-2 px-4 py-2 text-xs font-medium border-b border-border ${
          sendResult.ok ? 'bg-green-950/20 text-green-400' : 'bg-red-950/20 text-red-400'
        }`}>
          {sendResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {sendResult.msg}
        </div>
      )}

      {/* 진행 바 */}
      {running && (
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }}
          />
        </div>
      )}

      {/* 필터 기준 설명 */}
      <div className="flex flex-wrap gap-3 px-4 py-2 border-b border-border bg-muted/5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="text-green-400 font-bold">EV</span> 기댓값 &gt; 0%</span>
        <span className="flex items-center gap-1"><span className="text-blue-400 font-bold">WF</span> 효율성 ≥ 0.8 (강건)</span>
        <span className="flex items-center gap-1"><span className="text-yellow-400 font-bold">리스크</span> 샤프 &gt; 1.0 + MDD &lt; 25%</span>
        <span className="flex items-center gap-1"><span className="text-purple-400 font-bold">CAGR</span> 복리수익률 &gt; 0% (포지션 20%)</span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2 font-medium">종목</th>
              <th
                className="text-center px-3 py-2 font-medium cursor-pointer hover:text-foreground"
                onClick={() => handleSort('ev')}
              >
                EV <SortIcon k="ev" />
              </th>
              <th className="text-center px-3 py-2 font-medium">WF 검증</th>
              <th
                className="text-center px-3 py-2 font-medium cursor-pointer hover:text-foreground"
                onClick={() => handleSort('sharpe')}
              >
                리스크 <SortIcon k="sharpe" />
              </th>
              <th
                className="text-center px-3 py-2 font-medium cursor-pointer hover:text-foreground"
                onClick={() => handleSort('cagr')}
              >
                CAGR <SortIcon k="cagr" />
              </th>
              <th
                className="text-center px-3 py-2 font-medium cursor-pointer hover:text-foreground"
                onClick={() => handleSort('score')}
              >
                종합 <SortIcon k="score" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr
                key={row.symbol}
                onClick={() => onSelectTicker(row.symbol)}
                className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/20 ${
                  row.score === 4 ? 'bg-green-950/10' :
                  row.score === 3 ? 'bg-yellow-950/5'  : ''
                }`}
              >
                {/* 종목 */}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {row.status === 'loading' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />}
                    <span className="font-semibold text-foreground">{row.symbol}</span>
                    {row.score === 4 && row.status === 'done' && (
                      <span className="rounded-full bg-green-900/40 border border-green-700/40 px-1.5 text-[9px] text-green-400 font-bold">PASS</span>
                    )}
                  </div>
                </td>

                {/* EV */}
                <td className="text-center px-3 py-2.5">
                  <Badge
                    pass={row.evPass}
                    label={`${row.ev >= 0 ? '+' : ''}${row.ev.toFixed(1)}%`}
                  />
                </td>

                {/* WF */}
                <td className="text-center px-3 py-2.5">
                  {row.status === 'pending' ? (
                    <Minus className="h-3 w-3 text-muted-foreground mx-auto" />
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      <WfBadge verdict={row.wfVerdict} />
                      {row.wfEfficiency !== null && (
                        <span className="text-[9px] text-muted-foreground">{row.wfEfficiency.toFixed(2)}</span>
                      )}
                    </div>
                  )}
                </td>

                {/* Risk */}
                <td className="text-center px-3 py-2.5">
                  {row.status === 'pending' ? (
                    <Minus className="h-3 w-3 text-muted-foreground mx-auto" />
                  ) : row.sharpe !== null ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <Badge pass={row.riskPass} label={`샤프 ${row.sharpe.toFixed(1)}`} />
                      {row.mdd !== null && (
                        <span className={`text-[9px] ${row.mdd >= 25 ? 'text-red-400' : 'text-muted-foreground'}`}>
                          MDD {row.mdd.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">데이터 없음</span>
                  )}
                </td>

                {/* CAGR */}
                <td className="text-center px-3 py-2.5">
                  {row.status === 'pending' ? (
                    <Minus className="h-3 w-3 text-muted-foreground mx-auto" />
                  ) : row.cagr !== null ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <Badge
                        pass={row.compoundPass}
                        label={`${row.cagr >= 0 ? '+' : ''}${row.cagr.toFixed(0)}%`}
                      />
                      {row.kellyPct !== null && (
                        <span className="text-[9px] text-muted-foreground">
                          켈리 {row.kellyPct}%
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">데이터 없음</span>
                  )}
                </td>

                {/* 종합 */}
                <td className="text-center px-3 py-2.5">
                  <ScoreBadge score={row.score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="px-4 py-2 border-t border-border bg-muted/5 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500/40 mr-1" />4/4 — 매매 대상</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500/30 mr-1" />3/4 — 참고 (조건 완화 시 진입 검토)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-muted/30 mr-1" />≤2/4 — 보류</span>
        <span className="ml-auto">행 클릭 시 해당 종목 차트 이동</span>
      </div>
    </div>
  );
}
