'use client';
import { StrategyId } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Area, AreaChart, ComposedChart, Bar,
} from 'recharts';

const STRATEGY_INFO: Record<
  StrategyId,
  { title: string; description: string; conditions: string[]; entry: string; tags: string[] }
> = {
  1: {
    title: '장기 이평선 + 라운드 피겨 겹침',
    description: '주/월봉이 정배열(EMA20 > EMA60 > EMA120)인 상승 추세 속에서, 단기 조정으로 60일 또는 120일 이평선 근처(±1.5%)까지 눌린 매물이 적고 수급이 탄탄한 구간을 진입 타점으로 노립니다.',
    conditions: [
      '주봉/월봉 EMA 20 > EMA 60 > EMA 120 (정배열)',
      '일봉 종가가 60일선 또는 120일선 ±1.5% 내로 눌림',
      '라운드 피겨(심리적 가격) 와 이평선이 겹치는 구간 우선',
    ],
    entry: '해당 이평선과 가장 가까운 라운드 피겨 가격',
    tags: ['추세추종', '이평선', '라운드피겨'],
  },
  2: {
    title: '거래량 급감 + 도지/망치 캔들',
    description: '강한 매수세(대량거래 장대양봉) 이후 조정 과정에서 거래량이 급격히 줄어들어 매도 세력이 소진됐음을 확인합니다. 어제 일봉이 도지나 망치형이면 반등 신호로 해석합니다.',
    conditions: [
      '최근 5일 내 대량 거래(20일 평균의 2배 이상) 장대양봉 발생',
      '이후 1~3일간 음봉 조정, 조정 평균 거래량이 돌파봉의 30% 이하',
      '어제 일봉: 도지(시가-종가 차 0.5% 미만) 또는 망치형(아래꼬리 ≥ 몸통의 2배)',
    ],
    entry: '어제 도지 종가 또는 아래꼬리 50% 지점',
    tags: ['거래량분석', '도지', '망치형'],
  },
  3: {
    title: '피보나치 되돌림 0.5 ~ 0.618 황금비율',
    description: '최근 30일간의 스윙 고점-저점을 기준으로 피보나치 되돌림 레벨을 산출합니다. 0.5~0.618 황금 비율 구간은 통계적으로 지지를 받는 확률이 높아 눌림 매수의 핵심 타점이 됩니다.',
    conditions: [
      '최근 30일 스윙 고점·저점 확인',
      '어제 일봉 종가가 Fib 0.5 ~ 0.618 구간 내 안착',
      'Fib 0.618 라인 ±1% 이내도 포함',
    ],
    entry: '피보나치 0.618 라인 정확한 가격',
    tags: ['피보나치', '황금비율', '스윙'],
  },
  4: {
    title: '스토캐스틱 RSI 과매도 골든크로스',
    description: '중장기 추세(주봉 20선)가 유효한 종목 중 단기 과매도 영역(StochRSI 20 이하)에서 K선이 D선을 상향 돌파하는 골든크로스를 포착합니다. 추세와 모멘텀이 일치하는 신호입니다.',
    conditions: [
      '주봉 종가 > 주봉 SMA 20 (중기 상승 추세 확인)',
      'Stochastic RSI(14,14,3,3) K값 < 20, D값 < 20',
      'K선 > D선 (골든크로스) 또는 K - D < 1 (임박)',
    ],
    entry: '어제 일봉 저가 또는 오늘 시가',
    tags: ['StochRSI', '과매도', '골든크로스'],
  },
  5: {
    title: '매물대 상단 돌파 후 첫 번째 리테스트',
    description: '50일 박스권의 저항선을 강한 거래량으로 돌파한 후, 처음으로 조정을 받아 과거 저항선(현재는 지지선, S/R Flip)에 닿는 구간을 노립니다. 돌파 유효성을 재확인하는 고확률 시나리오입니다.',
    conditions: [
      '최근 50일 박스권 최고점(저항선) 식별',
      '7일 이내 해당 저항선을 강한 거래량(평균의 1.5배 이상)으로 돌파',
      '어제 일봉: 돌파된 저항선(S/R Flip) 위 ±1.5% 내 리테스트',
    ],
    entry: '과거 박스권 고점 가격 (돌파 저항선)',
    tags: ['박스권돌파', 'S/R Flip', '리테스트'],
  },
};

