param()

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

$webAppUrl = "https://script.google.com/macros/s/$deploymentId/exec"
$payload = @{ action = 'syncShellReleaseConfig' } | ConvertTo-Json -Depth 4
$response = Invoke-RestMethod -Method Post -Uri $webAppUrl -ContentType 'application/json' -Body $payload
if (-not $response -or -not $response.ok) {
  $errorText = if ($response) { [string]$response.error } else { 'empty response' }
  throw "syncShellReleaseConfig failed: $errorText"
}

Write-Host "Done:"
Write-Host "  latestVersion: $($response.latestVersion)"
Write-Host "  latestBuild:   $($response.latestBuild)"
Write-Host "  configVersion: $($response.configVersion)"
