import { NextResponse } from 'next/server';

let cachedRate: number | null = null;
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10분

export async function GET() {
  if (cachedRate && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ rate: cachedRate, source: 'cache' });
  }

  try {
    // Upbit 공개 API: KRW-USDT 현재가 = 원/달러 환율
    const res = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 },
    });
    const json = await res.json();
    const rate = json?.[0]?.trade_price as number;
    if (!rate || isNaN(rate)) throw new Error('Invalid rate');
    cachedRate = rate;
    cacheTime = Date.now();
    return NextResponse.json({ rate, source: 'upbit' });
  } catch {
    // 실패 시 네이버 환율 fallback (공개 JSON)
    try {
      const res = await fetch(
        'https://quotation-api-cdn.dunamu.com/v1/forex/recent?codes=FRX.KRWUSD',
        { next: { revalidate: 600 } },
      );
      const json = await res.json();
      const rate = json?.[0]?.basePrice as number;
      if (rate && !isNaN(rate)) {
        cachedRate = rate;
        cacheTime = Date.now();
        return NextResponse.json({ rate, source: 'dunamu' });
      }
    } catch { /* ignore */ }

    // 최후 fallback: 고정값
    return NextResponse.json({ rate: 1380, source: 'fallback' });
  }
}
