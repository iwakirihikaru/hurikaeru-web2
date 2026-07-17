[CmdletBinding()]
param(
  [string]$PublishDir = "portable-publish",
  [string]$Branch = "pages-release",
  [switch]$Build
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$publishPath = Join-Path $repoRoot $PublishDir
if (-not (Test-Path -LiteralPath $publishPath)) {
  throw "Publish directory not found: $publishPath"
}

Set-Location -LiteralPath $repoRoot

$syncArgs = @(".\scripts\sync-portable-publish.mjs")
if ($Build) {
  $syncArgs += "--build"
}
Invoke-Step -Label "Sync portable artifacts" -Action {
  node @syncArgs
  if ($LASTEXITCODE -ne 0) { throw "portable sync failed" }
}

$currentBranch = (git -C $publishPath rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne $Branch) {
  throw "portable-publish must be on '$Branch' (current: $currentBranch)"
}

$statusLines = @(git -C $publishPath status --porcelain -- _headers README.md index.html runtime-shim.js setup.html student.html teacher.html)
if ($LASTEXITCODE -ne 0) {
  throw "git status failed in $publishPath"
}
if ($statusLines.Count -eq 0) {
  Write-Host "No portable publish changes to commit."
  exit 0
}

$gitSha = (git rev-parse --short HEAD).Trim()
$message = "Publish portable site from $gitSha"

Invoke-Step -Label "Commit portable publish artifacts" -Action {
  git -C $publishPath add -- _headers README.md index.html runtime-shim.js setup.html student.html teacher.html
  if ($LASTEXITCODE -ne 0) { throw "git add failed in $publishPath" }
  git -C $publishPath commit -m $message
  if ($LASTEXITCODE -ne 0) { throw "git commit failed in $publishPath" }
}

Invoke-Step -Label "Push portable publish branch" -Action {
  git -C $publishPath push origin HEAD:$Branch
  if ($LASTEXITCODE -ne 0) { throw "git push failed in $publishPath" }
}

Write-Host ""
Write-Host "Pages publish completed" -ForegroundColor Green
Write-Host "branch: $Branch"
Write-Host "message: $message"
