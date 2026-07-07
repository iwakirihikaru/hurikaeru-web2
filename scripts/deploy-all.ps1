$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$tenantsPath = Join-Path $workspace 'tenants.json'
$deployTenantScript = Join-Path $PSScriptRoot 'deploy-tenant.ps1'

if (-not (Test-Path -LiteralPath $tenantsPath)) {
  throw "tenants.json was not found."
}

if (-not (Test-Path -LiteralPath $deployTenantScript)) {
  throw "deploy-tenant.ps1 was not found."
}

$tenantsConfig = Get-Content -LiteralPath $tenantsPath -Raw | ConvertFrom-Json
$activeTenants = @($tenantsConfig.tenants) | Where-Object { $_.status -eq 'active' }

if (-not $activeTenants -or $activeTenants.Count -eq 0) {
  throw "No active tenants were found in tenants.json."
}

$results = @()

foreach ($tenant in $activeTenants) {
  try {
    & $deployTenantScript -TenantId ([string]$tenant.tenantId)
    $results += [pscustomobject]@{
      tenantId = [string]$tenant.tenantId
      teacherName = [string]$tenant.teacherName
      status = 'success'
      detail = ''
    }
  }
  catch {
    Write-Warning "[tenant:$($tenant.tenantId)] $($_.Exception.Message)"
    $results += [pscustomobject]@{
      tenantId = [string]$tenant.tenantId
      teacherName = [string]$tenant.teacherName
      status = 'failed'
      detail = [string]$_.Exception.Message
    }
  }
}

$successCount = @($results | Where-Object { $_.status -eq 'success' }).Count
$failedCount = @($results | Where-Object { $_.status -eq 'failed' }).Count

Write-Host ""
Write-Host "Deploy summary:"
$results | ForEach-Object {
  if ($_.status -eq 'success') {
    Write-Host "  $($_.tenantId): success ($($_.teacherName))"
  } else {
    Write-Host "  $($_.tenantId): failed ($($_.teacherName))"
    Write-Host "    $($_.detail)"
  }
}
Write-Host ""
Write-Host "Succeeded: $successCount"
Write-Host "Failed:    $failedCount"

if ($failedCount -gt 0) {
  exit 1
}
