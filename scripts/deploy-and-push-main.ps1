[CmdletBinding()]
param(
  [string]$MainBranch = "main",
  [string]$DescriptionSuffix = "",
  [switch]$SkipDeploy,
  [switch]$AllowDirty
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

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)][string[]]$Args,
    [switch]$CaptureOutput
  )

  if ($CaptureOutput) {
    $output = & git @Args
    if ($LASTEXITCODE -ne 0) {
      throw "git $($Args -join ' ') failed"
    }
    return @($output)
  }

  & git @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Args -join ' ') failed"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$dirtyLines = @(Invoke-Git -Args @("status", "--short") -CaptureOutput)
if (-not $AllowDirty -and $dirtyLines.Count -gt 0) {
  Write-Host "Working tree is dirty. Commit or stash first, or rerun with -AllowDirty." -ForegroundColor Yellow
  $dirtyLines | ForEach-Object { Write-Host $_ }
  throw "working tree is dirty"
}

$headSha = (Invoke-Git -Args @("rev-parse", "--short", "HEAD") -CaptureOutput)[0].Trim()
$branchName = (Invoke-Git -Args @("branch", "--show-current") -CaptureOutput)[0].Trim()

Invoke-Step -Label "Fetch origin/$MainBranch" -Action {
  Invoke-Git -Args @("fetch", "origin", $MainBranch)
}

Invoke-Step -Label "Push HEAD to origin/$MainBranch" -Action {
  Invoke-Git -Args @("push", "origin", "HEAD:$MainBranch")
}

if (-not $SkipDeploy) {
  Invoke-Step -Label "Run full deploy" -Action {
    $deployArgs = @(
      "-ExecutionPolicy", "Bypass",
      "-File", (Join-Path $PSScriptRoot "deploy-full.ps1")
    )
    if (-not [string]::IsNullOrWhiteSpace($DescriptionSuffix)) {
      $deployArgs += @("-DescriptionSuffix", $DescriptionSuffix)
    }
    & powershell @deployArgs
    if ($LASTEXITCODE -ne 0) {
      throw "full deploy failed"
    }
  }
}

Write-Host ""
Write-Host "Main push completed" -ForegroundColor Green
Write-Host "branch: $branchName"
Write-Host "commit: $headSha"
Write-Host "target: origin/$MainBranch"
if ($SkipDeploy) {
  Write-Host "deploy: skipped"
} else {
  Write-Host "deploy: completed"
}
