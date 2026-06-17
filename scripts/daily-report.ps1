# EOD 퀀트 스크리너 - 일일 자동 리포트
# Windows 작업 스케줄러에 등록하여 매일 21:00에 실행
#
# 설정 방법:
# 1. 아래 변수를 본인 설정에 맞게 수정
# 2. 작업 스케줄러(taskschd.msc) → 기본 작업 만들기
# 3. 매일 → 21:00 → 프로그램 시작
# 4. 프로그램: powershell.exe
# 5. 인수: -NonInteractive -File "D:\workspace\new_screener\scripts\daily-report.ps1"

# ── 설정 ────────────────────────────────────
# 배포된 Vercel URL (예: https://your-app.vercel.app)
# 로컬 실행 시: http://localhost:3000
$BASE_URL   = "https://new-screener.vercel.app"
$EXCHANGE   = "upbit"      # upbit | binance | bithumb
$STRATEGY   = 1            # 1 ~ 5
$THRESHOLD  = 3            # 진입가 ±% 허용 범위

# Vercel에 환경변수로 등록했다면 토큰/ID 생략 가능 (서버에서 env 사용)
# 로컬 개발 시에만 아래 값 입력
$BOT_TOKEN  = ""
$CHAT_ID    = ""
# ─────────────────────────────────────────────

$params = "exchange=$EXCHANGE&strategy=$STRATEGY&threshold=$THRESHOLD"
if ($BOT_TOKEN) { $params += "&token=$BOT_TOKEN" }
if ($CHAT_ID)   { $params += "&chatId=$CHAT_ID" }

$url = "$BASE_URL/api/daily-report?$params"

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 일일 리포트 실행 중..."

try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 300
    $data = $response.Content | ConvertFrom-Json

    if ($data.success) {
        Write-Host "✅ 완료: 스캔 $($data.scanCount)개 / 신호 $($data.signalCount)개 / 리포트 $($data.reportCount)개"
        if ($data.sent)      { Write-Host "📲 텔레그램 전송 완료" }
        if ($data.sendError) { Write-Host "❌ 전송 실패: $($data.sendError)" }
    } else {
        Write-Host "❌ 오류: $($data.error)"
    }
} catch {
    Write-Host "❌ 요청 실패: $_"
}
