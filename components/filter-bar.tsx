'use client';
import { Exchange, StrategyId } from '@/lib/types';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Search, RefreshCw, Database, Clock } from 'lucide-react';

interface FilterBarProps {
  exchange: Exchange;
  strategy: StrategyId;
  loading: boolean;
  scannedCount: number;
  duration: number;
  onExchangeChange: (ex: Exchange) => void;
  onStrategyChange: (s: StrategyId) => void;
  onScan: () => void;
}

const STRATEGY_OPTIONS = [
  { value: '1', label: '전략 1 — 장기 이평선 + 라운드피겨' },
  { value: '2', label: '전략 2 — 거래량 급감 + 도지/망치 캔들' },
  { value: '3', label: '전략 3 — 피보나치 0.5 ~ 0.618 황금비율' },
  { value: '4', label: '전략 4 — 스토캐스틱 RSI 과매도 골든크로스' },
  { value: '5', label: '전략 5 — 매물대 돌파 후 첫 번째 리테스트' },
];

export default function FilterBar({
  exchange,
  strategy,
  loading,
  scannedCount,
  duration,
  onExchangeChange,
  onStrategyChange,
  onScan,
}: FilterBarProps) {
  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-[1600px] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Exchange Tabs */}
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <Tabs value={exchange} onValueChange={(v) => onExchangeChange(v as Exchange)}>
              <TabsList>
                <TabsTrigger value="upbit">Upbit</TabsTrigger>
                <TabsTrigger value="binance">Binance</TabsTrigger>
                <TabsTrigger value="bithumb">Bithumb</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="h-6 w-px bg-border" />

          {/* Strategy Select */}
          <div className="flex items-center gap-2 min-w-[320px]">
            <Select
              value={String(strategy)}
              onValueChange={(v) => onStrategyChange(parseInt(v) as StrategyId)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="전략 선택" />
              </SelectTrigger>
              <SelectContent>
                {STRATEGY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scan Button */}
          <Button onClick={onScan} disabled={loading} className="gap-2 font-semibold">
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                스캔 중...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                EOD 스캔 실행
              </>
            )}
          </Button>

          {/* Stats */}
          {scannedCount > 0 && !loading && (
            <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                {scannedCount}개 종목 스캔
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {(duration / 1000).toFixed(1)}초
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
