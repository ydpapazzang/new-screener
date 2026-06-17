'use client';
import { useState, useCallback } from 'react';
import { Exchange, StrategyId, FeeConfig } from '@/lib/types';
import { CompoundReport, SimResult } from '@/lib/compound-sim';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell,
} from 'recharts';
import { Coins, TrendingUp, TrendingDown, Info } from 'lucide-react';

interface Props {
  ticker: string;
  exchange: Exchange;
  strategy: StrategyId;
  feeConfig: FeeConfig;
  displayCurrency: 'KRW' | 'USD';
  usdKrwRate: number;
}

const SCENARIO_COLORS = ['#6366f1', '#3b82f6', '#f59e0b'];
const SCENARIO_LABELS = ['보수 10%', '중립 20%', '공격 50%'];

function fmtMoney(v: number, cur: 'KRW' | 'USD', rate: number) {
  const val = cur === 'USD' ? v / rate : v;
  if (cur === 'KRW') {
    if (val >= 100_000_000) return `₩${(val / 100_000_000).toFixed(2)}억`;
    if (val >= 10_000)      return `₩${Math.round(val).toLocaleString('ko-KR')}`;
    return `₩${val.toFixed(0)}`;
  }
  return val >= 10_000 ? `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${val.toFixed(2)}`;
}

