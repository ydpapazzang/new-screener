import { NextRequest, NextResponse } from 'next/server';
import { Exchange, StrategyId, ChartApiResponse, IndicatorLines } from '@/lib/types';
import { fetchOHLCV } from '@/lib/data-fetcher';
import { runStrategy } from '@/lib/strategies';
import { sma, ema, stochRsi, fibLevels } from '@/lib/indicators';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exchange = (searchParams.get('exchange') ?? 'upbit') as Exchange;
  const symbol = searchParams.get('symbol') ?? 'BTC/KRW';
  const strategyId = parseInt(searchParams.get('strategy') ?? '1') as StrategyId;

  try {
    const daily = await fetchOHLCV(exchange, symbol, '1d', 200);
    if (daily.length < 10) {
      return NextResponse.json({ data: null, error: 'Insufficient data' }, { status: 404 });
    }

    const signal = runStrategy(strategyId, daily);
    const entryPrice = signal.entryPrice || daily[daily.length - 1].close;

    const closes = daily.map((c) => c.close);
    const indicators: IndicatorLines = {};

    // Strategy-specific indicators
    if (strategyId === 1) {
      indicators.sma60 = sma(closes, 60);
      indicators.sma120 = sma(closes, 120);
    } else if (strategyId === 3) {
      const recent30 = daily.slice(-30);
      const high = Math.max(...recent30.map((c) => c.high));
      const low = Math.min(...recent30.map((c) => c.low));
      const fibs = fibLevels(high, low);
      indicators.fib618 = fibs.fib618;
      indicators.fib50 = fibs.fib50;
    } else if (strategyId === 4) {
      const { k, d } = stochRsi(closes, 14, 14, 3, 3);
      indicators.stochK = k;
      indicators.stochD = d;
      indicators.ema20 = ema(closes, 20);
    } else if (strategyId === 5) {
      const n = daily.length;
      const consolidation = daily.slice(n - 55, n - 7);
      indicators.resistance = Math.max(...consolidation.map((c) => c.high));
    } else {
      // Strategy 2: show simple MAs
      indicators.sma60 = sma(closes, 20);
    }

    const target1 = entryPrice * 1.10;
    const target2 = entryPrice * 1.20;
    const stopLoss = entryPrice * 0.95;

    const response: ChartApiResponse = {
      data: { ohlcv: daily, entryPrice, target1, target2, stopLoss, indicators },
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=3600' },
    });
  } catch (error) {
    return NextResponse.json({ data: null, error: String(error) }, { status: 500 });
  }
}
