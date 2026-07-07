$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$deployWebAppScript = Join-Path $PSScriptRoot 'deploy-webapp.ps1'
$deployTenantsScript = Join-Path $PSScriptRoot 'deploy-all.ps1'

if (-not (Test-Path -LiteralPath $deployWebAppScript)) {
  throw "deploy-webapp.ps1 was not found."
}

if (-not (Test-Path -LiteralPath $deployTenantsScript)) {
  throw "deploy-all.ps1 was not found."
}

Write-Host "[full 1/2] update core web apps (main/template/admin)"
& $deployWebAppScript
if ($LASTEXITCODE -ne 0) {
  throw "Core web app deployment failed."
}

Write-Host ""
Write-Host "[full 2/2] redeploy all active tenants"
& $deployTenantsScript
if ($LASTEXITCODE -ne 0) {
  throw "Tenant redeploy failed."
}

Write-Host ""
Write-Host "Full deployment completed."
