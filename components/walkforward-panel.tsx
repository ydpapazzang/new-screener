'use client';
import { useState, useCallback } from 'react';
import { Exchange, StrategyId } from '@/lib/types';
import { WFSummary, WFWindow } from '@/lib/walk-forward';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { FlaskConical, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

interface Props {
  ticker: string;
  exchange: Exchange;
  strategy: StrategyId;
}

const VERDICT_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  robust:      { color: 'text-green-400',  bg: 'bg-green-950/40',  border: 'border-green-800',  icon: <CheckCircle2  className="h-4 w-4 text-green-400"  /> },
  good:        { color: 'text-yellow-400', bg: 'bg-yellow-950/40', border: 'border-yellow-800', icon: <Info          className="h-4 w-4 text-yellow-400" /> },
  caution:     { color: 'text-orange-400', bg: 'bg-orange-950/40', border: 'border-orange-800', icon: <AlertTriangle className="h-4 w-4 text-orange-400" /> },
  overfit:     { color: 'text-red-400',    bg: 'bg-red-950/40',    border: 'border-red-800',    icon: <XCircle       className="h-4 w-4 text-red-400"    /> },
  insufficient:{ color: 'text-slate-400',  bg: 'bg-slate-900/40',  border: 'border-slate-700',  icon: <Info          className="h-4 w-4 text-slate-400"  /> },
};

function EfficiencyBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 100);
  const color = ratio >= 0.8 ? '#22c55e' : ratio >= 0.6 ? '#eab308' : ratio >= 0.4 ? '#f97316' : '#ef4444';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>과적합</span>
        <span>강건</span>
      </div>
      <div className="relative h-3 rounded-full bg-muted overflow-hidden">
        {/* Zone markers */}
        <div className="absolute inset-0 flex">
          <div className="flex-[40] bg-red-950/60" />
          <div className="flex-[20] bg-orange-950/50" />
          <div className="flex-[20] bg-yellow-950/40" />
          <div className="flex-[20] bg-green-950/50" />
        </div>
        {/* Fill */}
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0%</span><span>40%</span><span>60%</span><span>80%</span><span>100%</span>
      </div>
    </div>
  );
}

