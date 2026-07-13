param(
  [string]$Url = 'https://script.google.com/macros/s/AKfycbxNEShjIPMsE8s7xXTMYByNI-DGxgQJyMH-Tp1FvKw2/exec',
  [string]$Action = 'PING',
  [string]$AppId = 'hurikaeru',
  [string]$RequestId = '',
  [string]$PayloadJson = '{}',
  [switch]$TeacherDiag,
  [switch]$LegacyAction
)

$ErrorActionPreference = 'Stop'

$payloadObject = $PayloadJson | ConvertFrom-Json

if ($TeacherDiag) {
  $body = @{
    action = 'teacherDiag'
    payload = $payloadObject
  } | ConvertTo-Json -Depth 10
} elseif ($LegacyAction) {
  $args = @()
  if ($payloadObject -is [System.Array]) {
    $args = $payloadObject
  } elseif ($null -ne $payloadObject -and $PayloadJson -ne '{}') {
    $args = @($payloadObject)
  }
  $body = @{
    action = $Action
    payload = @{
      args = $args
    }
  } | ConvertTo-Json -Depth 10
} else {
  if ([string]::IsNullOrWhiteSpace($RequestId)) {
    $RequestId = 'req_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
  }

  $body = @{
    action = $Action
    appId = $AppId
    apiVersion = '1.0'
    requestId = $RequestId
    clientTime = (Get-Date).ToString('o')
    payload = $payloadObject
  } | ConvertTo-Json -Depth 10
}

Write-Host "POST $Url"
Write-Host $body
Write-Host ''

$response = Invoke-WebRequest `
  -UseBasicParsing `
  -Method Post `
  -Uri $Url `
  -ContentType 'application/json; charset=utf-8' `
  -Body $body

$response.Content
