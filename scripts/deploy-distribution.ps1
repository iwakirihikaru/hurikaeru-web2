$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$deployWebappScript = Join-Path $PSScriptRoot 'deploy-webapp.ps1'
$deployAdminScript = Join-Path $PSScriptRoot 'deploy-admin-webapp.ps1'
$pushTemplateScript = Join-Path $PSScriptRoot 'push-distribution-template.ps1'
$adminConfigPath = Join-Path $workspace 'admin.config.json'

if (-not (Test-Path -LiteralPath $deployWebappScript)) {
  throw "deploy-webapp.ps1 was not found."
}
if (-not (Test-Path -LiteralPath $deployAdminScript)) {
  throw "deploy-admin-webapp.ps1 was not found."
}
if (-not (Test-Path -LiteralPath $pushTemplateScript)) {
  throw "push-distribution-template.ps1 was not found."
}

Write-Host "[distribution] [1/3] deploy main web app"
& $deployWebappScript

$shouldPushTemplate = $false
if (Test-Path -LiteralPath $adminConfigPath) {
  $adminConfig = Get-Content -LiteralPath $adminConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $shouldPushTemplate = -not [string]::IsNullOrWhiteSpace([string]$adminConfig.templateScriptId)
}

if ($shouldPushTemplate) {
  Write-Host ""
  Write-Host "[distribution] [2/3] push distribution template source"
  & $pushTemplateScript
} else {
  Write-Warning "[distribution] templateScriptId is not set in admin.config.json. Skipped pushing the distribution template source."
  Write-Warning "[distribution] The admin page can still hand out an older template copy until templateScriptId is configured."
}

Write-Host ""
Write-Host "[distribution] [3/3] deploy admin distribution page"
& $deployAdminScript

Write-Host ""
Write-Host "[distribution] done"
