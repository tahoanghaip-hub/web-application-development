# Run from any directory. CreateNew protects an existing environment file.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$template = [IO.File]::ReadAllText((Join-Path $root '.env.example'))
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    foreach ($key in 'POSTGRES_PASSWORD', 'IDENTITY_DB_PASSWORD', 'STUDIO_DB_PASSWORD') {
        $bytes = New-Object byte[] 32
        $rng.GetBytes($bytes)
        $secret = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        $template = $template -replace "(?m)^${key}=(?=\r?$)", "$key=$secret"
    }
    $stream = [IO.File]::Open((Join-Path $root '.env'), [IO.FileMode]::CreateNew)
    try {
        $encoded = [Text.Encoding]::UTF8.GetBytes($template)
        $stream.Write($encoded, 0, $encoded.Length)
    } finally { $stream.Dispose() }
} finally { $rng.Dispose() }
Write-Output 'Created .env with three independent passwords.'
