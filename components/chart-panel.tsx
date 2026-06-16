'use client';
import { useEffect, useRef, useState } from 'react';
import { ChartData } from '@/lib/types';
import { formatPrice } from '@/lib/utils';

interface Props {
  ticker: string;
  exchange: string;
  strategy: number;
  chartData: ChartData | null;
  loading: boolean;
}

export default function ChartPanel({ ticker, exchange, chartData, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const candleSeriesRef = useRef<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !chartData) return;

    let chart: ReturnType<typeof import('lightweight-charts')['createChart']> | null = null;

    const initChart = async () => {
      try {
        const { createChart, CrosshairMode, LineStyle } = await import('lightweight-charts');

        // Destroy previous chart
        if (chartRef.current) {
          (chartRef.current as { remove: () => void }).remove();
        }

        chart = createChart(containerRef.current!, {
          width: containerRef.current!.clientWidth,
          height: 440,
          layout: {
            background: { color: 'hsl(224 71.4% 4.1%)' },
            textColor: 'hsl(210 20% 65%)',
          },
          grid: {
            vertLines: { color: 'hsl(215 27.9% 16.9%)' },
            horzLines: { color: 'hsl(215 27.9% 16.9%)' },
          },
          crosshair: { mode: CrosshairMode.Normal },
          rightPriceScale: { borderColor: 'hsl(215 27.9% 16.9%)' },
          timeScale: { borderColor: 'hsl(215 27.9% 16.9%)', timeVisible: true },
        });

        chartRef.current = chart;

        // Candlestick series
        const candleSeries = chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });
        candleSeriesRef.current = candleSeries;

        const candleData = chartData.ohlcv.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as unknown as string,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        candleSeries.setData(candleData);

        // Volume series
        const volumeSeries = chart.addHistogramSeries({
          color: '#26a69a',
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        });
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        volumeSeries.setData(
          chartData.ohlcv.map((c) => ({
            time: Math.floor(c.timestamp / 1000) as unknown as string,
            value: c.volume,
            color: c.close >= c.open ? '#26a69a44' : '#ef535044',
          })),
        );

        // Indicator lines
        const { indicators } = chartData;
        const times = chartData.ohlcv.map((c) => Math.floor(c.timestamp / 1000) as unknown as string);

        if (indicators.sma60) {
          const ma60Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'SMA60' });
          ma60Series.setData(
            indicators.sma60
              .map((v, i) => ({ time: times[i], value: v }))
              .filter((d) => !isNaN(d.value)),
          );
        }

        if (indicators.sma120) {
          const ma120Series = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, title: 'SMA120' });
          ma120Series.setData(
            indicators.sma120
              .map((v, i) => ({ time: times[i], value: v }))
              .filter((d) => !isNaN(d.value)),
          );
        }

        if (indicators.ema20) {
          const ema20Series = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, title: 'EMA20' });
          ema20Series.setData(
            indicators.ema20
              .map((v, i) => ({ time: times[i], value: v }))
              .filter((d) => !isNaN(d.value)),
          );
        }

        // Horizontal price lines
        const lastTime = times[times.length - 1];
        const firstTime = times[0];

        const addHLine = (price: number, color: string, lineStyle: number, title: string) => {
          const series = chart!.addLineSeries({
            color,
            lineWidth: 1,
            lineStyle,
            title,
            lastValueVisible: true,
            priceLineVisible: false,
          });
          series.setData([
            { time: firstTime, value: price },
            { time: lastTime, value: price },
          ]);
        };

        // Entry price (dashed blue)
        addHLine(chartData.entryPrice, '#3b82f6', LineStyle.Dashed, '진입가');
        // Target 1 (green dotted)
        addHLine(chartData.target1, '#22c55e', LineStyle.Dotted, '1차목표');
        // Target 2 (emerald dotted)
        addHLine(chartData.target2, '#10b981', LineStyle.Dotted, '2차목표');
        // Stop loss (red dashed)
        addHLine(chartData.stopLoss, '#ef4444', LineStyle.Dashed, '손절가');

        // Fibonacci lines
        if (indicators.fib618 !== undefined) {
          addHLine(indicators.fib618, '#f97316', LineStyle.Dotted, 'Fib 0.618');
        }
        if (indicators.fib50 !== undefined) {
          addHLine(indicators.fib50, '#eab308', LineStyle.Dotted, 'Fib 0.5');
        }
        if (indicators.resistance !== undefined) {
          addHLine(indicators.resistance, '#a855f7', LineStyle.Dashed, '박스 고점');
        }

        chart.timeScale().fitContent();
        setError(null);

        // Resize observer
        const ro = new ResizeObserver(() => {
          if (containerRef.current && chart) {
            chart.applyOptions({ width: containerRef.current.clientWidth });
          }
        });
        ro.observe(containerRef.current!);
        return () => ro.disconnect();
      } catch (e) {
        setError(String(e));
      }
    };

    const cleanup = initChart();
    return () => {
      cleanup.then((fn) => fn?.());
      if (chartRef.current) {
        (chartRef.current as { remove: () => void }).remove();
        chartRef.current = null;
      }
    };
  }, [chartData]);

  if (!ticker) {
    return (
      <div className="flex flex-col items-center justify-center h-[440px] text-muted-foreground border border-dashed border-border rounded-lg">
        <p className="text-sm">테이블에서 종목을 클릭하면 차트가 로드됩니다</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Chart header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-foreground">{ticker}</span>
          <span className="text-xs text-muted-foreground">{exchange.toUpperCase()} · 일봉 (EOD)</span>
        </div>
        {chartData && (
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 h-[2px] bg-blue-500" style={{ borderTop: '2px dashed #3b82f6' }} />
              진입가 {formatPrice(chartData.entryPrice, exchange)}
            </span>
            <span className="text-green-500">
              T1 {formatPrice(chartData.target1, exchange)}
            </span>
            <span className="text-red-500">
              손절 {formatPrice(chartData.stopLoss, exchange)}
            </span>
          </div>
        )}
      </div>

      {/* Chart container */}
      {loading ? (
        <div className="flex items-center justify-center h-[440px] bg-[hsl(224_71.4%_4.1%)]">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs">차트 데이터 로드 중...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-[440px] text-destructive text-sm">
          차트 로드 실패: {error}
        </div>
      ) : (
        <div ref={containerRef} className="w-full" />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-4 py-2 bg-muted/20 border-t border-border text-xs">
        <LegendItem color="#f59e0b" label="SMA 60" />
        <LegendItem color="#8b5cf6" label="SMA 120" />
        <LegendItem color="#3b82f6" label="진입 대기가" dashed />
        <LegendItem color="#22c55e" label="1차 목표가" />
        <LegendItem color="#10b981" label="2차 목표가" />
        <LegendItem color="#ef4444" label="손절가" dashed />
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span
        className="inline-block w-5 h-0"
        style={{
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
