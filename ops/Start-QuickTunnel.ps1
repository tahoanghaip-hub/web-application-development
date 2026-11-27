# Starts a Cloudflare Quick Tunnel over HTTP/2 (avoids UDP/QUIC timeouts that cause Error 1033).
# Usage:
#   powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\ops\Start-QuickTunnel.ps1 -Port 18081
#   powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\ops\Start-QuickTunnel.ps1 -Port 8080
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8080,
    [ValidateSet('http2', 'quic', 'auto')]
    [string]$Protocol = 'http2'
)
$ErrorActionPreference = 'Stop'

$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
if (-not $cloudflared) {
    foreach ($candidate in @(
        "$env:ProgramFiles\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe"
    )) {
        if (Test-Path $candidate) { $cloudflared = $candidate; break }
    }
}
if (-not $cloudflared) {
    throw 'cloudflared not found. Install it with: winget install --id Cloudflare.cloudflared --exact'
}

$target = "http://127.0.0.1:$Port"
try {
    $health = Invoke-WebRequest -UseBasicParsing "$target/health" -TimeoutSec 3
    if ($health.StatusCode -ne 200) { throw "Unexpected status $($health.StatusCode)" }
} catch {
    throw "Local gateway at $target is not healthy. Start Docker Compose first."
}

Write-Output "Starting Cloudflare Quick Tunnel -> $target (protocol=$Protocol)"
Write-Output 'Press Ctrl+C to stop. The trycloudflare.com URL will change on each new run.'
& $cloudflared tunnel --protocol $Protocol --url $target
