param(
  [Parameter(Mandatory = $true)]
  [string]$AdminWebAppUrl,
  [Parameter(Mandatory = $true)]
  [string]$RegistrationId,
  [string]$OutFile = ''
)

$ErrorActionPreference = 'Stop'

$payload = @{
  action = 'exportRegistration'
  registrationId = $RegistrationId
} | ConvertTo-Json -Depth 4

$response = Invoke-RestMethod -Method Post -Uri $AdminWebAppUrl -ContentType 'application/json' -Body $payload
if (-not $response.ok) {
  throw "exportRegistration failed: $($response.error)"
}

$registrationJson = $response.registration | ConvertTo-Json -Depth 8

if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $safeName = "registration-$RegistrationId.json"
  $OutFile = Join-Path (Get-Location) $safeName
}

Set-Content -LiteralPath $OutFile -Value $registrationJson -Encoding UTF8

Write-Host "Registration exported:"
Write-Host "  registrationId: $RegistrationId"
Write-Host "  outFile:        $OutFile"
