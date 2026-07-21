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
$publishPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $PublishDir))
if (-not (Test-Path -LiteralPath $publishPath)) {
  throw "Publish directory not found: $publishPath"
}

Set-Location -LiteralPath $repoRoot

Invoke-Step -Label "Validate source worktree" -Action {
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw "git diff --check failed in source worktree" }
}

$publishTop = (git -C $publishPath rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw "portable-publish is not a git worktree: $publishPath" }
$resolvedPublishTop = [System.IO.Path]::GetFullPath($publishTop).TrimEnd('\', '/')
$resolvedPublishPath = $publishPath.TrimEnd('\', '/')
if ($resolvedPublishTop -ne $resolvedPublishPath) {
  throw "portable-publish must be its own worktree (resolved git root: $resolvedPublishTop)"
}

$currentBranch = (git -C $publishPath rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne $Branch) {
  throw "portable-publish must be on '$Branch' (current: $currentBranch)"
}

$gitDir = (git -C $publishPath rev-parse --path-format=absolute --git-dir).Trim()
if ($LASTEXITCODE -ne 0) { throw "unable to resolve portable-publish git dir" }
foreach ($stateName in @("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD")) {
  if (Test-Path -LiteralPath (Join-Path $gitDir $stateName)) {
    throw "unresolved git operation found in portable-publish: $stateName"
  }
}
foreach ($stateDir in @("rebase-merge", "rebase-apply")) {
  if (Test-Path -LiteralPath (Join-Path $gitDir $stateDir)) {
    throw "unresolved git operation found in portable-publish: $stateDir"
  }
}

$preSyncStatus = @(git -C $publishPath status --porcelain)
if ($LASTEXITCODE -ne 0) { throw "git status failed in $publishPath" }
if ($preSyncStatus.Count -gt 0) {
  $preSyncStatus | ForEach-Object { Write-Host $_ }
  throw "portable-publish must be clean before sync"
}

Invoke-Step -Label "Confirm pages-release is current" -Action {
  git -C $publishPath fetch origin $Branch
  if ($LASTEXITCODE -ne 0) { throw "failed to fetch origin/$Branch" }
  $localHead = (git -C $publishPath rev-parse HEAD).Trim()
  $remoteHead = (git -C $publishPath rev-parse "refs/remotes/origin/$Branch").Trim()
  if ($localHead -ne $remoteHead) {
    throw "portable-publish HEAD does not match origin/$Branch (local: $localHead remote: $remoteHead)"
  }
}

$syncArgs = @(".\scripts\sync-portable-publish.mjs")
if ($Build) {
  $syncArgs += "--build"
}
Invoke-Step -Label "Sync portable artifacts" -Action {
  node @syncArgs
  if ($LASTEXITCODE -ne 0) { throw "portable sync failed" }
}

Invoke-Step -Label "Validate copied artifacts" -Action {
  git -C $publishPath diff --check
  if ($LASTEXITCODE -ne 0) { throw "git diff --check failed in portable-publish" }
}

$statusLines = @(git -C $publishPath status --porcelain -- _headers README.md index.html runtime-shim.js setup.html student.html teacher.html)
if ($LASTEXITCODE -ne 0) {
  throw "git status failed in $publishPath"
}
if ($statusLines.Count -eq 0) {
  Write-Host "No portable publish changes to commit."
  Write-Host "pages-release HEAD: $((git -C $publishPath rev-parse HEAD).Trim())"
  exit 0
}

$gitSha = (git rev-parse HEAD).Trim()
$message = "Publish portable site from $gitSha"

Invoke-Step -Label "Commit portable publish artifacts" -Action {
  git -C $publishPath add -- _headers README.md index.html runtime-shim.js setup.html student.html teacher.html
  if ($LASTEXITCODE -ne 0) { throw "git add failed in $publishPath" }
  git -C $publishPath diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw "git diff --cached --check failed in portable-publish" }
  git -C $publishPath commit -m $message
  if ($LASTEXITCODE -ne 0) { throw "git commit failed in $publishPath" }
}

Invoke-Step -Label "Push portable publish branch" -Action {
  git -C $publishPath push origin HEAD:$Branch
  if ($LASTEXITCODE -ne 0) { throw "git push failed in $publishPath" }
  $publishedHead = (git -C $publishPath rev-parse HEAD).Trim()
  $remoteLine = @(git -C $publishPath ls-remote origin "refs/heads/$Branch")
  if ($LASTEXITCODE -ne 0 -or $remoteLine.Count -ne 1) { throw "unable to verify origin/$Branch after push" }
  $remotePublishedHead = (($remoteLine[0] -split '\s+')[0]).Trim()
  if ($publishedHead -ne $remotePublishedHead) {
    throw "origin/$Branch HEAD mismatch after push (local: $publishedHead remote: $remotePublishedHead)"
  }
}

Write-Host ""
Write-Host "Pages publish completed" -ForegroundColor Green
Write-Host "branch: $Branch"
Write-Host "message: $message"
Write-Host "pages-release HEAD: $((git -C $publishPath rev-parse HEAD).Trim())"
