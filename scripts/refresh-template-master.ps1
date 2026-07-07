$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$claspConfigPath = Join-Path $workspace '.clasp.json'
$clasp = Join-Path $workspace 'node_modules\.bin\clasp.cmd'
$templateScriptId = '1ueBYV86LitOtY7YOVZBI6jS_ebTHwcSZz7RE65LhRKqkMFo2t5ffXwmI'
$templateSpreadsheetId = '1rW5FPPwmlfXbfAIxmVBzMRd8oB0_R4Hb5LOfCF8Jgzk'

$originalClaspConfig = Get-Content -LiteralPath $claspConfigPath -Raw -Encoding UTF8
$targetClaspConfig = @{
  scriptId = $templateScriptId
  rootDir = 'src'
} | ConvertTo-Json -Depth 3

try {
  Set-Content -LiteralPath $claspConfigPath -Value $targetClaspConfig -Encoding UTF8
  & $clasp run refreshTemplateMasterFromWeb_ --params "[{\"spreadsheetId\":\"$templateSpreadsheetId\"}]"
  if ($LASTEXITCODE -ne 0) {
    throw 'clasp run refreshTemplateMasterFromWeb_ failed.'
  }
}
finally {
  Set-Content -LiteralPath $claspConfigPath -Value $originalClaspConfig -Encoding UTF8
}
