[CmdletBinding()]
param(
  [string]$DescriptionSuffix = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

Write-Host "==> Full deploy start" -ForegroundColor Cyan

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "deploy-script.ps1") -DescriptionSuffix $DescriptionSuffix
if ($LASTEXITCODE -ne 0) {
  throw "GAS deploy failed"
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "publish-portable-publish.ps1") -Build
if ($LASTEXITCODE -ne 0) {
  throw "Pages publish failed"
}

Write-Host ""
Write-Host "Full deploy completed" -ForegroundColor Green
