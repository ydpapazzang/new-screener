import { NextRequest, NextResponse } from 'next/server';
import { Exchange, StrategyId } from '@/lib/types';
import { fetchOHLCV } from '@/lib/data-fetcher';
import { walkForwardTest } from '@/lib/walk-forward';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exchange   = (searchParams.get('exchange')  ?? 'upbit') as Exchange;
  const symbol     = searchParams.get('symbol')     ?? 'BTC/KRW';
  const strategyId = parseInt(searchParams.get('strategy') ?? '1') as StrategyId;

  try {
    const daily = await fetchOHLCV(exchange, symbol, '1d', 500);

    if (daily.length < 240) {
      return NextResponse.json(
        { error: `데이터 부족: ${daily.length}일치만 수집됨 (최소 240일 필요)` },
        { status: 400 },
      );
    }

    const result = walkForwardTest(daily, strategyId, symbol);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
