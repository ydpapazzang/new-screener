'use client';
import { useState, useCallback } from 'react';
import { Exchange, StrategyId, FeeConfig, RiskMetrics } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { Activity, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';

interface Props {
  ticker: string;
  exchange: Exchange;
  strategy: StrategyId;
  feeConfig: FeeConfig;
}

// Sharpe 판정
function sharpeVerdict(s: number): { label: string; color: string } {
  if (s >= 2.0) return { label: '탁월 (≥2.0)',  color: 'text-green-400' };
  if (s >= 1.0) return { label: '우수 (≥1.0)',  color: 'text-emerald-400' };
  if (s >= 0.5) return { label: '양호 (≥0.5)',  color: 'text-yellow-400' };
  if (s >= 0.0) return { label: '미흡 (<0.5)',  color: 'text-orange-400' };
  return           { label: '음수 (위험)',        color: 'text-red-400' };
}

function MetricCard({
  label, value, sub, color, highlight, desc,
}: {
  label: string; value: string; sub?: string; color: string;
  highlight?: boolean; desc?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 space-y-0.5 ${highlight ? 'border-blue-800 bg-blue-950/20' : 'border-border bg-muted/10'}`}>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className={`text-xl font-bold font-mono tabular-nums ${color}`}>{value}</p>
      {sub  && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      {desc && <p className="text-[10px] text-muted-foreground/60 italic">{desc}</p>}
    </div>
  );
}

// 에쿼티 커브 차트
function EquityChart({ data }: { data: RiskMetrics['equityCurve'] }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-8">데이터 없음</p>;
  const chartData = [{ trade: 0, equity: 100, date: '시작' }, ...data];
  const isProfit  = (data[data.length - 1]?.equity ?? 100) >= 100;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
            <stop offset="95%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="trade" tick={{ fontSize: 10, fill: '#64748b' }} label={{ value: '거래 횟수', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => `${v}`} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }}
          formatter={(v: number) => [`₩${v.toFixed(1)} (초기 ₩100)`, '자산']}
          labelFormatter={(l) => `거래 #${l}`}
        />
        <ReferenceLine y={100} stroke="#475569" strokeDasharray="4 2" />
        <Area
          type="monotone" dataKey="equity"
          stroke={isProfit ? '#22c55e' : '#ef4444'}
          strokeWidth={2}
          fill="url(#eq)"
          name="자산"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// 수익률 분포 히스토그램
function DistributionChart({ data }: { data: RiskMetrics['returnDistribution'] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} barSize={28}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="range" tick={{ fontSize: 9, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }}
          formatter={(v: number) => [v + '회', '거래수']}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.range.startsWith('<') || d.range.startsWith('−') ? '#ef4444' : '#22c55e'}
              fillOpacity={0.8}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// 개별 거래 테이블
function TradeTable({ trades }: { trades: RiskMetrics['trades'] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? trades : trades.slice(-10);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">개별 거래 기록 (최근 {trades.length}건)</p>
        {trades.length > 10 && (
          <button onClick={() => setExpanded(v => !v)} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            {expanded ? <><ChevronUp className="h-3 w-3" />접기</> : <><ChevronDown className="h-3 w-3" />전체 보기</>}
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-2 py-1.5 text-left text-muted-foreground">#</th>
              <th className="px-2 py-1.5 text-left text-muted-foreground">날짜</th>
              <th className="px-2 py-1.5 text-center text-muted-foreground">결과</th>
              <th className="px-2 py-1.5 text-right text-muted-foreground">순수익률</th>
              <th className="px-2 py-1.5 text-right text-muted-foreground">보유일</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.tradeIndex} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-2 py-1.5 text-muted-foreground">{t.tradeIndex + 1}</td>
                <td className="px-2 py-1.5 font-mono text-muted-foreground">{t.date}</td>
                <td className="px-2 py-1.5 text-center">
                  <Badge variant={t.outcome === 'win' ? 'success' : 'destructive'} className="text-[10px] py-0">
                    {t.outcome === 'win' ? '익절' : '손절'}
                  </Badge>
                </td>
                <td className={`px-2 py-1.5 text-right font-mono font-semibold ${t.netReturnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {t.netReturnPct >= 0 ? '+' : ''}{t.netReturnPct.toFixed(2)}%
                </td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">{t.holdingDays}일</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RiskPanel({ ticker, exchange, strategy, feeConfig }: Props) {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setMetrics(null);
    try {
      const params = new URLSearchParams({
        exchange,
        symbol:       ticker,
        strategy:     String(strategy),
        feeRate:      String(feeConfig.feeRate),
        slippageRate: String(feeConfig.slippageRate),
      });
      const res  = await fetch(`/api/risk?${params}`);
      const data = await res.json();
      if (data.error) setError(data.error);
      else setMetrics(data as RiskMetrics);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [ticker, exchange, strategy, feeConfig]);

  const sv = metrics ? sharpeVerdict(metrics.sharpeRatio) : null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            리스크 분석
            <span className="text-xs font-normal text-muted-foreground">
              (샤프 · 소르티노 · 최대낙폭 · 에쿼티 커브)
            </span>
          </CardTitle>
          <Button
            size="sm"
            variant={metrics ? 'outline' : 'default'}
            onClick={runAnalysis}
            disabled={loading || !ticker}
            className="h-7 text-xs gap-1.5"
          >
            {loading
              ? <><span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" />분석 중...</>
              : metrics ? '재실행' : <><Activity className="h-3 w-3" />리스크 분석 실행</>}
          </Button>
        </div>
        {!ticker && <p className="text-xs text-muted-foreground">스크리너에서 종목을 먼저 선택하세요.</p>}
      </CardHeader>

      {error && (
        <CardContent className="pt-0">
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">{error}</div>
        </CardContent>
      )}

      {metrics && sv && (
        <CardContent className="space-y-6 pt-0">

          {/* ── 핵심 지표 8개 ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              label="샤프 비율 (Sharpe)"
              value={metrics.sharpeRatio.toFixed(3)}
              sub={sv.label}
              color={sv.color}
              highlight
              desc="μ/σ, 높을수록 위험 대비 수익 우수"
            />
            <MetricCard
              label="소르티노 비율 (Sortino)"
              value={metrics.sortinoRatio >= 99 ? '∞' : metrics.sortinoRatio.toFixed(3)}
              sub={metrics.sortinoRatio >= 1 ? '우수' : metrics.sortinoRatio >= 0 ? '보통' : '위험'}
              color={metrics.sortinoRatio >= 1 ? 'text-green-400' : metrics.sortinoRatio >= 0 ? 'text-yellow-400' : 'text-red-400'}
              desc="하방 리스크만 반영 (손절만 분모)"
            />
            <MetricCard
              label="최대 낙폭 (Max DD)"
              value={`−${metrics.maxDrawdown.toFixed(1)}%`}
              sub={`최저 자산 ${(100 - metrics.maxDrawdown).toFixed(1)}%`}
              color={metrics.maxDrawdown < 15 ? 'text-green-400' : metrics.maxDrawdown < 30 ? 'text-yellow-400' : 'text-red-400'}
              desc="연속 손실 최악 시나리오"
            />
            <MetricCard
              label="수익 팩터 (PF)"
              value={metrics.profitFactor >= 99 ? '∞' : metrics.profitFactor.toFixed(2)}
              sub={`총익절 / 총손절`}
              color={metrics.profitFactor >= 2 ? 'text-green-400' : metrics.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'}
              desc="2.0 이상 우수 / 1.0 미만 손실"
            />
            <MetricCard
              label="평균 순수익"
              value={`${metrics.avgNetReturn >= 0 ? '+' : ''}${metrics.avgNetReturn.toFixed(2)}%`}
              sub={`표준편차 σ = ${metrics.stdDev.toFixed(2)}%`}
              color={metrics.avgNetReturn >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <MetricCard
              label="평균 익절 / 손절"
              value={`+${metrics.avgWin.toFixed(2)}%`}
              sub={`손절 평균 ${metrics.avgLoss.toFixed(2)}%`}
              color="text-foreground"
              desc={`RR비율 ${metrics.avgLoss !== 0 ? Math.abs(metrics.avgWin / metrics.avgLoss).toFixed(2) : '∞'}:1`}
            />
            <MetricCard
              label="최고 / 최저 거래"
              value={`+${metrics.bestTrade.toFixed(2)}%`}
              sub={`최저 ${metrics.worstTrade.toFixed(2)}%`}
              color="text-foreground"
            />
            <MetricCard
              label="총 거래 / 승률"
              value={`${metrics.winRate.toFixed(1)}%`}
              sub={`${metrics.winCount}승 ${metrics.lossCount}패 (총 ${metrics.tradeCount}회)`}
              color={metrics.winRate >= 55 ? 'text-green-400' : metrics.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}
            />
          </div>

          {/* ── 샤프 비율 기준 해설 ── */}
          <div className="rounded-md bg-muted/20 border border-border p-3">
            <p className="text-[11px] font-semibold text-foreground mb-2">샤프 비율 해석 기준</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
              <span><span className="text-green-400 font-semibold">≥ 2.0</span> — 탁월 (헤지펀드 수준)</span>
              <span><span className="text-emerald-400 font-semibold">≥ 1.0</span> — 우수 (적극 사용 가능)</span>
              <span><span className="text-yellow-400 font-semibold">≥ 0.5</span> — 양호 (보수적 운용 권장)</span>
              <span><span className="text-red-400 font-semibold">&lt; 0.5</span> — 개선 필요 / 음수 위험</span>
            </div>
          </div>

          {/* ── 에쿼티 커브 ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">에쿼티 커브 (초기 자본 ₩100 복리)</p>
              {metrics.equityCurve.length > 0 && (
                <span className={`text-xs font-mono font-bold ${(metrics.equityCurve[metrics.equityCurve.length - 1]?.equity ?? 100) >= 100 ? 'text-green-400' : 'text-red-400'}`}>
                  최종 ₩{metrics.equityCurve[metrics.equityCurve.length - 1]?.equity?.toFixed(1) ?? '100'}
                </span>
              )}
            </div>
            <div className="rounded-md bg-[hsl(224_71.4%_4.1%)] border border-border p-3">
              <EquityChart data={metrics.equityCurve} />
            </div>
          </div>

          {/* ── 수익률 분포 ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">수익률 분포 (히스토그램)</p>
            <div className="rounded-md bg-[hsl(224_71.4%_4.1%)] border border-border p-3">
              <DistributionChart data={metrics.returnDistribution} />
            </div>
          </div>

          {/* ── 최대 낙폭 경고 ── */}
          {metrics.maxDrawdown > 20 && (
            <div className="flex items-start gap-2 rounded-md border border-orange-800 bg-orange-950/20 px-3 py-2 text-xs">
              <TrendingDown className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
              <p className="text-orange-300">
                최대 낙폭 {metrics.maxDrawdown.toFixed(1)}% — 전략 손실이 연속으로 발생한 최악의 구간입니다.
                전체 자본의 {(100 / (1 - metrics.maxDrawdown / 100) - 100).toFixed(0)}%를 회복해야 원금에 도달합니다.
                포지션 크기를 조절해 실제 손실을 이 수준 이하로 관리하세요.
              </p>
            </div>
          )}

          {/* ── 개별 거래 기록 ── */}
          {metrics.trades.length > 0 && <TradeTable trades={metrics.trades} />}
        </CardContent>
      )}
    </Card>
  );
}
