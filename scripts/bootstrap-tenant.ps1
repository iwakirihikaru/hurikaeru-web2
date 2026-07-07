param(
  [Parameter(Mandatory = $true)]
  [string]$TenantId,
  [Parameter(Mandatory = $true)]
  [string]$TeacherName,
  [Parameter(Mandatory = $true)]
  [string]$ScriptId,
  [Parameter(Mandatory = $true)]
  [string]$DeploymentId,
  [Parameter(Mandatory = $true)]
  [string]$SpreadsheetId,
  [string]$Group = 'default',
  [string]$Notes = '',
  [string]$Status = 'active',
  [switch]$SkipDeploy,
  [switch]$SkipInit
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$tenantsPath = Join-Path $workspace 'tenants.json'
$deployTenantScript = Join-Path $PSScriptRoot 'deploy-tenant.ps1'
$claspConfigPath = Join-Path $workspace '.clasp.json'
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'

if (-not (Test-Path -LiteralPath $tenantsPath)) {
  throw "tenants.json was not found."
}

if (-not (Test-Path -LiteralPath $claspConfigPath)) {
  throw ".clasp.json was not found."
}

if (-not (Test-Path -LiteralPath $clasp)) {
  throw "clasp was not found. Run npm install first."
}

$tenantsConfig = Get-Content -LiteralPath $tenantsPath -Raw | ConvertFrom-Json
$existing = @($tenantsConfig.tenants) | Where-Object { $_.tenantId -eq $TenantId } | Select-Object -First 1
if ($existing) {
  throw "Tenant '$TenantId' already exists."
}

$newTenant = [pscustomobject]@{
  tenantId = $TenantId
  teacherName = $TeacherName
  scriptId = $ScriptId
  deploymentId = $DeploymentId
  spreadsheetId = $SpreadsheetId
  status = $Status
  group = $Group
  notes = $Notes
}

$updatedTenants = @($tenantsConfig.tenants) + $newTenant
$updatedConfig = [pscustomobject]@{
  version = $tenantsConfig.version
  defaults = $tenantsConfig.defaults
  tenants = $updatedTenants
}
$updatedConfig | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $tenantsPath -Encoding UTF8

Write-Host "Tenant '$TenantId' added to tenants.json"

if (-not $SkipDeploy) {
  & $deployTenantScript -TenantId $TenantId
  if ($LASTEXITCODE -ne 0) {
    throw "deploy-tenant.ps1 failed for tenant '$TenantId'."
  }
}

if (-not $SkipInit) {
  $originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw
  $targetClaspConfig = @{
    scriptId = $ScriptId
    rootDir = 'src'
  } | ConvertTo-Json -Depth 4
  try {
    Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8
    Write-Host "[tenant:$TenantId] run initSheets"
    & $clasp run 'initSheets'
    if ($LASTEXITCODE -ne 0) {
      throw "clasp run initSheets failed for tenant '$TenantId'."
    }
  }
  finally {
    Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
  }
}

Write-Host ""
Write-Host "Bootstrap complete for tenant '$TenantId'."
