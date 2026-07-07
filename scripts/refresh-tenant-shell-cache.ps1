param(
  [Parameter(Mandatory = $true)]
  [string]$DeploymentId
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($DeploymentId)) {
  throw "DeploymentId is required."
}

$webAppUrl = "https://script.google.com/macros/s/$DeploymentId/exec"
$payload = @{ action = 'refreshShellConfigCache' } | ConvertTo-Json -Depth 4
$response = Invoke-RestMethod -Method Post -Uri $webAppUrl -ContentType 'application/json' -Body $payload
if (-not $response -or -not $response.ok) {
  $errorText = if ($response) { [string]$response.fetchError } else { 'empty response' }
  throw "refreshShellConfigCache failed: $errorText"
}

Write-Host "Done:"
Write-Host "  latestVersion: $($response.latestVersion)"
Write-Host "  latestBuild:   $($response.latestBuild)"
Write-Host "  configVersion: $($response.configVersion)"
Write-Host "  configSource:  $($response.configSource)"
Write-Host "  maintenance:   $($response.maintenanceSource)"
