// Next.js instrumentation hook — 서버 시작 시 1회 실행 (Railway 상시 서버에서만 의미 있음)
export async function register() {
  // Node.js 런타임에서만 실행 (Edge 제외)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // 텔레그램 설정이 없으면 cron 미등록
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('[Cron] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 미설정 — 자동 리포트 비활성화');
    return;
  }

  // node-cron 동적 import (서버 전용)
  const cron = (await import('node-cron')).default;
  const { runDailyReport } = await import('./lib/daily-report');

  const exchange   = (process.env.DAILY_EXCHANGE  ?? 'upbit') as import('./lib/types').Exchange;
  const strategyId = parseInt(process.env.DAILY_STRATEGY  ?? '1') as import('./lib/types').StrategyId;
  const threshold  = parseFloat(process.env.DAILY_THRESHOLD ?? '3');

  // 매일 21:00 KST (Asia/Seoul 타임존 직접 지정)
  cron.schedule('0 21 * * *', async () => {
    const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
    console.log(`[Cron] 일일 리포트 실행 시작: ${ts}`);
    try {
      const result = await runDailyReport({ exchange, strategyId, threshold, token, chatId });
      console.log(`[Cron] 완료 — 스캔 ${result.scanCount}개 / 신호 ${result.signalCount}개 / 리포트 ${result.reportCount}개 / 전송: ${result.sent}`);
      if (result.sendError) console.error('[Cron] 전송 오류:', result.sendError);
    } catch (e) {
      console.error('[Cron] 실행 오류:', e);
    }
  }, { timezone: 'Asia/Seoul' });

  console.log('[Cron] 일일 리포트 스케줄 등록 완료 — 매일 21:00 KST');
}
