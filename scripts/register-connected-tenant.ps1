param(
  [Parameter(Mandatory = $true)]
  [string]$RegistrationFile,
  [Parameter(Mandatory = $true)]
  [string]$TenantId,
  [string]$Notes = '',
  [string]$Group = 'default',
  [switch]$SkipDeploy,
  [switch]$SkipInit
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$bootstrapScript = Join-Path $PSScriptRoot 'bootstrap-tenant.ps1'

if (-not (Test-Path -LiteralPath $RegistrationFile)) {
  throw "Registration file was not found: $RegistrationFile"
}

if (-not (Test-Path -LiteralPath $bootstrapScript)) {
  throw "bootstrap-tenant.ps1 was not found."
}

$registration = Get-Content -LiteralPath $RegistrationFile -Raw | ConvertFrom-Json

$requiredFields = @(
  'registrationId',
  'teacherName',
  'scriptId',
  'spreadsheetId'
)

$missing = @()
foreach ($field in $requiredFields) {
  $value = [string]($registration.$field)
  if ([string]::IsNullOrWhiteSpace($value)) {
    $missing += $field
  }
}
if ($missing.Count -gt 0) {
  throw "Registration file is missing required field(s): $($missing -join ', ')"
}

$teacherName = [string]$registration.teacherName
$scriptId = [string]$registration.scriptId
$spreadsheetId = [string]$registration.spreadsheetId
$deploymentId = [string]$registration.deploymentId
$schoolName = [string]$registration.schoolName
$grade = [string]$registration.grade
$className = [string]$registration.className

if ([string]::IsNullOrWhiteSpace($deploymentId)) {
  throw "deploymentId is required in the registration file."
}

$resolvedNotes = @(
  $Notes,
  $registration.registrationId,
  $schoolName,
  $grade,
  $className
) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { [string]$_ }

$bootstrapArgs = @{
  TenantId = $TenantId
  TeacherName = $teacherName
  ScriptId = $scriptId
  DeploymentId = $deploymentId
  SpreadsheetId = $spreadsheetId
  Group = $Group
  Notes = ($resolvedNotes -join ' / ')
}

if ($SkipDeploy) { $bootstrapArgs.SkipDeploy = $true }
if ($SkipInit) { $bootstrapArgs.SkipInit = $true }

& $bootstrapScript @bootstrapArgs
if ($LASTEXITCODE -ne 0) {
  throw "bootstrap-tenant.ps1 failed."
}

Write-Host ""
Write-Host "Connected registration imported:"
Write-Host "  registrationId: $($registration.registrationId)"
Write-Host "  tenantId:       $TenantId"
Write-Host "  teacherName:    $teacherName"
