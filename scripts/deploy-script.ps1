[CmdletBinding()]
param(
  [string]$ConfigPath = "deploy.config.json",
  [string]$DescriptionSuffix = "",
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action
}

function Get-RequiredConfigValue {
  param(
    [Parameter(Mandatory = $true)]$Config,
    [Parameter(Mandatory = $true)][string]$Name
  )
  $value = $Config.$Name
  if ([string]::IsNullOrWhiteSpace([string]$value)) {
    throw "Missing required config value: $Name"
  }
  return [string]$value
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config file not found: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$deploymentId = Get-RequiredConfigValue -Config $config -Name "webappDeploymentId"
$descriptionPrefix = if ([string]::IsNullOrWhiteSpace([string]$config.descriptionPrefix)) { "deploy" } else { [string]$config.descriptionPrefix }
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$gitSha = (git rev-parse --short HEAD).Trim()
$description = "$descriptionPrefix $timestamp"
if (-not [string]::IsNullOrWhiteSpace($DescriptionSuffix)) {
  $description = "$description $DescriptionSuffix".Trim()
}
$description = "$description $gitSha".Trim()

if (-not $SkipPush) {
  Invoke-Step -Label "clasp push" -Action {
    npx clasp push
    if ($LASTEXITCODE -ne 0) { throw "clasp push failed" }
  }
}

Invoke-Step -Label "Create GAS version" -Action {
  $versionOutput = & npx clasp version $description
  if ($LASTEXITCODE -ne 0) { throw "clasp version failed" }
  $script:versionOutput = $versionOutput
}

$versionMatch = [regex]::Match(($versionOutput | Out-String), "Created version\s+(\d+)")
if (-not $versionMatch.Success) {
  throw "Could not parse version number from clasp output."
}
$versionNumber = $versionMatch.Groups[1].Value

Invoke-Step -Label "Deploy GAS webapp" -Action {
  npx clasp deploy -i $deploymentId -V $versionNumber -d $description
  if ($LASTEXITCODE -ne 0) { throw "clasp deploy failed" }
}

Write-Host ""
Write-Host "GAS deploy completed" -ForegroundColor Green
Write-Host "deploymentId: $deploymentId"
Write-Host "version: $versionNumber"
Write-Host "description: $description"
