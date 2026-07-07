$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'
$configPath = Join-Path $workspace 'deploy.config.json'
$adminConfigPath = Join-Path $workspace 'admin.config.json'
$claspConfigPath = Join-Path $workspace '.clasp.json'
$templatePushScript = Join-Path $PSScriptRoot 'push-distribution-template.ps1'
$adminDeployScript = Join-Path $PSScriptRoot 'deploy-admin-webapp.ps1'
$provisionDeployScript = Join-Path $PSScriptRoot 'deploy-provision-webapp.ps1'
$adminAppSourcePath = Join-Path $workspace 'onboarding\admin-app.js'

if (-not (Test-Path -LiteralPath $clasp)) {
  throw "clasp was not found. Run npm install first."
}

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "deploy.config.json was not found."
}

if (-not (Test-Path -LiteralPath $claspConfigPath)) {
  throw ".clasp.json was not found."
}

Write-Host "[0/4] build teacher legacy scripts"
Push-Location $workspace
& node '.\scripts\build-update-bundle.js'
$bundleExit = $LASTEXITCODE
if ($bundleExit -ne 0) {
  Pop-Location
  throw "update bundle build failed."
}
& node '.\scripts\build-teacher-legacy.js'
$buildExit = $LASTEXITCODE
Pop-Location
if ($buildExit -ne 0) {
  throw "teacher legacy build failed."
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$scriptId = [string]$config.scriptId
$rootDir = [string]$config.rootDir
$deploymentId = [string]$config.webappDeploymentId
$debugDeploymentIds = @($config.debugDeploymentIds) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { [string]$_ }
$descriptionPrefix = [string]$config.descriptionPrefix

if ([string]::IsNullOrWhiteSpace($scriptId)) {
  throw "scriptId is empty in deploy.config.json."
}
if ([string]::IsNullOrWhiteSpace($rootDir)) {
  $rootDir = 'src'
}
if ([string]::IsNullOrWhiteSpace($deploymentId)) {
  throw "webappDeploymentId is empty in deploy.config.json."
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$description = if ([string]::IsNullOrWhiteSpace($descriptionPrefix)) {
  $timestamp
} else {
  "$descriptionPrefix $timestamp"
}

$originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw -Encoding UTF8
$targetClaspConfig = @{
  scriptId = $scriptId
  rootDir = $rootDir
} | ConvertTo-Json -Depth 4

try {
  Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8
  $failedDebugDeploymentIds = @()

  Write-Host "[1/3] push --force"
  & $clasp push --force
  if ($LASTEXITCODE -ne 0) {
    throw "clasp push --force failed."
  }

  Write-Host "[2/3] create version"
  $versionOutput = & $clasp version $description 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "clasp version failed.`n$versionOutput"
  }

  $versionText = ($versionOutput | Out-String).Trim()
  if ($versionText -notmatch 'Created version (\d+)') {
    throw "Could not read the created version number.`n$versionText"
  }
  $versionNumber = $Matches[1]

  if (Test-Path -LiteralPath $adminAppSourcePath) {
    $adminAppSource = Get-Content -LiteralPath $adminAppSourcePath -Raw -Encoding UTF8
    $updatedAdminAppSource = [System.Text.RegularExpressions.Regex]::Replace(
      $adminAppSource,
      "latestTenantAppVersion:\s*'[^']*'",
      "latestTenantAppVersion: '$versionNumber'",
      1
    )
    if ($updatedAdminAppSource -ne $adminAppSource) {
      Set-Content -LiteralPath $adminAppSourcePath -Value $updatedAdminAppSource -Encoding UTF8
      Write-Host "[2/3] synced onboarding latestTenantAppVersion -> $versionNumber"
    }
  }

  Write-Host "[3/3] redeploy $deploymentId -> version $versionNumber"
  & $clasp deploy -i $deploymentId -V $versionNumber -d $description
  if ($LASTEXITCODE -ne 0) {
    throw "clasp deploy failed."
  }

  foreach ($debugDeploymentId in $debugDeploymentIds) {
    if ($debugDeploymentId -eq $deploymentId) {
      continue
    }
    Write-Host "[3/3] redeploy debug $debugDeploymentId -> version $versionNumber"
    & $clasp deploy -i $debugDeploymentId -V $versionNumber -d "$description debug"
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "debug clasp deploy failed for $debugDeploymentId. main deployment was updated, so continuing."
      $failedDebugDeploymentIds += $debugDeploymentId
    }
  }

  Write-Host ""
  Write-Host "Done:"
  Write-Host "  scriptId:      $scriptId"
  Write-Host "  rootDir:       $rootDir"
  Write-Host "  deploymentId:  $deploymentId"
  if ($debugDeploymentIds.Count -gt 0) {
    Write-Host "  debugIds:      $($debugDeploymentIds -join ', ')"
  }
  if ($failedDebugDeploymentIds.Count -gt 0) {
    Write-Warning "Failed debugIds: $($failedDebugDeploymentIds -join ', ')"
  }
  Write-Host "  version:       $versionNumber"
  Write-Host "  description:   $description"

  if ((Test-Path -LiteralPath $adminConfigPath) -and (Test-Path -LiteralPath $templatePushScript)) {
    Write-Host ""
    Write-Host "[4/5] update distribution template"
    & $templatePushScript
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "distribution template update failed. main deployment was updated, so continuing."
    }
  } else {
    Write-Host ""
    Write-Host "[4/5] skip distribution template update (admin.config.json or script missing)"
  }

  if ((Test-Path -LiteralPath $adminConfigPath) -and (Test-Path -LiteralPath $adminDeployScript)) {
    Write-Host "[5/5] update onboarding admin web app"
    & $adminDeployScript
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "admin web app update failed. main deployment was updated, so continuing."
    }
  } else {
    Write-Host "[5/5] skip onboarding admin web app update (admin.config.json or script missing)"
  }

  if ((Test-Path -LiteralPath $adminConfigPath) -and (Test-Path -LiteralPath $provisionDeployScript)) {
    Write-Host "[6/6] update template provision web app"
    & $provisionDeployScript
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "template provision web app update failed. main deployment was updated, so continuing."
    }
  } else {
    Write-Host "[6/6] skip template provision web app update (admin.config.json or script missing)"
  }
}
finally {
  Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
}
