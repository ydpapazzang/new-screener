'use client';
import { useState, useCallback, useEffect } from 'react';
import { Exchange, StrategyId, FeeConfig } from '@/lib/types';
import { loadAlertConfig } from './alert-settings';
import { Button } from './ui/button';
import {
  CalendarClock, Play, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronUp, Info, Clock,
} from 'lucide-react';

interface Props {
  exchange: Exchange;
  strategy: StrategyId;
  feeConfig: FeeConfig;
}

interface ReportItem {
  symbol: string;
  lastClose: number;
  entryPrice: number;
  winRate: number;
  ev: number;
  score: number;
  wfVerdict: string | null;
  sharpe: number | null;
  mdd: number | null;
  cagr: number | null;
}

interface ReportResult {
  success: boolean;
  scanCount: number;
  signalCount: number;
  reportCount: number;
  items: ReportItem[];
  message: string;
  sent: boolean;
  sendError?: string;
  error?: string;
}

const CRON_GUIDE = `# Windows 작업 스케줄러 설정 방법
# 아래 명령어를 매일 저녁 21:00에 실행하도록 등록하세요

# PowerShell 스크립트 (daily-report.ps1)
$url = "http://localhost:3000/api/daily-report?exchange=upbit&strategy=1&token=YOUR_BOT_TOKEN&chatId=YOUR_CHAT_ID"
Invoke-WebRequest -Uri $url -UseBasicParsing | Out-Null

# 등록 방법:
# 1. 작업 스케줄러 열기 (taskschd.msc)
# 2. 기본 작업 만들기 → 매일 → 21:00 설정
# 3. 프로그램 시작 → powershell.exe
# 4. 인수: -File "C:\\경로\\daily-report.ps1"`;