// ── 자본 성장 곡선 (3개 시나리오 비교) ────────
function GrowthChart({
  scenarios, cur, rate,
}: { scenarios: SimResult[]; cur: 'KRW' | 'USD'; rate: number }) {
  const maxLen = Math.max(...scenarios.map(s => s.curve.length));
  const data = Array.from({ length: maxLen }, (_, i) => {
    const row: Record<string, unknown> = { trade: i + 1 };
    scenarios.forEach((s, si) => {
      row[SCENARIO_LABELS[si]] = s.curve[i]?.capital ?? null;
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <defs>
          {scenarios.map((_, si) => (
            <linearGradient key={si} id={`g${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={SCENARIO_COLORS[si]} stopOpacity={0.25} />
              <stop offset="95%" stopColor={SCENARIO_COLORS[si]} stopOpacity={0.0}  />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="trade" tick={{ fontSize: 10, fill: '#64748b' }} label={{ value: '거래 횟수', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => cur === 'KRW' && v >= 1_000_000 ? `₩${(v/1_000_000).toFixed(1)}M` : `${v}`} width={70} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }}
          formatter={(v: number, name: string) => [fmtMoney(v, cur, rate), name]}
          labelFormatter={(l) => `거래 #${l}`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {scenarios.map((_, si) => (
          <Area
            key={si}
            type="monotone"
            dataKey={SCENARIO_LABELS[si]}
            stroke={SCENARIO_COLORS[si]}
            strokeWidth={1.5}
            fill={`url(#g${si})`}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 사용자 지정 시나리오 커브 ────────────────
function CustomCurveChart({
  sim, cur, rate,
}: { sim: SimResult; cur: 'KRW' | 'USD'; rate: number }) {
  const data = [{ trade: 0, capital: sim.initialCapital, drawdown: 0 }, ...sim.curve];
  const isProfit = sim.finalCapital >= sim.initialCapital;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="custom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
            <stop offset="95%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="trade" tick={{ fontSize: 10, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => fmtMoney(v, cur, rate)} width={80} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }}
          formatter={(v: number) => [fmtMoney(v, cur, rate), '자산']}
          labelFormatter={(l) => `거래 #${l}`}
        />
        <ReferenceLine y={sim.initialCapital} stroke="#475569" strokeDasharray="4 2" />
        <Area type="monotone" dataKey="capital" stroke={isProfit ? '#22c55e' : '#ef4444'} strokeWidth={2} fill="url(#custom)" name="자산" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 월별 수익률 바차트 ───────────────────────
function MonthlyChart({ data }: { data: SimResult['monthlyReturns'] }) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} barSize={18}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}%`} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }}
          formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, '월 수익률']}
        />
        <ReferenceLine y={0} stroke="#475569" />
        <Bar dataKey="returnPct" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.returnPct >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 시나리오 비교 카드 ─────────────────────
function ScenarioCard({ sim, label, color, cur, rate }: {
  sim: SimResult; label: string; color: string;
  cur: 'KRW' | 'USD'; rate: number;
}) {
  const isProfit = sim.totalReturnPct >= 0;
  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-foreground">{label}</span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">최종 자본</span>
          <span className={`font-mono font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
            {fmtMoney(sim.finalCapital, cur, rate)}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">총 수익률</span>
          <span className={`font-mono ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}{sim.totalReturnPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">CAGR</span>
          <span className={`font-mono ${sim.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {sim.cagr >= 0 ? '+' : ''}{sim.cagr.toFixed(1)}%/yr
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">최대 낙폭</span>
          <span className="font-mono text-orange-400">−{sim.maxDrawdownPct.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">실금액 낙폭</span>
          <span className="font-mono text-orange-400">−{fmtMoney(sim.maxDrawdownAmt, cur, rate)}</span>
        </div>
      </div>
    </div>
  );
}

export default function CompoundPanel({ ticker, exchange, strategy, feeConfig, displayCurrency, usdKrwRate }: Props) {
  const [loading,  setLoading]  = useState(false);
  const [report,   setReport]   = useState<CompoundReport | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  // 사용자 입력
  const [initCap,  setInitCap]  = useState(1_000_000);
  const [posPct,   setPosPct]   = useState(20);

  const cur  = displayCurrency;
  const rate = usdKrwRate;

  const runSim = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setReport(null);

    // displayCurrency가 USD면 입력값을 KRW로 변환해서 서버에 전달
    const capKrw = cur === 'USD' ? initCap * rate : initCap;

    const params = new URLSearchParams({
      exchange,
      symbol:         ticker,
      strategy:       String(strategy),
      feeRate:        String(feeConfig.feeRate),
      slippageRate:   String(feeConfig.slippageRate),
      initialCapital: String(capKrw),
      positionPct:    String(posPct),
    });

    try {
      const res  = await fetch(`/api/compound?${params}`);
      const data = await res.json();
      if (data.error) setError(data.error);
      else setReport(data as CompoundReport);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [ticker, exchange, strategy, feeConfig, initCap, posPct, cur, rate]);

  const customSim = report?.custom;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            복리 수익 시뮬레이션
            <span className="text-xs font-normal text-muted-foreground">
              (초기자본 × 포지션비율 복리 재투자)
            </span>
          </CardTitle>
          <Button
            size="sm"
            variant={report ? 'outline' : 'default'}
            onClick={runSim}
            disabled={loading || !ticker}
            className="h-7 text-xs gap-1.5"
          >
            {loading
              ? <><span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" />시뮬레이션 중...</>
              : report ? '재실행' : <><Coins className="h-3 w-3" />시뮬레이션 실행</>}
          </Button>
        </div>

        {/* 파라미터 입력 */}
        <div className="flex flex-wrap items-center gap-4 mt-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">
              초기 자본 ({cur === 'KRW' ? '원화 ₩' : '달러 $'})
            </label>
            <input
              type="number"
              min={10000}
              step={cur === 'KRW' ? 100000 : 100}
              value={initCap}
              onChange={e => setInitCap(parseFloat(e.target.value) || 1_000_000)}
              className="w-36 rounded-md border border-input bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">포지션 크기 (자본의 %)</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={5} max={100} step={5}
                value={posPct}
                onChange={e => setPosPct(Number(e.target.value))}
                className="w-28 accent-primary"
              />
              <span className="text-xs font-mono font-bold text-foreground w-10">{posPct}%</span>
            </div>
          </div>
          {report && (
            <div className="flex items-start gap-1.5 rounded-md border border-yellow-800/50 bg-yellow-950/20 px-3 py-2 text-[11px] text-yellow-300">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-yellow-400" />
              <div>
                켈리 공식 최적 비율:
                <span className="font-bold ml-1">{report.kellyPct}%</span>
                <span className="text-yellow-400/70 ml-1">(하프 켈리 권장: {report.halfKellyPct}%)</span>
              </div>
            </div>
          )}
        </div>
        {!ticker && <p className="text-xs text-muted-foreground mt-1">스크리너에서 종목을 먼저 선택하세요.</p>}
      </CardHeader>

      {error && (
        <CardContent className="pt-0">
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">{error}</div>
        </CardContent>
      )}

      {report && customSim && (
        <CardContent className="space-y-6 pt-0">

          {/* ── 사용자 지정 시나리오 결과 요약 ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '최종 자본',   value: fmtMoney(customSim.finalCapital, cur, rate),          color: customSim.totalReturnPct >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: '총 수익률',   value: `${customSim.totalReturnPct >= 0 ? '+' : ''}${customSim.totalReturnPct.toFixed(2)}%`,  color: customSim.totalReturnPct >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'CAGR (연환산)', value: `${customSim.cagr >= 0 ? '+' : ''}${customSim.cagr.toFixed(2)}%/yr`,              color: customSim.cagr >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: '최대 낙폭',   value: `−${customSim.maxDrawdownPct.toFixed(2)}%`,           color: customSim.maxDrawdownPct < 20 ? 'text-yellow-400' : 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border border-border bg-muted/10 p-3 space-y-0.5">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold font-mono tabular-nums ${color}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground">포지션 {posPct}% 기준</p>
              </div>
            ))}
          </div>

          {/* ── 사용자 지정 에쿼티 커브 ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">자본 성장 곡선 (포지션 {posPct}%)</p>
              <span className={`text-xs font-mono font-bold ${customSim.totalReturnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtMoney(customSim.initialCapital, cur, rate)} → {fmtMoney(customSim.finalCapital, cur, rate)}
              </span>
            </div>
            <div className="rounded-md bg-[hsl(224_71.4%_4.1%)] border border-border p-3">
              <CustomCurveChart sim={customSim} cur={cur} rate={rate} />
            </div>
          </div>

          {/* ── 3개 시나리오 비교 차트 ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground">포지션 크기별 시나리오 비교 (10% / 20% / 50%)</p>
            <div className="rounded-md bg-[hsl(224_71.4%_4.1%)] border border-border p-3">
              <GrowthChart scenarios={report.scenarios} cur={cur} rate={rate} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {report.scenarios.map((s, i) => (
                <ScenarioCard key={i} sim={s} label={SCENARIO_LABELS[i]} color={SCENARIO_COLORS[i]} cur={cur} rate={rate} />
              ))}
            </div>
          </div>

          {/* ── 월별 수익률 ── */}
          {customSim.monthlyReturns.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">월별 수익률 (포지션 {posPct}%)</p>
              <div className="rounded-md bg-[hsl(224_71.4%_4.1%)] border border-border p-3">
                <MonthlyChart data={customSim.monthlyReturns} />
              </div>
            </div>
          )}

          {/* ── 켈리 공식 해설 ── */}
          <div className="rounded-md bg-muted/20 border border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-primary" />
              켈리 공식 & 포지션 크기 가이드
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-muted-foreground">
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">이 전략의 켈리 공식 결과</p>
                <p>최적 포지션: <span className="font-mono text-yellow-400 font-bold">{report.kellyPct}%</span></p>
                <p>하프 켈리(권장): <span className="font-mono text-green-400 font-bold">{report.halfKellyPct}%</span></p>
                <p>켈리 공식 = 승률 − 패율 / 손익비</p>
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">실전 포지션 가이드</p>
                <p><span className="text-green-400">하프 켈리</span> — 이론적 최적, 낙폭 절반으로 감소</p>
                <p><span className="text-yellow-400">20%</span> — 균형잡힌 실전 표준 (초보 권장)</p>
                <p><span className="text-red-400">50% 초과</span> — 변동성 극대화, 복구 불가 낙폭 위험</p>
              </div>
            </div>

            {/* 실금액 낙폭 경고 */}
            {customSim.maxDrawdownAmt > 0 && (
              <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] ${
                customSim.maxDrawdownPct > 30
                  ? 'border-red-800 bg-red-950/20 text-red-300'
                  : 'border-orange-800 bg-orange-950/20 text-orange-300'
              }`}>
                {customSim.maxDrawdownPct > 30
                  ? <TrendingDown className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                  : <TrendingDown className="h-3.5 w-3.5 text-orange-400 mt-0.5 flex-shrink-0" />}
                <p>
                  포지션 {posPct}% 운용 시 최악의 연속 손실 구간에서{' '}
                  <span className="font-bold">{fmtMoney(customSim.maxDrawdownAmt, cur, rate)}</span>
                  {' '}({customSim.maxDrawdownPct.toFixed(1)}%)를 잃었습니다.
                  이 금액을 심리적으로 감당할 수 있는지 먼저 확인하세요.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
