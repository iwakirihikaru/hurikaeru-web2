param(
  [string]$Message
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$publishDir = Join-Path $workspace 'portable-publish'
$syncScript = Join-Path $PSScriptRoot 'sync-portable-publish.mjs'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$filesToPublish = @(
  '_headers',
  'README.md',
  'index.html',
  'runtime-shim.js',
  'setup.html',
  'student.html',
  'teacher.html'
)

if (-not (Test-Path -LiteralPath $publishDir -PathType Container)) {
  throw "portable-publish directory was not found."
}

if (-not (Test-Path -LiteralPath (Join-Path $publishDir '.git'))) {
  throw "portable-publish is not a git repository."
}

if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
  throw "sync-portable-publish.mjs was not found."
}

if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) {
  throw "node.exe was not found at $nodeExe"
}

$branch = (& git -C $publishDir branch --show-current 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Could not determine portable-publish branch.`n$branch"
}
if ([string]::IsNullOrWhiteSpace($branch)) {
  throw "portable-publish branch is empty."
}

$remoteName = (& git -C $publishDir remote 2>&1 | Out-String).Trim().Split("`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1
if ($LASTEXITCODE -ne 0) {
  throw "Could not read portable-publish remotes."
}
if ([string]::IsNullOrWhiteSpace($remoteName)) {
  throw "portable-publish remote is not configured."
}

Write-Host "[portable-publish] [1/4] build + sync"
& $nodeExe $syncScript --build
if ($LASTEXITCODE -ne 0) {
  throw "portable build/sync failed."
}

$statusOutput = (& git -C $publishDir status --porcelain -- @filesToPublish 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) {
  throw "Could not read portable-publish status.`n$statusOutput"
}
$statusLines = $statusOutput -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
if ($statusLines.Count -eq 0) {
  Write-Host "[portable-publish] no file changes. push skipped."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $Message = "Update portable publish $timestamp"
}

Write-Host "[portable-publish] [2/4] git add"
& git -C $publishDir add -- @filesToPublish
if ($LASTEXITCODE -ne 0) {
  throw "git add failed."
}

Write-Host "[portable-publish] [3/4] git commit"
& git -C $publishDir commit -m $Message
if ($LASTEXITCODE -ne 0) {
  throw "git commit failed."
}

Write-Host "[portable-publish] [4/4] git push $remoteName $branch"
& git -C $publishDir push $remoteName $branch
if ($LASTEXITCODE -ne 0) {
  throw "git push failed."
}

Write-Host ""
Write-Host "[portable-publish] done"
Write-Host "  branch:  $branch"
Write-Host "  remote:  $remoteName"
Write-Host "  message: $Message"

