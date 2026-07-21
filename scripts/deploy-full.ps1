[CmdletBinding()]
param(
  [string]$DescriptionSuffix = "",
  [string]$PagesPublishDir = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

Write-Host "==> Full deploy start" -ForegroundColor Cyan

$deployScriptArgs = @(
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $PSScriptRoot "deploy-script.ps1")
)
if (-not [string]::IsNullOrWhiteSpace($DescriptionSuffix)) {
  $deployScriptArgs += @("-DescriptionSuffix", $DescriptionSuffix)
}

& powershell @deployScriptArgs
if ($LASTEXITCODE -ne 0) {
  throw "GAS deploy failed"
}

$publishArgs = @(
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $PSScriptRoot "publish-portable-publish.ps1"),
  "-Build"
)
$resolvedPagesPublishDir = if (-not [string]::IsNullOrWhiteSpace($PagesPublishDir)) {
  $PagesPublishDir
} elseif (-not [string]::IsNullOrWhiteSpace($env:HURIKAERU_PAGES_PUBLISH_DIR)) {
  $env:HURIKAERU_PAGES_PUBLISH_DIR
} else {
  ""
}
if (-not [string]::IsNullOrWhiteSpace($resolvedPagesPublishDir)) {
  $publishArgs += @("-PublishDir", $resolvedPagesPublishDir)
}

& powershell @publishArgs
if ($LASTEXITCODE -ne 0) {
  throw "Pages publish failed"
}

Write-Host ""
Write-Host "Full deploy completed" -ForegroundColor Green
