param(
  [Parameter(Mandatory = $true)]
  [string]$ScriptId,

  [string]$DeploymentId = '',

  [string]$RootDir = 'src',

  [string]$DescriptionPrefix = 'jibun-matome manual',

  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'
$claspConfigPath = Join-Path $workspace '.clasp.json'
$legacyBuildScript = Join-Path $PSScriptRoot 'build-teacher-legacy.js'
$updateBundleScript = Join-Path $PSScriptRoot 'build-update-bundle.js'

if (-not (Test-Path -LiteralPath $clasp)) {
  throw "clasp was not found. Run npm install first."
}

if (-not (Test-Path -LiteralPath $claspConfigPath)) {
  throw ".clasp.json was not found."
}

if (-not (Test-Path -LiteralPath $legacyBuildScript)) {
  throw "build-teacher-legacy.js was not found."
}

if (-not (Test-Path -LiteralPath $updateBundleScript)) {
  throw "build-update-bundle.js was not found."
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$description = "$DescriptionPrefix $timestamp"

$originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw -Encoding UTF8
$targetClaspConfig = @{
  scriptId = $ScriptId
  rootDir = $RootDir
} | ConvertTo-Json -Depth 4

try {
  Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8

  if (-not $SkipBuild) {
    Write-Host "[0/4] build teacher legacy"
    Push-Location $workspace
    & node $updateBundleScript
    if ($LASTEXITCODE -ne 0) {
      Pop-Location
      throw "update bundle build failed."
    }
    & node $legacyBuildScript
    if ($LASTEXITCODE -ne 0) {
      Pop-Location
      throw "teacher legacy build failed."
    }
    Pop-Location
  } else {
    Write-Host "[0/4] skip build (reuse current workspace output)"
  }

  Write-Host "[1/4] push --force"
  & $clasp push --force
  if ($LASTEXITCODE -ne 0) {
    throw "clasp push --force failed."
  }

  Write-Host "[2/4] create version"
  $versionOutput = & $clasp version $description 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "clasp version failed.`n$versionOutput"
  }

  $versionText = ($versionOutput | Out-String).Trim()
  if ($versionText -notmatch 'Created version (\d+)') {
    throw "Could not read the created version number.`n$versionText"
  }
  $versionNumber = $Matches[1]

  if ([string]::IsNullOrWhiteSpace($DeploymentId)) {
    Write-Host "[3/4] create webapp deployment"
    $deployOutput = & $clasp deploy -V $versionNumber -d $description 2>&1
  } else {
    Write-Host "[3/4] redeploy $DeploymentId -> version $versionNumber"
    $deployOutput = & $clasp deploy -i $DeploymentId -V $versionNumber -d $description 2>&1
  }
  if ($LASTEXITCODE -ne 0) {
    throw "clasp deploy failed.`n$deployOutput"
  }

  $deployText = ($deployOutput | Out-String).Trim()
  $resolvedDeploymentId = $DeploymentId
  if ($deployText -match 'AKfycb[a-zA-Z0-9_-]+') {
    $resolvedDeploymentId = $Matches[0]
  }
  $webAppUrl = if ([string]::IsNullOrWhiteSpace($resolvedDeploymentId)) {
    ''
  } else {
    "https://script.google.com/macros/s/$resolvedDeploymentId/exec"
  }

  Write-Host "[4/4] done"
  Write-Host ""
  Write-Host "Done:"
  Write-Host "  scriptId:      $ScriptId"
  Write-Host "  rootDir:       $RootDir"
  if (-not [string]::IsNullOrWhiteSpace($resolvedDeploymentId)) {
    Write-Host "  deploymentId:  $resolvedDeploymentId"
  }
  if (-not [string]::IsNullOrWhiteSpace($webAppUrl)) {
    Write-Host "  webAppUrl:     $webAppUrl"
  }
  Write-Host "  version:       $versionNumber"
  Write-Host "  description:   $description"
}
finally {
  Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
}
