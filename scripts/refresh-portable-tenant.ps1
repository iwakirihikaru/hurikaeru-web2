$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $root 'src'
$portableTenantDir = Join-Path $root 'portable-tenant'
$portableTenantSrcDir = Join-Path $portableTenantDir 'src'

if (-not (Test-Path -LiteralPath $portableTenantDir)) {
  New-Item -ItemType Directory -Force -Path $portableTenantDir | Out-Null
}

if (-not (Test-Path -LiteralPath $portableTenantSrcDir)) {
  New-Item -ItemType Directory -Force -Path $portableTenantSrcDir | Out-Null
}

Copy-Item -Path (Join-Path $srcDir '*') -Destination $portableTenantSrcDir -Force
Copy-Item -LiteralPath (Join-Path $root 'appsscript.json') -Destination (Join-Path $portableTenantDir 'appsscript.json') -Force

Write-Output 'Refreshed portable-tenant GAS source bundle'
