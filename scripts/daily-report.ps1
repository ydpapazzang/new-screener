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
$BASE_URL   = "http://localhost:3000"
$EXCHANGE   = "upbit"      # upbit | binance | bithumb
$STRATEGY   = 1            # 1 ~ 5
$THRESHOLD  = 3            # 진입가 ±% 허용 범위
$BOT_TOKEN  = "YOUR_BOT_TOKEN_HERE"
$CHAT_ID    = "YOUR_CHAT_ID_HERE"
# ─────────────────────────────────────────────

$url = "$BASE_URL/api/daily-report?exchange=$EXCHANGE&strategy=$STRATEGY&threshold=$THRESHOLD&token=$BOT_TOKEN&chatId=$CHAT_ID"

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
