param(
  [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'
$configPath = Join-Path $workspace 'admin.config.json'
$claspConfigPath = Join-Path $workspace '.clasp.json'
$refreshScriptPath = Join-Path $PSScriptRoot 'refresh-distribution-template-auth.mjs'

if (-not (Test-Path -LiteralPath $clasp)) {
  throw "clasp was not found. Run npm install first."
}
if (-not (Test-Path -LiteralPath $configPath)) {
  throw "admin.config.json was not found. Copy admin.config.json.example first."
}
if (-not (Test-Path -LiteralPath $claspConfigPath)) {
  throw ".clasp.json was not found."
}
if (-not (Test-Path -LiteralPath $refreshScriptPath)) {
  throw "refresh-distribution-template-auth.mjs was not found."
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$scriptId = [string]$config.templateScriptId
$deploymentId = [string]$config.templateDeploymentId
$rootDir = [string]$config.templateRootDir
$templateCopyUrlBase = [string]$config.templateCopyUrlBase

$templateSpreadsheetId = ''
$templateMatch = [regex]::Match($templateCopyUrlBase, '/spreadsheets/d/([a-zA-Z0-9\-_]+)')
if ($templateMatch.Success) {
  $templateSpreadsheetId = [string]$templateMatch.Groups[1].Value
}

if ([string]::IsNullOrWhiteSpace($scriptId)) {
  throw "admin.config.json templateScriptId is empty."
}
if ([string]::IsNullOrWhiteSpace($rootDir)) {
  $rootDir = 'src'
}
if ([string]::IsNullOrWhiteSpace($templateSpreadsheetId)) {
  throw "Could not extract template spreadsheet id from templateCopyUrlBase."
}

$originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw -Encoding UTF8
$targetClaspConfig = @{
  scriptId = $scriptId
  rootDir = $rootDir
} | ConvertTo-Json -Depth 4

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$description = "distribution-template $timestamp"

try {
  Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8

  Write-Host "[template] [1/3] push --force"
  & $clasp push --force
  if ($LASTEXITCODE -ne 0) {
    throw 'clasp push --force failed for the distribution template.'
  }

  Write-Host "[template] [2/3] refresh distribution template master"
  $refreshOutput = & node $refreshScriptPath 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "distribution template refresh failed.`n$refreshOutput"
  }
  $refreshText = ($refreshOutput | Out-String).Trim()
  Write-Host "[template] refreshed via Sheets/Drive API"
  if ($refreshText) {
    Write-Host $refreshText
  }

  if ($SkipDeploy) {
    Write-Host "[template] skipped deployment update"
  } elseif ([string]::IsNullOrWhiteSpace($deploymentId)) {
    Write-Host "[template] deploymentId not configured, source push only"
  } else {
    Write-Host "[template] [3/3] create version and redeploy $deploymentId"
    $versionOutput = & $clasp version $description 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "clasp version failed.`n$versionOutput"
    }

    $versionText = ($versionOutput | Out-String).Trim()
    if ($versionText -notmatch 'Created version (\d+)') {
      throw "Could not read the created version number.`n$versionText"
    }
    $versionNumber = $Matches[1]

    & $clasp deploy -i $deploymentId -V $versionNumber -d $description
    if ($LASTEXITCODE -ne 0) {
      throw 'clasp deploy failed for the distribution template.'
    }

    Write-Host "  version:       $versionNumber"
    Write-Host "  description:   $description"
  }

  Write-Host ""
  Write-Host "Done:"
  Write-Host "  scriptId:      $scriptId"
  Write-Host "  rootDir:       $rootDir"
  if (-not [string]::IsNullOrWhiteSpace($deploymentId) -and -not $SkipDeploy) {
    Write-Host "  deploymentId:  $deploymentId"
  }
}
finally {
  Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
}