function WindowTable({ windows }: { windows: WFWindow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <th className="px-3 py-2 text-left text-muted-foreground">구간</th>
            <th className="px-3 py-2 text-center text-muted-foreground">학습 기간</th>
            <th className="px-3 py-2 text-center text-muted-foreground">검증 기간</th>
            <th className="px-3 py-2 text-center text-yellow-500">학습 신호수</th>
            <th className="px-3 py-2 text-center text-yellow-500">학습 승률 (in)</th>
            <th className="px-3 py-2 text-center text-blue-400">검증 신호수</th>
            <th className="px-3 py-2 text-center text-blue-400">검증 승률 (out) ★</th>
            <th className="px-3 py-2 text-center text-muted-foreground">효율</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((w) => {
            const eff = w.inSampleWinRate > 0 ? w.outSampleWinRate / w.inSampleWinRate : 0;
            const effColor = eff >= 0.8 ? 'text-green-400' : eff >= 0.6 ? 'text-yellow-400' : eff >= 0.4 ? 'text-orange-400' : 'text-red-400';
            return (
              <tr key={w.windowIndex} className="border-b border-border/50 hover:bg-muted/20">
                <td className="px-3 py-2 font-medium text-foreground">#{w.windowIndex + 1}</td>
                <td className="px-3 py-2 text-center text-muted-foreground font-mono">
                  {w.trainStart} ~ {w.trainEnd}
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground font-mono">
                  {w.testStart} ~ {w.testEnd}
                </td>
                <td className="px-3 py-2 text-center">{w.inSampleSignals}회</td>
                <td className="px-3 py-2 text-center text-yellow-400 font-mono font-semibold">
                  {w.inSampleSignals > 0 ? `${w.inSampleWinRate}%` : '—'}
                </td>
                <td className="px-3 py-2 text-center">{w.outSampleSignals}회</td>
                <td className="px-3 py-2 text-center">
                  {w.outSampleSignals > 0 ? (
                    <span className="font-mono font-bold text-blue-400">{w.outSampleWinRate}%</span>
                  ) : (
                    <span className="text-muted-foreground">신호없음</span>
                  )}
                </td>
                <td className={`px-3 py-2 text-center font-mono ${effColor}`}>
                  {w.inSampleWinRate > 0 && w.outSampleSignals > 0
                    ? `${(eff * 100).toFixed(0)}%`
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WFChart({ windows }: { windows: WFWindow[] }) {
  const data = windows.map((w) => ({
    name: `#${w.windowIndex + 1}`,
    '학습 승률 (in)':  w.inSampleSignals  > 0 ? w.inSampleWinRate  : null,
    '검증 승률 (out)': w.outSampleSignals > 0 ? w.outSampleWinRate : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }}
          formatter={(val: number) => [`${val?.toFixed(1)}%`]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <ReferenceLine y={50} stroke="#475569" strokeDasharray="4 2" label={{ value: '50%', fill: '#475569', fontSize: 10 }} />
        <Bar dataKey="학습 승률 (in)"  fill="#eab308" fillOpacity={0.7} radius={[3,3,0,0]} />
        <Bar dataKey="검증 승률 (out)" fill="#3b82f6" fillOpacity={0.9} radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function WalkForwardPanel({ ticker, exchange, strategy }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WFSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(true);

  const runTest = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/walkforward?exchange=${exchange}&symbol=${encodeURIComponent(ticker)}&strategy=${strategy}`,
      );
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data as WFSummary);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [ticker, exchange, strategy]);

  const vc = result ? (VERDICT_CONFIG[result.verdictLevel] ?? VERDICT_CONFIG.insufficient) : null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            워크 포워드 테스트
            <span className="text-xs font-normal text-muted-foreground">
              (학습 180일 / 검증 60일 × 최대 5구간)
            </span>
          </CardTitle>
          <Button
            size="sm"
            variant={result ? 'outline' : 'default'}
            onClick={runTest}
            disabled={loading || !ticker}
            className="h-7 text-xs gap-1.5"
          >
            {loading ? (
              <><span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" />분석 중...</>
            ) : result ? (
              '재실행'
            ) : (
              <><FlaskConical className="h-3 w-3" />WF 테스트 실행</>
            )}
          </Button>
        </div>
        {!ticker && (
          <p className="text-xs text-muted-foreground">스크리너에서 종목을 먼저 선택하세요.</p>
        )}
      </CardHeader>

      {error && (
        <CardContent className="pt-0">
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        </CardContent>
      )}

      {result && vc && (
        <CardContent className="space-y-5 pt-0">

          {/* ── 판정 배너 ── */}
          <div className={`rounded-lg border p-4 ${vc.bg} ${vc.border}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{vc.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-bold text-sm ${vc.color}`}>{result.verdict}</span>
                  <span className="text-xs text-muted-foreground">
                    전략 {result.strategyId} · {result.ticker}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{result.interpretation}</p>
              </div>
            </div>
          </div>

          {/* ── 핵심 지표 카드 3개 ── */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              label="학습 승률 (in-sample)"
              value={`${result.avgInSampleWinRate}%`}
              sub={`${result.totalInSampleSignals}회 진입`}
              color="text-yellow-400"
              note="이 숫자만 보면 안 됨"
            />
            <MetricCard
              label="검증 승률 (out-of-sample) ★"
              value={`${result.avgOutSampleWinRate}%`}
              sub={`${result.totalOutSampleSignals}회 진입`}
              color="text-blue-400"
              note="실전에 가장 가까운 수치"
              highlight
            />
            <MetricCard
              label="효율 비율 (Efficiency)"
              value={`${(result.efficiencyRatio * 100).toFixed(0)}%`}
              sub="out ÷ in"
              color={
                result.efficiencyRatio >= 0.8 ? 'text-green-400'
                : result.efficiencyRatio >= 0.6 ? 'text-yellow-400'
                : result.efficiencyRatio >= 0.4 ? 'text-orange-400'
                : 'text-red-400'
              }
              note="80% 이상 = 강건"
            />
          </div>

          {/* ── 효율 게이지 ── */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">전략 강건성 게이지</p>
            <EfficiencyBar ratio={result.efficiencyRatio} />
          </div>

          {/* ── 구간별 비교 차트 ── */}
          {result.windows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">구간별 학습 vs 검증 승률 비교</p>
              <div className="rounded-md bg-[hsl(224_71.4%_4.1%)] border border-border p-2">
                <WFChart windows={result.windows} />
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                파란 막대(검증 승률)가 노란 막대(학습 승률)에 가까울수록 과적합이 적음
              </p>
            </div>
          )}

          {/* ── 구간 상세 테이블 ── */}
          <div>
            <button
              onClick={() => setShowTable((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
            >
              {showTable ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              구간별 상세 데이터 {showTable ? '접기' : '펼치기'}
            </button>
            {showTable && <WindowTable windows={result.windows} />}
          </div>

          {/* ── 해석 가이드 ── */}
          <div className="rounded-md bg-muted/20 border border-border p-3 space-y-1.5 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground text-xs">판정 기준 해설</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span><span className="text-green-400 font-medium">강건 (≥80%)</span> — 실전에서도 승률이 유지됨</span>
              <span><span className="text-yellow-400 font-medium">양호 (60~79%)</span> — 소폭 성과 저하 예상</span>
              <span><span className="text-orange-400 font-medium">주의 (40~59%)</span> — 포지션 축소 권장</span>
              <span><span className="text-red-400 font-medium">과적합 (&lt;40%)</span> — 이 종목엔 전략 비추천</span>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function MetricCard({
  label, value, sub, color, note, highlight,
}: {
  label: string; value: string; sub: string; color: string; note: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${highlight ? 'border-blue-800 bg-blue-950/20' : 'border-border bg-muted/10'}`}>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className={`text-2xl font-bold font-mono tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
      <p className={`text-[10px] ${highlight ? 'text-blue-400' : 'text-muted-foreground/60'} italic`}>{note}</p>
    </div>
  );
}
