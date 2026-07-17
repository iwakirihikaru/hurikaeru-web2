[CmdletBinding()]
param(
  [switch]$Build
)

$args = @(
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $PSScriptRoot "publish-portable-publish.ps1")
)
if ($Build) {
  $args += "-Build"
}

& powershell @args
exit $LASTEXITCODE
