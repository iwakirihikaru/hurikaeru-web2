$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$tenantsPath = Join-Path $workspace 'tenants.json'

if (-not (Test-Path -LiteralPath $tenantsPath)) {
  throw "tenants.json was not found."
}

$tenantsConfig = Get-Content -LiteralPath $tenantsPath -Raw | ConvertFrom-Json
$tenants = @($tenantsConfig.tenants)

if (-not $tenants.Count) {
  Write-Host "No tenants found."
  exit 0
}

$tenants |
  Sort-Object tenantId |
  Select-Object tenantId, teacherName, status, group, scriptId, deploymentId, spreadsheetId, notes |
  Format-Table -AutoSize
