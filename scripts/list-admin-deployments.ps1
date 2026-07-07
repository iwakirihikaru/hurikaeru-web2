param()

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'
$configPath = Join-Path $workspace 'admin.config.json'
$claspConfigPath = Join-Path $workspace '.clasp.json'

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw
$targetClaspConfig = @{
  scriptId = [string]$config.scriptId
  rootDir = [string]$config.rootDir
} | ConvertTo-Json -Depth 4

try {
  Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8
  & $clasp deployments
  if ($LASTEXITCODE -ne 0) {
    throw 'clasp deployments failed for admin web app.'
  }
}
finally {
  Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
}
