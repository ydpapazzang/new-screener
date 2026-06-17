import { NextRequest, NextResponse } from 'next/server';
import { Exchange, StrategyId } from '@/lib/types';
import { runDailyReport } from '@/lib/daily-report';
import { DEFAULT_FEES } from '@/lib/fee-model';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron 또는 CRON_SECRET 보호
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth    = req.headers.get('authorization');
    const isLocal = !req.headers.get('x-forwarded-for');
    if (auth !== `Bearer ${cronSecret}` && !isLocal) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);

  // 환경변수 우선, URL 파라미터는 수동 실행 fallback
  const exchange   = (searchParams.get('exchange')  ?? process.env.DAILY_EXCHANGE  ?? 'upbit') as Exchange;
  const strategyId = parseInt(searchParams.get('strategy') ?? process.env.DAILY_STRATEGY ?? '1') as StrategyId;
  const threshold  = parseFloat(searchParams.get('threshold') ?? process.env.DAILY_THRESHOLD ?? '3');
  const dryRun     = searchParams.get('dryRun') === 'true';
  const token      = process.env.TELEGRAM_BOT_TOKEN ?? searchParams.get('token')  ?? '';
  const chatId     = process.env.TELEGRAM_CHAT_ID   ?? searchParams.get('chatId') ?? '';

  const result = await runDailyReport({ exchange, strategyId, threshold, token, chatId, dryRun });

  return NextResponse.json(result, {
    status: result.success ? 200 : 500,
  });
}
