param()

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'
$configPath = Join-Path $workspace 'admin.config.json'
$claspConfigPath = Join-Path $workspace '.clasp.json'
$syncScriptPath = Join-Path $workspace 'scripts\sync-admin-webapp.ps1'

if (-not (Test-Path -LiteralPath $clasp)) {
  throw "clasp was not found. Run npm install first."
}

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "admin.config.json was not found. Copy admin.config.json.example first."
}

if (-not (Test-Path -LiteralPath $claspConfigPath)) {
  throw ".clasp.json was not found."
}

& $syncScriptPath

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$scriptId = [string]$config.scriptId
$deploymentId = [string]$config.deploymentId
$rootDir = [string]$config.rootDir

if ([string]::IsNullOrWhiteSpace($scriptId)) {
  throw "admin.config.json scriptId is empty."
}
if ([string]::IsNullOrWhiteSpace($deploymentId)) {
  throw "admin.config.json deploymentId is empty."
}
if ([string]::IsNullOrWhiteSpace($rootDir)) {
  $rootDir = 'admin-src'
}

$manifestPath = Join-Path $workspace (Join-Path $rootDir 'appsscript.json')
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Admin manifest was not found: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $manifest.webapp) {
  throw 'Admin manifest has no webapp configuration. Deployment stopped to prevent replacing the Web app with a non-Web deployment.'
}
if ([string]$manifest.webapp.executeAs -ne 'USER_DEPLOYING') {
  throw 'Admin manifest webapp.executeAs must be USER_DEPLOYING.'
}
if ([string]$manifest.webapp.access -ne 'ANYONE_ANONYMOUS') {
  throw 'Admin manifest webapp.access must be ANYONE_ANONYMOUS.'
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$description = "onboarding-admin $timestamp"
$originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw -Encoding UTF8
$targetClaspConfig = @{
  scriptId = $scriptId
  rootDir = $rootDir
} | ConvertTo-Json -Depth 4
$webAppUrl = "https://script.google.com/macros/s/$deploymentId/exec"

try {
  Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8

  Write-Host "[admin] [1/3] push --force"
  & $clasp push --force
  if ($LASTEXITCODE -ne 0) {
    throw 'clasp push --force failed for admin web app.'
  }

  Write-Host "[admin] [2/3] create version"
  $versionOutput = & $clasp version $description 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "clasp version failed.`n$versionOutput"
  }

  $versionText = ($versionOutput | Out-String).Trim()
  if ($versionText -notmatch 'Created version (\d+)') {
    throw "Could not read the created version number.`n$versionText"
  }
  $versionNumber = $Matches[1]

  Write-Host "[admin] [3/3] redeploy $deploymentId -> version $versionNumber"
  & $clasp deploy -i $deploymentId -V $versionNumber -d $description
  if ($LASTEXITCODE -ne 0) {
    throw 'clasp deploy failed for admin web app.'
  }

  Write-Host "[admin] sync ShellConfig release values"
  $syncPayload = @{ action = 'syncShellReleaseConfig' } | ConvertTo-Json -Depth 4
  $syncResponse = $null
  $syncError = $null
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      $syncResponse = Invoke-RestMethod -Method Post -Uri $webAppUrl -ContentType 'application/json' -Body $syncPayload
      if ($syncResponse -and $syncResponse.ok) {
        break
      }
      $syncError = if ($syncResponse) { [string]$syncResponse.error } else { 'empty response' }
    } catch {
      $syncError = [string]$_.Exception.Message
    }
    Start-Sleep -Seconds ([Math]::Min($attempt * 2, 10))
  }
  if (-not $syncResponse -or -not $syncResponse.ok) {
    throw "admin ShellConfig sync failed.`n$syncError"
  }

  Write-Host ''
  Write-Host 'Done:'
  Write-Host "  scriptId:      $scriptId"
  Write-Host "  deploymentId:  $deploymentId"
  Write-Host "  rootDir:       $rootDir"
  Write-Host "  version:       $versionNumber"
  Write-Host "  description:   $description"
  Write-Host "  shellVersion:  $($syncResponse.latestVersion)"
  Write-Host "  shellBuild:    $($syncResponse.latestBuild)"
}
finally {
  Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
}
