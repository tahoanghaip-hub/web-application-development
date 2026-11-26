param([Parameter(Mandatory)][string]$Backup, [ValidateRange(1,65535)][int]$Port = 18080)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$src = (Resolve-Path -LiteralPath $Backup).Path
$hashes = Get-Content -LiteralPath (Join-Path $src 'checksums.txt')
foreach ($name in 'identity','studio') {
    $hash = (Get-FileHash -LiteralPath (Join-Path $src "$name.dump") -Algorithm SHA256).Hash
    if ($hashes -notcontains "$hash $name.dump") { throw "Checksum mismatch: $name" }
}
$project = 'novelstudio-restore-' + [guid]::NewGuid().ToString('N').Substring(0,12)
function RunCompose([string[]]$Arguments) {
    & docker compose --project-directory $root -p $project @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Compose operation failed ($LASTEXITCODE)." }
}
$oldPort = $env:GATEWAY_PORT
$oldBind = $env:GATEWAY_BIND
$oldSecure = $env:COOKIE_SECURE
try {
    $env:GATEWAY_PORT = "$Port"
    $env:GATEWAY_BIND = '127.0.0.1'
    $env:COOKIE_SECURE = 'false'
    Write-Host "Restore project: $project"
    RunCompose @('up','-d','--wait','db')
    foreach ($name in 'identity','studio') {
        $tmp = "/tmp/$project-$name.dump"
        try {
            RunCompose @('cp',(Join-Path $src "$name.dump"),"db:$tmp")
            RunCompose @('exec','-T','db','pg_restore','-U','postgres','--single-transaction','--exit-on-error',
                         '--no-owner','--no-acl',"--role=${name}_app",'-d',$name,$tmp)
        } finally { RunCompose @('exec','-T','db','rm','-f',$tmp) }
    }
    # Browsers share cookies across localhost ports. Invalidate copied sessions before first login.
    RunCompose @('exec','-T','db','psql','-U','postgres','-d','identity','-v','ON_ERROR_STOP=1','-c','DELETE FROM sessions')
    RunCompose @('up','-d','--build','--wait')
    Write-Host "Open http://127.0.0.1:$Port in a private window."
} finally {
    $env:GATEWAY_PORT = $oldPort
    $env:GATEWAY_BIND = $oldBind
    $env:COOKIE_SECURE = $oldSecure
    Write-Host "Stop this test project with: docker compose -p $project down"
}
