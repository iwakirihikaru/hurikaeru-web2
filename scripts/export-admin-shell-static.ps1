param(
  [string]$OutputDir = 'cdn'
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $workspace 'admin.config.json'

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "admin.config.json was not found. Copy admin.config.json.example first."
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$deploymentId = [string]$config.deploymentId
if ([string]::IsNullOrWhiteSpace($deploymentId)) {
  throw "admin.config.json deploymentId is empty."
}

$targetDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir
} else {
  Join-Path $workspace $OutputDir
}

if (-not (Test-Path -LiteralPath $targetDir)) {
  New-Item -ItemType Directory -Path $targetDir | Out-Null
}

$baseUrl = "https://script.google.com/macros/s/$deploymentId/exec"
$shellConfig = Invoke-RestMethod -Method Get -Uri "${baseUrl}?mode=shellConfig"
$maintenance = Invoke-RestMethod -Method Get -Uri "${baseUrl}?mode=maintenanceStatus"

if (-not $shellConfig -or -not $shellConfig.ok) {
  throw "shellConfig export failed."
}
if (-not $maintenance -or -not $maintenance.ok) {
  throw "maintenanceStatus export failed."
}

$shellPath = Join-Path $targetDir 'shell-config.json'
$maintenancePath = Join-Path $targetDir 'maintenance-status.json'

$shellConfig | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $shellPath -Encoding UTF8
$maintenance | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $maintenancePath -Encoding UTF8

Write-Host "Done:"
Write-Host "  shellConfig:  $shellPath"
Write-Host "  maintenance:  $maintenancePath"
Write-Host "  latestBuild:  $($shellConfig.latestBuild)"
Write-Host "  latestVersion:$($shellConfig.latestVersion)"