// Mock chart generators per strategy
function Strategy1Chart() {
  const data = Array.from({ length: 60 }, (_, i) => {
    const trend = 100 + i * 0.8;
    const noise = Math.sin(i * 0.5) * 3 + Math.random() * 2 - 1;
    const close = trend + noise;
    const ma60 = trend - 2;
    return { i, close: parseFloat(close.toFixed(2)), ma60: parseFloat(ma60.toFixed(2)) };
  });
  const entryPrice = data[data.length - 1].ma60;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="i" hide />
        <YAxis domain={['auto', 'auto']} hide />
        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }} />
        <Line type="monotone" dataKey="close" stroke="#94a3b8" strokeWidth={1.5} dot={false} name="종가" />
        <Line type="monotone" dataKey="ma60" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="SMA60" strokeDasharray="0" />
        <ReferenceLine y={entryPrice} stroke="#3b82f6" strokeDasharray="6 3" label={{ value: '진입가', fill: '#3b82f6', fontSize: 10 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Strategy2Chart() {
  const data = [
    { day: 1, close: 100, volume: 50 },
    { day: 2, close: 105, volume: 50 },
    { day: 3, close: 115, volume: 200 }, // breakout
    { day: 4, close: 113, volume: 40 },
    { day: 5, close: 111, volume: 35 }, // doji
    { day: 6, close: 111.2, volume: 30 }, // doji
  ];

  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="day" hide />
        <YAxis yAxisId="price" domain={['auto', 'auto']} hide />
        <YAxis yAxisId="vol" orientation="right" hide />
        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }} />
        <Bar yAxisId="vol" dataKey="volume" fill="#475569" opacity={0.5} name="거래량" />
        <Line yAxisId="price" type="monotone" dataKey="close" stroke="#94a3b8" strokeWidth={2} dot={{ fill: '#94a3b8', r: 3 }} name="종가" />
        <ReferenceLine yAxisId="price" y={111} stroke="#3b82f6" strokeDasharray="6 3" label={{ value: '진입가', fill: '#3b82f6', fontSize: 10 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function Strategy3Chart() {
  const high = 130;
  const low = 90;
  const fib618 = high - 0.618 * (high - low);
  const fib50 = high - 0.5 * (high - low);

  const data = Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const price = i < 15
      ? 90 + t * 2 * 40
      : 130 - (t * 2 - 1) * (130 - fib618) * 1.1;
    return { i, close: parseFloat(Math.max(low, price).toFixed(2)) };
  });

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="i" hide />
        <YAxis domain={[low - 5, high + 5]} hide />
        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }} />
        <Area type="monotone" dataKey="close" stroke="#94a3b8" fill="#94a3b820" strokeWidth={1.5} name="종가" />
        <ReferenceLine y={fib50} stroke="#eab308" strokeDasharray="4 2" label={{ value: 'Fib 0.5', fill: '#eab308', fontSize: 10 }} />
        <ReferenceLine y={fib618} stroke="#f97316" strokeDasharray="4 2" label={{ value: 'Fib 0.618', fill: '#f97316', fontSize: 10 }} />
        <ReferenceLine y={fib618} stroke="#3b82f6" strokeDasharray="6 3" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Strategy4Chart() {
  const data = Array.from({ length: 30 }, (_, i) => {
    const stochK = Math.max(0, Math.min(100, 15 + Math.sin(i * 0.4) * 25 + i * 0.5));
    const stochD = Math.max(0, Math.min(100, stochK - 3 + Math.random() * 2));
    return { i, stochK: parseFloat(stochK.toFixed(1)), stochD: parseFloat(stochD.toFixed(1)) };
  });

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="i" hide />
        <YAxis domain={[0, 100]} hide />
        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }} />
        <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '과매도(20)', fill: '#ef4444', fontSize: 10 }} />
        <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 2" label={{ value: '과매수(80)', fill: '#22c55e', fontSize: 10 }} />
        <Line type="monotone" dataKey="stochK" stroke="#3b82f6" strokeWidth={2} dot={false} name="K선" />
        <Line type="monotone" dataKey="stochD" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="D선" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Strategy5Chart() {
  const resistance = 115;
  const data = [
    ...Array.from({ length: 20 }, (_, i) => ({ i, close: 100 + Math.sin(i * 0.8) * 5 + Math.random() * 2 })),
    { i: 20, close: 112, breakout: 112 },
    { i: 21, close: 118, breakout: 118 },
    { i: 22, close: 122, breakout: 122 },
    { i: 23, close: 116, retest: 116 },
    { i: 24, close: resistance + 1, retest: resistance + 1 },
  ].map((d) => ({ ...d, close: parseFloat(d.close.toFixed(2)) }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="i" hide />
        <YAxis domain={[90, 130]} hide />
        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 11 }} />
        <Line type="monotone" dataKey="close" stroke="#94a3b8" strokeWidth={1.5} dot={false} name="종가" />
        <ReferenceLine y={resistance} stroke="#a855f7" strokeDasharray="5 3" label={{ value: '박스 고점 (S/R)', fill: '#a855f7', fontSize: 10 }} />
        <ReferenceLine y={resistance} stroke="#3b82f6" strokeDasharray="6 3" label={{ value: '진입가', fill: '#3b82f6', fontSize: 10, position: 'right' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const STRATEGY_CHARTS: Record<StrategyId, React.ComponentType> = {
  1: Strategy1Chart,
  2: Strategy2Chart,
  3: Strategy3Chart,
  4: Strategy4Chart,
  5: Strategy5Chart,
};

export default function StrategyGuide({ activeStrategy }: { activeStrategy: StrategyId }) {
  const info = STRATEGY_INFO[activeStrategy];
  const ChartComponent = STRATEGY_CHARTS[activeStrategy];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="default" className="text-xs">전략 {activeStrategy}</Badge>
              {info.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>
            <CardTitle className="text-base">{info.title}</CardTitle>
            <CardDescription className="mt-1 text-sm leading-relaxed">{info.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conditions */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">진입 조건</h4>
            <ul className="space-y-2">
              {info.conditions.map((cond, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{cond}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 p-3 rounded-md bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">진입가:</span> {info.entry}
              </p>
            </div>
          </div>

          {/* Example chart */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">이상적인 패턴 예시</h4>
            <div className="rounded-md bg-[hsl(224_71.4%_4.1%)] border border-border p-2">
              <ChartComponent />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              파란 점선 = 오늘 대기 매수 진입가
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
