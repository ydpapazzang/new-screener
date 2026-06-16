import { NextRequest, NextResponse } from 'next/server';
import { Exchange, StrategyId, FeeConfig } from '@/lib/types';
import { fetchOHLCV } from '@/lib/data-fetcher';
import { calcRiskMetrics } from '@/lib/risk-metrics';
import { DEFAULT_FEES } from '@/lib/fee-model';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exchange   = (searchParams.get('exchange')  ?? 'upbit') as Exchange;
  const symbol     =  searchParams.get('symbol')    ?? 'BTC/KRW';
  const strategyId = parseInt(searchParams.get('strategy') ?? '1') as StrategyId;
  const feeRate    = parseFloat(searchParams.get('feeRate')      ?? String(DEFAULT_FEES[exchange].feeRate));
  const slipRate   = parseFloat(searchParams.get('slippageRate') ?? String(DEFAULT_FEES[exchange].slippageRate));

  const cfg: FeeConfig = { feeRate, slippageRate: slipRate };

  try {
    const daily = await fetchOHLCV(exchange, symbol, '1d', 500);
    if (daily.length < 150) {
      return NextResponse.json(
        { error: `데이터 부족: ${daily.length}일치 (최소 150일 필요)` },
        { status: 400 },
      );
    }

    const metrics = calcRiskMetrics(daily, strategyId, cfg);
    return NextResponse.json(metrics);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
