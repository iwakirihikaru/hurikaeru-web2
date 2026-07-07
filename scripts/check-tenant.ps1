param(
  [Parameter(Mandatory = $true)]
  [string]$TenantId
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$tenantsPath = Join-Path $workspace 'tenants.json'

if (-not (Test-Path -LiteralPath $tenantsPath)) {
  throw "tenants.json was not found."
}

$tenantsConfig = Get-Content -LiteralPath $tenantsPath -Raw | ConvertFrom-Json
$tenant = @($tenantsConfig.tenants) | Where-Object { $_.tenantId -eq $TenantId } | Select-Object -First 1

if (-not $tenant) {
  throw "Tenant '$TenantId' was not found in tenants.json."
}

$checks = @(
  @{ Name = 'tenantId'; Value = [string]$tenant.tenantId },
  @{ Name = 'teacherName'; Value = [string]$tenant.teacherName },
  @{ Name = 'scriptId'; Value = [string]$tenant.scriptId },
  @{ Name = 'deploymentId'; Value = [string]$tenant.deploymentId },
  @{ Name = 'spreadsheetId'; Value = [string]$tenant.spreadsheetId },
  @{ Name = 'status'; Value = [string]$tenant.status }
)

$results = $checks | ForEach-Object {
  [pscustomobject]@{
    field = $_.Name
    ok = -not [string]::IsNullOrWhiteSpace([string]$_.Value)
    value = [string]$_.Value
  }
}

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { -not $_.ok }).Count
if ($failed -gt 0) {
  throw "Tenant '$TenantId' is missing $failed required field(s)."
}

Write-Host ""
Write-Host "Tenant '$TenantId' looks structurally valid."
