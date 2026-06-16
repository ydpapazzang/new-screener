'use client';
import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Exchange, StrategyId, ScreenerResult, ChartData, FeeConfig } from '@/lib/types';
import { DEFAULT_FEES } from '@/lib/fee-model';
import FilterBar from '@/components/filter-bar';
import ScreenerTable, { DisplayCurrency, formatConverted } from '@/components/screener-table';
import FeeSettings from '@/components/fee-settings';
import StrategyGuide from '@/components/strategy-guide';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart2, BookOpen, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';

const ChartPanel        = dynamic(() => import('@/components/chart-panel'),        { ssr: false });
const WalkForwardPanel  = dynamic(() => import('@/components/walkforward-panel'),  { ssr: false });
const RiskPanel         = dynamic(() => import('@/components/risk-panel'),         { ssr: false });

function CurrencyToggle({
  value,
  rate,
  rateLoading,
  onRefreshRate,
  onChange,
}: {
  value: DisplayCurrency;
  rate: number;
  rateLoading: boolean;
  onRefreshRate: () => void;
  onChange: (c: DisplayCurrency) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Toggle pill */}
      <div className="flex rounded-md border border-border overflow-hidden text-xs font-semibold">
        {(['KRW', 'USD'] as DisplayCurrency[]).map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`px-3 py-1.5 transition-colors ${
              value === c
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted'
            }`}
          >
            {c === 'KRW' ? '₩ 원화' : '$ 달러'}
          </button>
        ))}
      </div>

      {/* Exchange rate badge */}
      <button
        onClick={onRefreshRate}
        disabled={rateLoading}
        title="환율 새로고침"
        className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <RefreshCw className={`h-3 w-3 ${rateLoading ? 'animate-spin' : ''}`} />
        {rateLoading ? '로딩...' : `$1 = ₩${rate.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`}
      </button>
    </div>
  );
}

