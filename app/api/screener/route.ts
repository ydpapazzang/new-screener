import { NextRequest, NextResponse } from 'next/server';
import { Exchange, StrategyId, ScreenerApiResponse } from '@/lib/types';
import { getTopSymbols, fetchOHLCV } from '@/lib/data-fetcher';
import { runStrategy } from '@/lib/strategies';
import { buildScreenerResult } from '@/lib/backtester';
import { delay } from '@/lib/utils';

export const maxDuration = 300; // 5 min for Vercel Pro, ignored locally

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exchange = (searchParams.get('exchange') ?? 'upbit') as Exchange;
  const strategyId = parseInt(searchParams.get('strategy') ?? '1') as StrategyId;

  const start = Date.now();

  try {
    const symbols = await getTopSymbols(exchange, 35);
    const results = [];
    let scannedCount = 0;

    for (const symbol of symbols) {
      try {
        const daily = await fetchOHLCV(exchange, symbol, '1d', 500);
        if (daily.length < 50) continue;
        scannedCount++;

        const signal = runStrategy(strategyId, daily);
        if (!signal.matched) continue;

        const result = buildScreenerResult(
          symbol,
          exchange,
          strategyId,
          daily,
          signal.entryPrice,
          signal.detail,
        );
        results.push(result);
        await delay(50);
      } catch {
        // Skip symbols that fail
        continue;
      }
    }

    // Sort by win rate desc
    results.sort((a, b) => b.winRate - a.winRate);

    const response: ScreenerApiResponse = {
      results,
      scannedCount,
      duration: Date.now() - start,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (error) {
    return NextResponse.json(
      { results: [], scannedCount: 0, duration: Date.now() - start, error: String(error) } satisfies ScreenerApiResponse,
      { status: 500 },
    );
  }
}
