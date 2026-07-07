param()

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'
$configPath = Join-Path $workspace 'admin.config.json'
$claspConfigPath = Join-Path $workspace '.clasp.json'

if (-not (Test-Path -LiteralPath $clasp)) {
  throw "clasp was not found. Run npm install first."
}

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "admin.config.json was not found."
}

if (-not (Test-Path -LiteralPath $claspConfigPath)) {
  throw ".clasp.json was not found."
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$scriptId = [string]$config.provisionScriptId
$deploymentId = [string]$config.provisionDeploymentId
$rootDir = [string]$config.provisionRootDir
$templateCopyUrlBase = [string]$config.templateCopyUrlBase
$adminWebAppUrl = "https://script.google.com/macros/s/$([string]$config.deploymentId)/exec"

if ([string]::IsNullOrWhiteSpace($scriptId) -or [string]::IsNullOrWhiteSpace($deploymentId)) {
  Write-Host "[provision] skipped (provisionScriptId or provisionDeploymentId is empty)"
  exit 0
}
if ([string]::IsNullOrWhiteSpace($rootDir)) {
  $rootDir = 'provision-src'
}

$templateSpreadsheetId = ''
$templateMatch = [regex]::Match($templateCopyUrlBase, '/spreadsheets/d/([a-zA-Z0-9\-_]+)')
if ($templateMatch.Success) {
  $templateSpreadsheetId = [string]$templateMatch.Groups[1].Value
}
if ([string]::IsNullOrWhiteSpace($templateSpreadsheetId)) {
  throw "Could not extract template spreadsheet id from templateCopyUrlBase."
}

$provisionAppPath = Join-Path $workspace (Join-Path $rootDir 'provision-app.js')
if (-not (Test-Path -LiteralPath $provisionAppPath)) {
  throw "Provision source was not found: $provisionAppPath"
}

$provisionApp = Get-Content -LiteralPath $provisionAppPath -Raw -Encoding UTF8
$provisionApp = [regex]::Replace($provisionApp, "adminWebAppUrl: '.*?'", "adminWebAppUrl: '$adminWebAppUrl'")
$provisionApp = [regex]::Replace($provisionApp, "templateSpreadsheetId: '.*?'", "templateSpreadsheetId: '$templateSpreadsheetId'")
Set-Content -LiteralPath $provisionAppPath -Value $provisionApp -Encoding UTF8

$manifestPath = Join-Path $workspace (Join-Path $rootDir 'appsscript.json')
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Provision manifest was not found: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $manifest.webapp) {
  throw 'Provision manifest has no webapp configuration.'
}
if ([string]$manifest.webapp.executeAs -ne 'USER_ACCESSING') {
  throw 'Provision manifest webapp.executeAs must be USER_ACCESSING.'
}
if ([string]$manifest.webapp.access -ne 'ANYONE') {
  throw 'Provision manifest webapp.access must be ANYONE.'
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$description = "template-provision $timestamp"
$originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw -Encoding UTF8
$targetClaspConfig = @{
  scriptId = $scriptId
  rootDir = $rootDir
} | ConvertTo-Json -Depth 4

try {
  Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8

  Write-Host "[provision] [1/3] push --force"
  & $clasp push --force
  if ($LASTEXITCODE -ne 0) {
    throw 'clasp push --force failed for provision web app.'
  }

  Write-Host "[provision] [2/3] create version"
  $versionOutput = & $clasp version $description 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "clasp version failed.`n$versionOutput"
  }

  $versionText = ($versionOutput | Out-String).Trim()
  if ($versionText -notmatch 'Created version (\d+)') {
    throw "Could not read the created version number.`n$versionText"
  }
  $versionNumber = $Matches[1]

  Write-Host "[provision] [3/3] redeploy $deploymentId -> version $versionNumber"
  & $clasp deploy -i $deploymentId -V $versionNumber -d $description
  if ($LASTEXITCODE -ne 0) {
    throw 'clasp deploy failed for provision web app.'
  }

  Write-Host ''
  Write-Host 'Done:'
  Write-Host "  scriptId:      $scriptId"
  Write-Host "  deploymentId:  $deploymentId"
  Write-Host "  rootDir:       $rootDir"
  Write-Host "  version:       $versionNumber"
  Write-Host "  webAppUrl:     https://script.google.com/macros/s/$deploymentId/exec"
}
finally {
  Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
}
