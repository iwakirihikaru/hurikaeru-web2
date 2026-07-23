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

function Get-TrimmedCommandOutput {
  param(
    [Parameter(Mandatory = $true)][string[]]$Command
  )
  $result = & $Command[0] $Command[1..($Command.Length - 1)]
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $($Command -join ' ')"
  }
  return ($result | Out-String).Trim()
}

function Test-HeadPushedToUpstream {
  $null = Get-TrimmedCommandOutput -Command @("git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
  & git merge-base --is-ancestor HEAD "@{u}"
  return $LASTEXITCODE -eq 0
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config file not found: $ConfigPath"
}

$dirtyEntries = git status --short
if ($LASTEXITCODE -ne 0) {
  throw "git status --short failed"
}
if (($dirtyEntries | Out-String).Trim()) {
  throw "Refusing deploy with a dirty git worktree."
}

if (-not (Test-HeadPushedToUpstream)) {
  throw "Refusing deploy because HEAD is not pushed to upstream."
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$deploymentId = Get-RequiredConfigValue -Config $config -Name "webappDeploymentId"
$gitSha = Get-TrimmedCommandOutput -Command @("git", "rev-parse", "HEAD")
$description = $gitSha

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
Write-Host "headSha: $gitSha"
Write-Host "description: $description"
Write-Host "headMatchesDescription: $([string]::Equals($gitSha, $description, [System.StringComparison]::Ordinal))"