export default function HomePage() {
  const [exchange, setExchange] = useState<Exchange>('upbit');
  const [strategy, setStrategy] = useState<StrategyId>(1);
  const [loading, setLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('screener');

  // ── 통화 관련 상태 ──
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('KRW');
  const [usdKrwRate, setUsdKrwRate] = useState(1380);
  const [rateLoading, setRateLoading] = useState(false);

  // ── 수수료/슬리피지 설정 ──
  const [feeConfig, setFeeConfig] = useState<FeeConfig>(DEFAULT_FEES['upbit']);

  const fetchRate = useCallback(async () => {
    setRateLoading(true);
    try {
      const res = await fetch('/api/rate');
      const data = await res.json();
      if (data.rate) setUsdKrwRate(data.rate);
    } catch { /* 실패 시 기존값 유지 */ } finally {
      setRateLoading(false);
    }
  }, []);

  // 앱 로드 시 환율 1회 자동 조회
  useEffect(() => { fetchRate(); }, [fetchRate]);

  // 거래소가 바뀌면 기본 통화도 맞춰 전환
  const handleExchangeChange = useCallback((ex: Exchange) => {
    setExchange(ex);
    setDisplayCurrency(ex === 'binance' ? 'USD' : 'KRW');
    setFeeConfig(DEFAULT_FEES[ex]); // 거래소별 수수료 자동 적용
    setResults([]);
    setSelectedTicker(null);
    setChartData(null);
    setError(null);
  }, []);

  const handleScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setSelectedTicker(null);
    setChartData(null);

    try {
      const res = await fetch(`/api/screener?exchange=${exchange}&strategy=${strategy}`);
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setResults(data.results ?? []);
        setScannedCount(data.scannedCount ?? 0);
        setDuration(data.duration ?? 0);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [exchange, strategy]);

  const handleSelectTicker = useCallback(async (ticker: string) => {
    setSelectedTicker(ticker);
    setChartLoading(true);
    setChartData(null);

    try {
      const res = await fetch(
        `/api/chart?exchange=${exchange}&symbol=${encodeURIComponent(ticker)}&strategy=${strategy}`,
      );
      const data = await res.json();
      if (data.data) setChartData(data.data);
    } catch { /* ignore */ } finally {
      setChartLoading(false);
    }
  }, [exchange, strategy]);

  // 가격 변환 helper (InfoRow 등에서 사용)
  const fmtPrice = useCallback((price: number) => {
    const isKrw = exchange === 'upbit' || exchange === 'bithumb';
    let converted = price;
    if (isKrw && displayCurrency === 'USD') converted = price / usdKrwRate;
    if (!isKrw && displayCurrency === 'KRW') converted = price * usdKrwRate;
    return formatConverted(converted, displayCurrency);
  }, [exchange, displayCurrency, usdKrwRate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-[1600px] px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground tracking-tight">EOD 퀀트 스크리너</span>
          </div>
          <span className="text-xs text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground">어제 마감 데이터 기반 5대 눌림목 전략</span>
        </div>
      </header>

      {/* Filter Bar */}
      <FilterBar
        exchange={exchange}
        strategy={strategy}
        loading={loading}
        scannedCount={scannedCount}
        duration={duration}
        onExchangeChange={handleExchangeChange}
        onStrategyChange={setStrategy}
        onScan={handleScan}
      />

      {/* Main Content */}
      <main className="flex-1 mx-auto w-full max-w-[1600px] px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="screener" className="gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" />
              스크리너
              {results.length > 0 && (
                <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 font-bold">
                  {results.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="guide" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              전략 가이드
            </TabsTrigger>
          </TabsList>

          {/* Screener Tab */}
          <TabsContent value="screener" className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {loading && (
              <div className="rounded-lg border border-border bg-card p-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-2 w-2 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{exchange.toUpperCase()} 거래소 전 종목 스캔 중...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      1~2년치 OHLCV 데이터 수집 및 전략 {strategy}번 필터링 중입니다. 잠시 기다려 주세요.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!loading && (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_520px] gap-4">
                {/* Table */}
                <div className="space-y-2">
                  {/* ── 스크리너 헤더 (통화 토글 포함) ── */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-foreground">
                      스크리닝 결과
                      {results.length > 0 && (
                        <span className="ml-2 text-muted-foreground font-normal">{results.length}개 종목</span>
                      )}
                    </h2>
                    <CurrencyToggle
                      value={displayCurrency}
                      rate={usdKrwRate}
                      rateLoading={rateLoading}
                      onRefreshRate={fetchRate}
                      onChange={setDisplayCurrency}
                    />
                  </div>

                  {/* ── 수수료/슬리피지 설정 ── */}
                  <FeeSettings
                    exchange={exchange}
                    config={feeConfig}
                    onChange={setFeeConfig}
                  />

                  <ScreenerTable
                    results={results}
                    selectedTicker={selectedTicker}
                    exchange={exchange}
                    displayCurrency={displayCurrency}
                    usdKrwRate={usdKrwRate}
                    feeConfig={feeConfig}
                    onSelect={handleSelectTicker}
                  />
                </div>

                {/* Chart */}
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-foreground">EOD 차트 &amp; 타점 시각화</h2>
                  <ChartPanel
                    ticker={selectedTicker ?? ''}
                    exchange={exchange}
                    strategy={strategy}
                    chartData={chartData}
                    loading={chartLoading}
                  />

                  {selectedTicker && chartData && (
                    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">매매 플랜</h3>
                        <span className="text-[10px] text-muted-foreground">
                          {displayCurrency === 'KRW' ? '원화(₩) 기준' : '달러($) 기준'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <InfoRow label="진입 대기가" value={fmtPrice(chartData.entryPrice)} className="text-blue-400" />
                        <InfoRow label="1차 목표 (+10%)" value={fmtPrice(chartData.target1)} className="text-green-400" />
                        <InfoRow label="2차 목표 (+20%)" value={fmtPrice(chartData.target2)} className="text-emerald-400" />
                        <InfoRow label="손절가 (-5%)" value={fmtPrice(chartData.stopLoss)} className="text-red-400" />
                      </div>
                      {results.find((r) => r.ticker === selectedTicker) && (
                        <p className="text-xs text-muted-foreground border-t border-border pt-2">
                          {results.find((r) => r.ticker === selectedTicker)?.strategyDetail}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── 워크 포워드 테스트 패널 ── */}
                  <WalkForwardPanel
                    ticker={selectedTicker ?? ''}
                    exchange={exchange}
                    strategy={strategy}
                    feeConfig={feeConfig}
                  />

                  {/* ── 리스크 분석 패널 ── */}
                  <RiskPanel
                    ticker={selectedTicker ?? ''}
                    exchange={exchange}
                    strategy={strategy}
                    feeConfig={feeConfig}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          {/* Strategy Guide Tab */}
          <TabsContent value="guide">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {([1, 2, 3, 4, 5] as StrategyId[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => setStrategy(id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      strategy === id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    전략 {id}
                  </button>
                ))}
              </div>
              <StrategyGuide activeStrategy={strategy} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function InfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${className}`}>{value}</span>
    </div>
  );
}
