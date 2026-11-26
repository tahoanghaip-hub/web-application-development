# Run from any directory. CreateNew protects an existing environment file.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$envFile = Join-Path $root '.env'
if ([IO.File]::Exists($envFile)) {
    Write-Output 'Using existing .env.'
    return
}

$template = [IO.File]::ReadAllText((Join-Path $root '.env.example'))
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    foreach ($key in 'POSTGRES_PASSWORD', 'IDENTITY_DB_PASSWORD', 'STUDIO_DB_PASSWORD', 'VERIFICATION_HMAC_KEY') {
        $bytes = New-Object byte[] 32
        $rng.GetBytes($bytes)
        $secret = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        $template = $template -replace "(?m)^${key}=(?=\r?$)", "$key=$secret"
    }
    try {
        $stream = [IO.File]::Open($envFile, [IO.FileMode]::CreateNew)
    } catch [IO.IOException] {
        if (![IO.File]::Exists($envFile)) { throw }
        Write-Output 'Using existing .env.'
        return
    }
    try {
        $encoded = [Text.Encoding]::UTF8.GetBytes($template)
        $stream.Write($encoded, 0, $encoded.Length)
    } finally { $stream.Dispose() }
} finally { $rng.Dispose() }
Write-Output 'Created .env with independent secrets.'
