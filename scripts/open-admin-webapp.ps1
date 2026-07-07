param()

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'
$configPath = Join-Path $workspace 'admin.config.json'
$claspConfigPath = Join-Path $workspace '.clasp.json'

if (-not (Test-Path -LiteralPath $clasp)) {
  throw "clasp was not found. Run npm install first."
}

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "admin.config.json was not found. Copy admin.config.json.example first."
}

if (-not (Test-Path -LiteralPath $claspConfigPath)) {
  throw ".clasp.json was not found."
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$scriptId = [string]$config.scriptId
$rootDir = [string]$config.rootDir
if ([string]::IsNullOrWhiteSpace($rootDir)) {
  $rootDir = 'admin-src'
}

$originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw
$targetClaspConfig = @{
  scriptId = $scriptId
  rootDir = $rootDir
} | ConvertTo-Json -Depth 4

try {
  Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8
  & $clasp open
  if ($LASTEXITCODE -ne 0) {
    throw 'clasp open failed for admin web app.'
  }
}
finally {
  Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
}
