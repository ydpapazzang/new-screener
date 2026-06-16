'use client';
import { useState } from 'react';
import { ScreenerResult, Exchange } from '@/lib/types';
import { Badge } from './ui/badge';
import { formatPercent } from '@/lib/utils';
import { ChevronUp, ChevronDown, ChevronsUpDown, TrendingUp, Target, Shield, BarChart2 } from 'lucide-react';

export type DisplayCurrency = 'KRW' | 'USD';

type SortField = keyof Pick<ScreenerResult, 'ticker' | 'lastClose' | 'entryPrice' | 'target1' | 'stopLoss' | 'expectedReturn' | 'winRate' | 'signalCount'>;
type SortDir = 'asc' | 'desc';

interface Props {
  results: ScreenerResult[];
  selectedTicker: string | null;
  exchange: Exchange;
  displayCurrency: DisplayCurrency;
  usdKrwRate: number;
  onSelect: (ticker: string) => void;
}

// KRW거래소(Upbit, Bithumb) → 원화 기본, Binance → 달러 기본
function convertPrice(
  price: number,
  exchange: Exchange,
  displayCurrency: DisplayCurrency,
  rate: number,
): number {
  const isKrw = exchange === 'upbit' || exchange === 'bithumb';
  if (isKrw && displayCurrency === 'USD') return price / rate;
  if (!isKrw && displayCurrency === 'KRW') return price * rate;
  return price;
}

export function formatConverted(
  price: number,
  displayCurrency: DisplayCurrency,
): string {
  if (displayCurrency === 'KRW') {
    if (price >= 1_000_000) return '₩' + Math.round(price).toLocaleString('ko-KR');
    if (price >= 1_000) return '₩' + Math.round(price).toLocaleString('ko-KR');
    if (price >= 1) return '₩' + price.toFixed(2);
    return '₩' + price.toFixed(4);
  }
  // USD
  if (price >= 10_000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (price >= 1) return '$' + price.toFixed(4);
  return '$' + price.toFixed(6);
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
}

export default function ScreenerTable({
  results,
  selectedTicker,
  exchange,
  displayCurrency,
  usdKrwRate,
  onSelect,
}: Props) {
  const [sortField, setSortField] = useState<SortField>('winRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  }

  function fmt(price: number) {
    return formatConverted(convertPrice(price, exchange, displayCurrency, usdKrwRate), displayCurrency);
  }

  const sorted = [...results].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const dir = sortDir === 'asc' ? 1 : -1;
    if (typeof aVal === 'string') return aVal.localeCompare(bVal as string) * dir;
    return ((aVal as number) - (bVal as number)) * dir;
  });

  const Th = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </div>
    </th>
  );

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <BarChart2 className="h-12 w-12 opacity-30" />
        <p className="text-sm">스캔 결과가 없습니다. EOD 스캔을 실행하세요.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <Th field="ticker">티커</Th>
            <Th field="lastClose">전일 종가</Th>
            <Th field="entryPrice">진입가 (대기)</Th>
            <Th field="target1">1차 목표가</Th>
            <Th field="target1">2차 목표가</Th>
            <Th field="stopLoss">손절가</Th>
            <Th field="expectedReturn">예상 수익률</Th>
            <Th field="winRate">백테스팅 승률</Th>
            <Th field="signalCount">발생 횟수</Th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">전략 세부</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const isSelected = row.ticker === selectedTicker;
            return (
              <tr
                key={row.ticker}
                onClick={() => onSelect(row.ticker)}
                className={`border-b border-border cursor-pointer transition-colors hover:bg-muted/40 ${isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}
              >
                <td className="px-3 py-2.5 font-mono font-semibold text-foreground">
                  <div className="flex items-center gap-1.5">
                    {row.ticker.split('/')[0]}
                    <span className="text-xs text-muted-foreground">/{row.ticker.split('/')[1]}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums">{fmt(row.lastClose)}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums font-semibold text-blue-500">{fmt(row.entryPrice)}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-green-500">
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    {fmt(row.target1)}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-emerald-500">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {fmt(row.target2)}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-red-500">
                  <div className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {fmt(row.stopLoss)}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums">
                  <Badge variant={row.expectedReturn >= 10 ? 'success' : 'secondary'}>
                    {formatPercent(row.expectedReturn)}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <WinRateBadge rate={row.winRate} />
                </td>
                <td className="px-3 py-2.5 text-center text-muted-foreground">{row.signalCount}회</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">
                  {row.strategyDetail ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WinRateBadge({ rate }: { rate: number }) {
  const variant = rate >= 65 ? 'success' : rate >= 50 ? 'warning' : 'destructive';
  return <Badge variant={variant}>{rate.toFixed(1)}%</Badge>;
}
