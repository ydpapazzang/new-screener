'use client';
import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, ChevronDown, ChevronUp, CheckCircle2, XCircle, Send } from 'lucide-react';
import { Button } from './ui/button';

export interface AlertConfig {
  token: string;
  chatId: string;
  autoSend: boolean;
}

const STORAGE_KEY = 'eod_alert_config';

export function loadAlertConfig(): AlertConfig {
  if (typeof window === 'undefined') return { token: '', chatId: '', autoSend: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { token: '', chatId: '', autoSend: false };
  } catch {
    return { token: '', chatId: '', autoSend: false };
  }
}

export async function sendTelegramAlert(config: AlertConfig, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: config.token, chatId: config.chatId, text }),
    });
    const data = await res.json();
    return data.success ? { ok: true } : { ok: false, error: data.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

interface Props {
  onConfigChange?: (cfg: AlertConfig) => void;
}

export default function AlertSettings({ onConfigChange }: Props) {
  const [open,     setOpen]     = useState(false);
  const [token,    setToken]    = useState('');
  const [chatId,   setChatId]   = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // localStorage에서 로드
  useEffect(() => {
    const cfg = loadAlertConfig();
    setToken(cfg.token);
    setChatId(cfg.chatId);
    setAutoSend(cfg.autoSend);
  }, []);

  const save = useCallback((t: string, c: string, a: boolean) => {
    const cfg: AlertConfig = { token: t, chatId: c, autoSend: a };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    onConfigChange?.(cfg);
  }, [onConfigChange]);

  const handleTest = async () => {
    if (!token || !chatId) return;
    setTesting(true);
    setTestResult(null);
    const result = await sendTelegramAlert({ token, chatId, autoSend }, '✅ EOD 퀀트 스크리너 연결 테스트 성공!\n알림이 정상적으로 전송됩니다.');
    setTestResult(result.ok ? { ok: true, msg: '전송 성공!' } : { ok: false, msg: result.error ?? '전송 실패' });
    setTesting(false);
  };

  const isConfigured = token.length > 20 && chatId.length > 3;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isConfigured
            ? <Bell className="h-3.5 w-3.5 text-green-400" />
            : <BellOff className="h-3.5 w-3.5" />}
          <span>텔레그램 알림 설정</span>
          {isConfigured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-900/30 border border-green-700/40 px-2 py-0.5 text-[10px] text-green-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              연결됨
            </span>
          )}
          {autoSend && isConfigured && (
            <span className="rounded-full bg-primary/20 border border-primary/30 px-2 py-0.5 text-[10px] text-primary font-medium">자동 알림 ON</span>
          )}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* 설정 가이드 */}
          <div className="rounded-md bg-muted/20 border border-border p-3 space-y-1.5 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground">텔레그램 봇 설정 방법</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>텔레그램에서 <span className="font-mono text-primary">@BotFather</span> 검색 → <span className="font-mono">/newbot</span> 명령 실행</li>
              <li>봇 이름 입력 → 발급된 <b>Bot Token</b> 복사 후 아래 입력</li>
              <li>생성된 봇에게 메시지 1개 전송 (아무 내용이나)</li>
              <li>브라우저에서 <span className="font-mono text-primary">https://api.telegram.org/bot&#123;TOKEN&#125;/getUpdates</span> 접속</li>
              <li><span className="font-mono">"chat":&#123;"id": 숫자&#125;</span> 부분의 숫자 = <b>Chat ID</b></li>
            </ol>
          </div>

          {/* 입력 필드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-medium">Bot Token</label>
              <input
                type="password"
                placeholder="123456789:AABBcc..."
                value={token}
                onChange={e => { setToken(e.target.value); save(e.target.value, chatId, autoSend); }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-medium">Chat ID</label>
              <input
                type="text"
                placeholder="-100123456789"
                value={chatId}
                onChange={e => { setChatId(e.target.value); save(token, e.target.value, autoSend); }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* 자동 알림 토글 */}
          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
            <div
              onClick={() => { setAutoSend(v => { save(token, chatId, !v); return !v; }); }}
              className={`relative w-8 h-4.5 rounded-full transition-colors ${autoSend ? 'bg-primary' : 'bg-muted'}`}
              style={{ height: '18px' }}
            >
              <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoSend ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-[11px] text-muted-foreground">스캔 완료 후 자동 알림 전송</span>
          </label>

          {/* 연결 테스트 */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={!isConfigured || testing}
              className="h-7 text-xs gap-1.5"
            >
              <Send className="h-3 w-3" />
              {testing ? '전송 중...' : '연결 테스트'}
            </Button>
            {testResult && (
              <div className={`flex items-center gap-1 text-[11px] font-medium ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {testResult.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5" />
                  : <XCircle className="h-3.5 w-3.5" />}
                {testResult.msg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
