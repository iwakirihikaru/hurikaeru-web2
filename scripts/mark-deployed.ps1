param(
  [Parameter(Mandatory = $true)]
  [string]$AdminWebAppUrl,
  [Parameter(Mandatory = $true)]
  [string]$RegistrationId,
  [Parameter(Mandatory = $true)]
  [string]$TenantId,
  [Parameter(Mandatory = $true)]
  [string]$DeploymentId
)

$ErrorActionPreference = 'Stop'

$payload = @{
  action = 'markDeployed'
  registrationId = $RegistrationId
  tenantId = $TenantId
  deploymentId = $DeploymentId
} | ConvertTo-Json -Depth 4

$response = Invoke-RestMethod -Method Post -Uri $AdminWebAppUrl -ContentType 'application/json' -Body $payload
if (-not $response.ok) {
  throw "markDeployed failed: $($response.error)"
}

Write-Host "Deployment marked:"
Write-Host "  registrationId: $RegistrationId"
Write-Host "  tenantId:       $TenantId"
Write-Host "  deploymentId:   $DeploymentId"
