import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { token, chatId, text } = await req.json();
    if (!token || !chatId || !text) {
      return NextResponse.json({ error: '파라미터 누락 (token, chatId, text 필요)' }, { status: 400 });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });

    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json({ error: data.description ?? '전송 실패' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