export default function DailyReportPanel({ exchange, strategy, feeConfig }: Props) {
  const [open,      setOpen]      = useState(false);
  const [running,   setRunning]   = useState(false);
  const [result,    setResult]    = useState<ReportResult | null>(null);
  const [threshold, setThreshold] = useState(3);
  const [showGuide, setShowGuide] = useState(false);
  const [lastRun,   setLastRun]   = useState<string | null>(null);
  const [dryRun,    setDryRun]    = useState(false);

  // 마지막 실행 시각 복원
  useEffect(() => {
    const saved = localStorage.getItem('daily_report_last_run');
    if (saved) setLastRun(saved);
  }, []);

  const run = useCallback(async () => {
    const cfg = loadAlertConfig();
    setRunning(true);
    setResult(null);

    const params = new URLSearchParams({
      exchange,
      strategy:     String(strategy),
      feeRate:      String(feeConfig.feeRate),
      slippageRate: String(feeConfig.slippageRate),
      threshold:    String(threshold),
      token:        dryRun ? '' : (cfg.token   ?? ''),
      chatId:       dryRun ? '' : (cfg.chatId  ?? ''),
      dryRun:       String(dryRun),
    });

    try {
      const res  = await fetch(`/api/daily-report?${params}`);
      const data: ReportResult = await res.json();
      setResult(data);
      const now = new Date().toLocaleString('ko-KR', { hour12: false });
      setLastRun(now);
      localStorage.setItem('daily_report_last_run', now);
    } catch (e) {
      setResult({ success: false, error: String(e), scanCount: 0, signalCount: 0, reportCount: 0, items: [], message: '', sent: false });
    } finally {
      setRunning(false);
    }
  }, [exchange, strategy, feeConfig, threshold, dryRun]);

  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(4 - n);

  const scoreColor = (s: number) =>
    s === 4 ? 'text-green-400' :
    s === 3 ? 'text-yellow-400' :
    s === 2 ? 'text-orange-400' : 'text-muted-foreground';

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* 헤더 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          <span className="text-foreground">일일 자동 매매 리포트</span>
          <span className="text-muted-foreground font-normal">— 진입가 도달 종목 텔레그램 발송</span>
          {lastRun && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <Clock className="h-2.5 w-2.5" />
              최근: {lastRun}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {/* 설정 바 */}
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-border bg-muted/5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">진입가 허용 범위</label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={1} max={10} step={0.5}
                  value={threshold}
                  onChange={e => setThreshold(parseFloat(e.target.value))}
                  className="w-24 accent-primary"
                />
                <span className="text-xs font-mono font-bold text-foreground w-12">±{threshold}%</span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setDryRun(v => !v)}
                className={`relative w-8 rounded-full transition-colors cursor-pointer ${dryRun ? 'bg-yellow-600' : 'bg-muted'}`}
                style={{ height: '18px' }}
              >
                <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${dryRun ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-[11px] text-muted-foreground">테스트 실행 (알림 미발송)</span>
            </label>

            <Button
              size="sm"
              onClick={run}
              disabled={running}
              className="h-7 text-xs gap-1.5 ml-auto"
            >
              {running
                ? <><Loader2 className="h-3 w-3 animate-spin" />분석 중...</>
                : <><Play className="h-3 w-3" />지금 실행</>}
            </Button>
          </div>

          {/* 결과 */}
          {running && (
            <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <div>
                <p className="font-medium text-foreground">전체 종목 스캔 + 분석 실행 중...</p>
                <p className="text-xs mt-0.5">거래소 전 종목 OHLCV 수집 → 전략 필터 → WF/리스크/복리 분석 순서로 진행됩니다. 약 1~3분 소요.</p>
              </div>
            </div>
          )}

          {result && !running && (
            <div className="px-4 py-3 space-y-3">
              {/* 실행 요약 */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-muted-foreground">스캔: <span className="text-foreground font-bold">{result.scanCount}개</span></span>
                <span className="text-muted-foreground">신호: <span className="text-foreground font-bold">{result.signalCount}개</span></span>
                <span className="text-muted-foreground">진입가 도달: <span className="text-green-400 font-bold">{result.reportCount}개</span></span>

                {result.sent && (
                  <span className="flex items-center gap-1 text-green-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />텔레그램 전송 완료
                  </span>
                )}
                {result.sendError && (
                  <span className="flex items-center gap-1 text-red-400 font-medium">
                    <XCircle className="h-3.5 w-3.5" />{result.sendError}
                  </span>
                )}
                {dryRun && (
                  <span className="text-yellow-400 text-[10px] font-medium">[테스트 모드 — 실제 알림 미발송]</span>
                )}
                {result.error && (
                  <span className="text-red-400">{result.error}</span>
                )}
              </div>

              {/* 종목 리스트 */}
              {result.items.length > 0 ? (
                <div className="space-y-1.5">
                  {result.items.map((item, i) => {
                    const priceDiff = (item.lastClose - item.entryPrice) / item.entryPrice * 100;
                    return (
                      <div
                        key={item.symbol}
                        className={`rounded-lg border p-3 text-xs space-y-1.5 ${
                          item.score === 4 ? 'border-green-800/50 bg-green-950/15' :
                          item.score === 3 ? 'border-yellow-800/40 bg-yellow-950/10' :
                                            'border-border bg-muted/5'
                        }`}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm">
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {item.symbol}
                            </span>
                            <span className={`font-mono text-sm ${scoreColor(item.score)}`}>{stars(item.score)}</span>
                            <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 border ${
                              item.score === 4 ? 'border-green-700/40 bg-green-900/30 text-green-400' :
                              item.score === 3 ? 'border-yellow-700/40 bg-yellow-900/20 text-yellow-400' :
                                                'border-border bg-muted/20 text-muted-foreground'
                            }`}>{item.score}/4</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>승률 <span className="text-foreground font-bold">{item.winRate.toFixed(0)}%</span></span>
                            <span className={item.ev >= 0 ? 'text-green-400' : 'text-red-400'}>
                              EV {item.ev >= 0 ? '+' : ''}{item.ev.toFixed(1)}%
                            </span>
                            <span className={Math.abs(priceDiff) < 1 ? 'text-green-400 font-bold' : 'text-muted-foreground'}>
                              현재가 {priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                          {item.wfVerdict && (
                            <span>WF <span className="text-foreground">{item.wfVerdict}</span></span>
                          )}
                          {item.sharpe !== null && (
                            <span>샤프 <span className={item.sharpe > 1 ? 'text-green-400' : 'text-red-400'}>{item.sharpe.toFixed(1)}</span></span>
                          )}
                          {item.mdd !== null && (
                            <span>MDD <span className={item.mdd < 25 ? 'text-foreground' : 'text-red-400'}>{item.mdd.toFixed(0)}%</span></span>
                          )}
                          {item.cagr !== null && (
                            <span>CAGR <span className={item.cagr > 0 ? 'text-emerald-400' : 'text-red-400'}>{item.cagr >= 0 ? '+' : ''}{item.cagr.toFixed(0)}%</span></span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md bg-muted/10 border border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  진입가 ±{threshold}% 이내에 도달한 종목이 없습니다.
                  <br />범위를 넓히거나 내일 다시 실행해 보세요.
                </div>
              )}

              {/* 텔레그램 메시지 미리보기 */}
              {result.message && (
                <details className="mt-2">
                  <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none">
                    텔레그램 메시지 미리보기
                  </summary>
                  <pre className="mt-2 rounded-md bg-muted/20 border border-border p-3 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {result.message}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* 자동화 설정 가이드 */}
          <div className="border-t border-border px-4 py-2">
            <button
              onClick={() => setShowGuide(v => !v)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Info className="h-3 w-3" />
              매일 자동 실행 설정 방법 (Windows 작업 스케줄러)
              {showGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showGuide && (
              <pre className="mt-2 mb-2 rounded-md bg-muted/20 border border-border p-3 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {CRON_GUIDE}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
