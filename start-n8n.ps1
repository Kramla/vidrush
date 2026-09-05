[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$configurationPath = Join-Path $projectRoot '.env.n8n.local'
$npxPath = Join-Path $env:ProgramFiles 'nodejs\npx.cmd'

if (-not (Test-Path -LiteralPath $configurationPath)) {
  throw 'Missing .env.n8n.local. Restore the private n8n configuration before starting n8n.'
}

if (-not (Test-Path -LiteralPath $npxPath)) {
  throw 'Node.js and npm are required to start n8n.'
}

Get-Content -LiteralPath $configurationPath | ForEach-Object {
  if ($_ -match '^\s*([^#=\s]+)=(.*)$') {
    Set-Item -Path ("Env:" + $Matches[1]) -Value $Matches[2]
  }
}

$env:N8N_USER_FOLDER = Join-Path $projectRoot '.n8n-data'
$env:npm_config_cache = Join-Path (Split-Path -Parent $projectRoot) '.n8n-npm-cache'
$env:N8N_EDITOR_BASE_URL = 'http://127.0.0.1:5678'
$env:WEBHOOK_URL = 'http://127.0.0.1:5678/'
$env:N8N_SECURE_COOKIE = 'false'
$env:NODE_FUNCTION_ALLOW_BUILTIN = 'crypto'

New-Item -ItemType Directory -Path $env:N8N_USER_FOLDER -Force | Out-Null
$cachedN8nBinary = Get-ChildItem -Path (Join-Path $env:npm_config_cache '_npx') -Recurse -File -Filter 'n8n.cmd' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\node_modules\\\.bin\\n8n\.cmd$' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Write-Host 'Starting n8n at http://127.0.0.1:5678. Keep this window open.'

if ($cachedN8nBinary) {
  & $cachedN8nBinary.FullName start
} else {
  Write-Host 'n8n is not cached yet. Downloading it once...'
  & $npxPath --yes --package n8n@2.36.9 n8n start
}
