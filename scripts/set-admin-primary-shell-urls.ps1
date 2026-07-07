param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $workspace 'admin.config.json'

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "admin.config.json was not found."
}

$normalizedBase = [string]$BaseUrl
if ([string]::IsNullOrWhiteSpace($normalizedBase)) {
  throw "BaseUrl is required."
}
$normalizedBase = $normalizedBase.Trim()
if ($normalizedBase.EndsWith('/')) {
  $normalizedBase = $normalizedBase.TrimEnd('/')
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$config.primaryShellConfigUrl = "$normalizedBase/shell-config.json"
$config.primaryMaintenanceUrl = "$normalizedBase/maintenance-status.json"

$config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $configPath -Encoding UTF8

Write-Host "Done:"
Write-Host "  primaryShellConfigUrl:  $($config.primaryShellConfigUrl)"
Write-Host "  primaryMaintenanceUrl:  $($config.primaryMaintenanceUrl)"
