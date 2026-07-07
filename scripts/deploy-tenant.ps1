param(
  [Parameter(Mandatory = $true)]
  [string]$TenantId
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'
$tenantsPath = Join-Path $workspace 'tenants.json'
$claspConfigPath = Join-Path $workspace '.clasp.json'
$legacyBuildScript = Join-Path $PSScriptRoot 'build-teacher-legacy.js'

if (-not (Test-Path -LiteralPath $clasp)) {
  throw "clasp was not found. Run npm install first."
}

if (-not (Test-Path -LiteralPath $legacyBuildScript)) {
  throw "build-teacher-legacy.js was not found."
}

if (-not (Test-Path -LiteralPath $tenantsPath)) {
  throw "tenants.json was not found."
}

if (-not (Test-Path -LiteralPath $claspConfigPath)) {
  throw ".clasp.json was not found."
}

$tenantsConfig = Get-Content -LiteralPath $tenantsPath -Raw | ConvertFrom-Json
$tenant = @($tenantsConfig.tenants) | Where-Object { $_.tenantId -eq $TenantId } | Select-Object -First 1

if (-not $tenant) {
  throw "Tenant '$TenantId' was not found in tenants.json."
}

if ([string]::IsNullOrWhiteSpace([string]$tenant.scriptId)) {
  throw "Tenant '$TenantId' has an empty scriptId."
}

if ([string]::IsNullOrWhiteSpace([string]$tenant.deploymentId)) {
  throw "Tenant '$TenantId' has an empty deploymentId."
}

$descriptionPrefix = [string]$tenantsConfig.defaults.descriptionPrefix
if ([string]::IsNullOrWhiteSpace($descriptionPrefix)) {
  $descriptionPrefix = 'jibun-matome'
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$description = "$descriptionPrefix [$TenantId] $timestamp"
$originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw
$targetClaspConfig = @{
  scriptId = [string]$tenant.scriptId
  rootDir  = 'src'
} | ConvertTo-Json -Depth 4

try {
  Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8

  Write-Host "[tenant:$TenantId] [0/4] build teacher legacy"
  & node (Join-Path $PSScriptRoot 'build-update-bundle.js')
  if ($LASTEXITCODE -ne 0) {
    throw "update bundle build failed for tenant '$TenantId'."
  }
  & node $legacyBuildScript
  if ($LASTEXITCODE -ne 0) {
    throw "teacher legacy build failed for tenant '$TenantId'."
  }

  Write-Host "[tenant:$TenantId] [1/4] push --force"
  & $clasp push --force
  if ($LASTEXITCODE -ne 0) {
    throw "clasp push --force failed for tenant '$TenantId'."
  }

  Write-Host "[tenant:$TenantId] [2/4] create version"
  $versionOutput = & $clasp version $description 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "clasp version failed for tenant '$TenantId'.`n$versionOutput"
  }

  $versionText = ($versionOutput | Out-String).Trim()
  if ($versionText -notmatch 'Created version (\d+)') {
    throw "Could not read the created version number for tenant '$TenantId'.`n$versionText"
  }
  $versionNumber = $Matches[1]

  Write-Host "[tenant:$TenantId] [3/4] redeploy $($tenant.deploymentId) -> version $versionNumber"
  & $clasp deploy -i ([string]$tenant.deploymentId) -V $versionNumber -d $description
  if ($LASTEXITCODE -ne 0) {
    throw "clasp deploy failed for tenant '$TenantId'."
  }

  Write-Host "[tenant:$TenantId] [4/4] apply tenant setup"
  $webAppUrl = "https://script.google.com/macros/s/$([string]$tenant.deploymentId)/exec"
  $setupPayload = @{
    action = 'tenantSetup'
    tenantId = [string]$tenant.tenantId
    teacherName = [string]$tenant.teacherName
    spreadsheetId = [string]$tenant.spreadsheetId
    deploymentId = [string]$tenant.deploymentId
    enableStudentAi = [bool]$tenant.enableStudentAi
    enableTeacherAi = [bool]$tenant.enableTeacherAi
  } | ConvertTo-Json -Depth 6
  $setupResponse = $null
  $setupError = $null
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      $setupResponse = Invoke-RestMethod -Method Post -Uri $webAppUrl -ContentType 'application/json' -Body $setupPayload
      if ($setupResponse -and $setupResponse.ok) {
        break
      }
      $setupError = if ($setupResponse) { [string]$setupResponse.error } else { 'empty response' }
    } catch {
      $setupError = [string]$_.Exception.Message
    }
    Start-Sleep -Seconds ([Math]::Min($attempt * 2, 10))
  }
  if (-not $setupResponse -or -not $setupResponse.ok) {
    throw "tenantSetup failed for tenant '$TenantId': $setupError"
  }

  Write-Host "[tenant:$TenantId] refresh ShellConfig cache"
  $refreshPayload = @{ action = 'refreshShellConfigCache' } | ConvertTo-Json -Depth 4
  $refreshResponse = $null
  $refreshError = $null
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      $refreshResponse = Invoke-RestMethod -Method Post -Uri $webAppUrl -ContentType 'application/json' -Body $refreshPayload
      if ($refreshResponse -and $refreshResponse.ok) {
        break
      }
      $refreshError = if ($refreshResponse) { [string]$refreshResponse.fetchError } else { 'empty response' }
    } catch {
      $refreshError = [string]$_.Exception.Message
    }
    Start-Sleep -Seconds ([Math]::Min($attempt * 2, 10))
  }
  if (-not $refreshResponse -or -not $refreshResponse.ok) {
    throw "refreshShellConfigCache failed for tenant '$TenantId': $refreshError"
  }

  Write-Host ""
  Write-Host "Done:"
  Write-Host "  tenantId:      $TenantId"
  Write-Host "  teacherName:   $($tenant.teacherName)"
  Write-Host "  scriptId:      $($tenant.scriptId)"
  Write-Host "  deploymentId:  $($tenant.deploymentId)"
  Write-Host "  spreadsheetId: $($tenant.spreadsheetId)"
  Write-Host "  studentAi:     $([bool]$tenant.enableStudentAi)"
  Write-Host "  teacherAi:     $([bool]$tenant.enableTeacherAi)"
  Write-Host "  version:       $versionNumber"
  Write-Host "  description:   $description"
  Write-Host "  shellVersion:  $($refreshResponse.latestVersion)"
  Write-Host "  shellBuild:    $($refreshResponse.latestBuild)"
  Write-Host "  shellConfig:   $($refreshResponse.configVersion)"
  Write-Host "  shellSource:   $($refreshResponse.configSource)"
}
finally {
  Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
}
