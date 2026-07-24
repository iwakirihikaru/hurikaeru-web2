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

$sourceCommit = (git rev-parse HEAD).Trim()
if (-not $sourceCommit) {
  throw "Failed to resolve source commit from repository HEAD"
}
$env:SOURCE_COMMIT = $sourceCommit
$beforeCommit = ""
try {
  $beforeCommit = (git rev-parse "$sourceCommit^").Trim()
} catch {
  $beforeCommit = ""
}
if ($beforeCommit) {
  $env:SOURCE_BEFORE_SHA = $beforeCommit
}
$pagesReleaseBaseSha = (git -C $publishPath rev-parse HEAD).Trim()
if (-not $pagesReleaseBaseSha) {
  throw "Failed to resolve pages-release base SHA"
}

$syncArgs = @(".\scripts\sync-portable-publish.mjs")
if ($Build) {
  $syncArgs += "--build"
}
Invoke-Step -Label "Sync portable artifacts" -Action {
  node @syncArgs
  if ($LASTEXITCODE -ne 0) { throw "portable sync failed" }
}

Invoke-Step -Label "Guard pages publish inputs" -Action {
  node .\scripts\guard-pages-publish.mjs --publish-dir $PublishDir --source-commit $sourceCommit --before $beforeCommit
  if ($LASTEXITCODE -ne 0) { throw "pages publish guard failed" }
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

$shortSourceCommit = (git rev-parse --short $sourceCommit).Trim()
$message = "Publish portable site from $shortSourceCommit"

Invoke-Step -Label "Commit portable publish artifacts" -Action {
  git -C $publishPath add -- _headers README.md index.html runtime-shim.js setup.html student.html teacher.html
  if ($LASTEXITCODE -ne 0) { throw "git add failed in $publishPath" }
  git -C $publishPath commit -m $message
  if ($LASTEXITCODE -ne 0) { throw "git commit failed in $publishPath" }
}

Invoke-Step -Label "Verify pages-release head is unchanged" -Action {
  git -C $publishPath fetch origin $Branch
  if ($LASTEXITCODE -ne 0) { throw "git fetch failed in $publishPath" }
  $remoteHead = (git -C $publishPath rev-parse FETCH_HEAD).Trim()
  if (-not $remoteHead) { throw "Failed to resolve remote $Branch HEAD" }
  if ($remoteHead -ne $pagesReleaseBaseSha) {
    throw "Remote $Branch advanced from $pagesReleaseBaseSha to $remoteHead during publish. Stop without rebase or manual conflict resolution."
  }
}

Invoke-Step -Label "Push portable publish branch" -Action {
  git -C $publishPath push origin HEAD:$Branch
  if ($LASTEXITCODE -ne 0) { throw "git push failed in $publishPath" }
}

Write-Host ""
Write-Host "Pages publish completed" -ForegroundColor Green
Write-Host "branch: $Branch"
Write-Host "message: $message"
