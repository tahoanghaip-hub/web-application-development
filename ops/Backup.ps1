param([string]$Project = 'novelstudio')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$id = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$dest = Join-Path $PSScriptRoot "backups/$id"
New-Item -ItemType Directory -Path $dest | Out-Null

function RunCompose([string[]]$Arguments) {
    & docker compose --project-directory $root -p $Project @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Compose operation failed ($LASTEXITCODE)." }
}

# Studio first. Complete both dumps before advertising a usable backup pair.
foreach ($name in 'studio', 'identity') {
    $tmp = "/tmp/$id-$name.dump"
    try {
        RunCompose @('exec','-T','db','pg_dump','-U','postgres','-Fc','--no-acl','--no-owner','-f',$tmp,$name)
        RunCompose @('cp',"db:$tmp",(Join-Path $dest "$name.dump"))
    } finally {
        RunCompose @('exec','-T','db','rm','-f',$tmp)
    }
}
foreach ($name in 'identity','studio') {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $dest "$name.dump")).Hash
    "$hash $name.dump" | Add-Content -Encoding ASCII -LiteralPath (Join-Path $dest 'checksums.txt')
}
Write-Output $dest
