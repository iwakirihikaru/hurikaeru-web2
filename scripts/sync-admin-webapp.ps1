param()

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $workspace 'admin.config.json'
$srcDir = Join-Path $workspace 'onboarding'
$outDir = Join-Path $workspace 'admin-src'

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "admin.config.json was not found. Copy admin.config.json.example first."
}

if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$templateCopyUrlBase = [string]$config.templateCopyUrlBase
$templateCopyChooserUrlBase = [string]$config.templateCopyChooserUrlBase
$templateProvisionUrlBase = [string]$config.templateProvisionUrlBase
$primaryShellConfigUrl = [string]$config.primaryShellConfigUrl
$primaryMaintenanceUrl = [string]$config.primaryMaintenanceUrl
$guideModePath = [string]$config.guideModePath
if ([string]::IsNullOrWhiteSpace($guideModePath)) {
  $guideModePath = '?mode=guide'
}

$adminAppPath = Join-Path $srcDir 'admin-app.js'
$adminRegisterPath = Join-Path $srcDir 'admin-register.html'
$adminGuidePath = Join-Path $srcDir 'admin-guide.html'

$adminApp = Get-Content -LiteralPath $adminAppPath -Raw -Encoding UTF8
$adminApp = $adminApp.Replace("templateCopyUrlBase: 'PASTE_TEMPLATE_COPY_URL_HERE'", "templateCopyUrlBase: '$templateCopyUrlBase'")
$adminApp = $adminApp.Replace("templateCopyChooserUrlBase: ''", "templateCopyChooserUrlBase: '$templateCopyChooserUrlBase'")
$adminApp = $adminApp.Replace("templateProvisionUrlBase: ''", "templateProvisionUrlBase: '$templateProvisionUrlBase'")
$adminApp = $adminApp.Replace("primaryShellConfigUrl: ''", "primaryShellConfigUrl: '$primaryShellConfigUrl'")
$adminApp = $adminApp.Replace("primaryMaintenanceUrl: ''", "primaryMaintenanceUrl: '$primaryMaintenanceUrl'")
$adminApp = $adminApp.Replace("guideModePath: '?mode=guide'", "guideModePath: '$guideModePath'")
Set-Content -LiteralPath (Join-Path $outDir 'admin-app.js') -Value $adminApp -Encoding UTF8

$adminRegister = Get-Content -LiteralPath $adminRegisterPath -Raw -Encoding UTF8
Set-Content -LiteralPath (Join-Path $outDir 'admin-register.html') -Value $adminRegister -Encoding UTF8

$adminGuide = Get-Content -LiteralPath $adminGuidePath -Raw -Encoding UTF8
Set-Content -LiteralPath (Join-Path $outDir 'admin-guide.html') -Value $adminGuide -Encoding UTF8

Write-Host 'Synced admin web app sources.'
Write-Host "  output: $outDir"
