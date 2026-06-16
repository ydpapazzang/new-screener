'use client';
import { useState } from 'react';
import { FeeConfig, Exchange } from '@/lib/types';
import { DEFAULT_FEES, calcNetMetrics, breakEvenWinRate, roundTripCost } from '@/lib/fee-model';
import { ChevronDown, ChevronUp, Settings2, Info } from 'lucide-react';

interface Props {
  exchange: Exchange;
  config: FeeConfig;
  onChange: (cfg: FeeConfig) => void;
}

const PRESETS: { label: string; exchange: Exchange; desc: string }[] = [
  { label: 'Upbit 기본',   exchange: 'upbit',   desc: '수수료 0.05%' },
  { label: 'Binance 기본', exchange: 'binance', desc: '수수료 0.10%' },
  { label: 'Bithumb 기본', exchange: 'bithumb', desc: '수수료 0.25%' },
];

function NumInput({
  label, value, onChange, unit = '%',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={2}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export default function FeeSettings({ exchange, config, onChange }: Props) {
  const [open, setOpen] = useState(false);

  // 현재 설정 기준 지표 (대표 승률 60%로 미리 계산)
  const previewMetrics = calcNetMetrics(60, config);
  const bew = breakEvenWinRate(config);
  const rtc = roundTripCost(config);

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      {/* 헤더 (항상 표시) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">수수료 & 슬리피지 설정</span>
          <span className="text-muted-foreground">
            — 수수료 {config.feeRate}% + 슬리피지 {config.slippageRate}% → 왕복비용
            <span className="text-orange-400 font-mono font-semibold ml-1">{rtc.toFixed(2)}%</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono font-semibold ${previewMetrics.expectedValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            EV(60%승률) {previewMetrics.expectedValue >= 0 ? '+' : ''}{previewMetrics.expectedValue}%
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* 펼침 패널 */}
      {open && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 입력 */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground">비용 직접 설정</p>

              {/* 프리셋 버튼 */}
              <div className="flex gap-2 flex-wrap">
                {PRESETS.map((p) => (
                  <button
                    key={p.exchange}
                    onClick={() => onChange(DEFAULT_FEES[p.exchange])}
                    className={`px-2.5 py-1 rounded-md border text-[11px] transition-colors ${
                      config.feeRate === DEFAULT_FEES[p.exchange].feeRate &&
                      config.slippageRate === DEFAULT_FEES[p.exchange].slippageRate
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    {p.label}
                    <span className="ml-1 opacity-60">{p.desc}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-4 flex-wrap">
                <NumInput
                  label="거래소 수수료 (편도 %)"
                  value={config.feeRate}
                  onChange={(v) => onChange({ ...config, feeRate: v })}
                />
                <NumInput
                  label="슬리피지 (편도 %)"
                  value={config.slippageRate}
                  onChange={(v) => onChange({ ...config, slippageRate: v })}
                />
              </div>

              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground mt-1">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>슬리피지: 호가창 공백, 시장가 체결 오차 등으로 실제 체결가가 예상보다 불리해지는 비용. 유동성 낮은 알트코인일수록 크게 설정 권장.</span>
              </div>
            </div>

            {/* 지표 요약 */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground">현재 설정 기준 손익 구조</p>
              <div className="grid grid-cols-2 gap-2">
                <MetricBox label="왕복 총비용" value={`−${rtc.toFixed(2)}%`} color="text-orange-400" />
                <MetricBox label="익절 시 순수익" value={`+${previewMetrics.netWinPct.toFixed(2)}%`} color="text-green-400" sub="목표 +10% 기준" />
                <MetricBox label="손절 시 순손실" value={`${previewMetrics.netLossPct.toFixed(2)}%`} color="text-red-400" sub="손절 −5% 기준" />
                <MetricBox
                  label="손익분기 승률"
                  value={`${bew.toFixed(1)}%`}
                  color={bew <= 35 ? 'text-green-400' : bew <= 45 ? 'text-yellow-400' : 'text-red-400'}
                  sub="이 이상이면 EV > 0"
                />
              </div>

              {/* EV 시뮬레이션 */}
              <div className="rounded-md bg-muted/20 border border-border p-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">기댓값(EV) 시뮬레이션</p>
                {[40, 50, 55, 60, 65, 70].map((wr) => {
                  const ev = calcNetMetrics(wr, config).expectedValue;
                  const isPositive = ev >= 0;
                  return (
                    <div key={wr} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-14">승률 {wr}%</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(Math.abs(ev) * 10, 100)}%`, opacity: 0.8 }}
                        />
                      </div>
                      <span className={`text-[11px] font-mono w-14 text-right font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{ev.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/10 px-3 py-2 space-y-0.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-base font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
    </div>
  );
}
