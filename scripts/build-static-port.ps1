$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $root 'src'
$outDir = Join-Path $root 'portable'

function Read-SrcFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return Get-Content -LiteralPath (Join-Path $srcDir $Name) -Raw -Encoding UTF8
}

function Resolve-Includes {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Html
  )

  $pattern = "<\?!=\s*include\('([^']+)'\);\s*\?>"
  return [regex]::Replace($Html, $pattern, {
    param($match)
    $includeName = $match.Groups[1].Value + '.html'
    return Read-SrcFile -Name $includeName
  })
}

function Inject-SharedRuntime {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Html
  )

  return $Html -replace '<head>', "<head>`r`n<script src=""./runtime-shim.js""></script>"
}

function Build-TeacherHtml {
  $html = Read-SrcFile -Name 'teacher.html'
  $html = Resolve-Includes -Html $html
  $html = Inject-SharedRuntime -Html $html
  return $html -replace "window\.__TEACHER_BOOTSTRAP__ = <\?!= bootstrapTeacherJson \|\| 'null' \?>;", "window.__TEACHER_BOOTSTRAP__ = window.__TEACHER_BOOTSTRAP__ || window.__portableGas.bootstrapTeacher();"
}

function Build-StudentHtml {
  $html = Read-SrcFile -Name 'index.html'
  $html = Inject-SharedRuntime -Html $html
  return $html -replace "const bootstrapStudentOptions = <\?!= JSON\.stringify\(typeof bootstrapStudentOptions !== 'undefined' \? bootstrapStudentOptions : \{students:\[\]\}\) \?>;", "const bootstrapStudentOptions = window.__STUDENT_BOOTSTRAP__ || window.__portableGas.bootstrapStudent();"
}

function Build-Readme {
  return @'
# Portable GAS UI

現行の GAS 版 UI を再設計せずに外出しするための移植用ディレクトリです。

## 方針

- `src/` の純粋な GAS 版は触らない
- 画面の見た目と導線は `src/` をそのまま使う
- `include()` を静的 HTML に展開する
- `google.script.run` は `runtime-shim.js` で HTTP 化する
- 児童・先生の初期表示は同期 bootstrap で現行挙動に寄せる

## ファイル

- `student.html`
  - `src/index.html` から生成した児童画面
- `teacher.html`
  - `src/teacher.html` と `include` 先を展開した先生画面
- `setup.html`
  - GAS の接続先 URL を保存・疎通確認する設定画面
- `runtime-shim.js`
  - `google.script.run` 互換ラッパー

## 生成

```powershell
npm run build:portable
```
'@
}

function Build-SetupHtml {
  return @'
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Furikaeri Setup</title>
<script src="./runtime-shim.js"></script>
<style>
:root{
  --navy:#1A237E;--green:#388E3C;--bg:#F5F5F5;--card:#fff;--line:#D7E3F8;
  --font:'Hiragino Sans','Yu Gothic UI',sans-serif;
}
*{box-sizing:border-box}
body{margin:0;font-family:var(--font);background:var(--bg);color:#212121}
.nav{background:var(--navy);color:#fff;padding:16px 20px;font-size:20px;font-weight:700}
.wrap{max-width:760px;margin:0 auto;padding:20px}
.card{background:var(--card);border-radius:16px;padding:18px;box-shadow:0 6px 20px rgba(26,35,126,.08);margin-bottom:14px}
.lead{background:#EEF4FF;border:1px solid var(--line);border-radius:12px;padding:12px 14px;line-height:1.7}
.label{display:block;font-size:13px;font-weight:700;margin:0 0 8px}
.input{width:100%;padding:12px 14px;border:1.5px solid #CFD8DC;border-radius:10px;font-size:14px;font-family:var(--font)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.btn{padding:10px 16px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--font)}
.btn-main{background:linear-gradient(135deg,var(--green),#2E7D32);color:#fff}
.btn-sub{background:linear-gradient(135deg,#F7FBFF,#E3F2FD);color:#0D47A1;border:1.5px solid #90CAF9}
.btn-ghost{background:#CFD8DC;color:#37474F}
.status{margin-top:12px;padding:12px 14px;border-radius:12px;line-height:1.7;background:#F8FBFF;border:1px solid #E1ECF7}
.status.ok{background:#E8F5E9;border-color:#A5D6A7;color:#1B5E20}
.status.error{background:#FFF8E1;border-color:#FFE082;color:#6D4C41}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}
.links{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.linkbtn{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:999px;background:#fff;color:#46627d;border:1px solid #D7E3F8;text-decoration:none;font-size:13px;font-weight:700}
</style>
</head>
<body>
<div class="nav">Furikaeri Setup</div>
<div class="wrap">
  <div class="card">
    <div class="lead">Save the GAS URL here. Both <span class="mono">student.html</span> and <span class="mono">teacher.html</span> will use it.</div>
  </div>
  <div class="card">
    <label class="label" for="apiUrl">GAS Web App URL</label>
    <input id="apiUrl" class="input" type="url" placeholder="https://script.google.com/macros/s/.../exec">
    <div class="row">
      <button id="saveBtn" class="btn btn-main" type="button">Save and Test</button>
      <button id="testBtn" class="btn btn-sub" type="button">Test Only</button>
      <button id="clearBtn" class="btn btn-ghost" type="button">Clear</button>
    </div>
    <div id="status" class="status">Not set</div>
  </div>
  <div class="card">
    <div class="label">Current Value</div>
    <div id="currentValue" class="mono"></div>
    <div class="links">
      <a class="linkbtn" href="./student.html">Open Student</a>
      <a class="linkbtn" href="./teacher.html">Open Teacher</a>
    </div>
  </div>
</div>
<script>
(function(){
  var input = document.getElementById('apiUrl');
  var status = document.getElementById('status');
  var currentValue = document.getElementById('currentValue');

  function renderCurrent() {
    var value = window.__portableGas.getApiUrl();
    currentValue.textContent = value || 'Not set';
    if (!input.value) input.value = value;
  }

  function setStatus(message, tone) {
    status.className = 'status' + (tone ? ' ' + tone : '');
    status.textContent = message;
  }

  async function testConnection() {
    var url = String(input.value || '').trim();
    if (!url) {
      setStatus('Enter a URL first.', 'error');
      return;
    }
    window.__portableGas.setApiUrl(url);
    renderCurrent();
    setStatus('接続確認中...', '');
    try {
      await window.__portableGas.postAction('rpc', { method: 'teacherInit', args: [] });
      setStatus('Connected. The GAS endpoint is responding.', 'ok');
    } catch (error) {
      setStatus('Connection failed: ' + (error && error.message ? error.message : String(error)), 'error');
    }
  }

  document.getElementById('saveBtn').addEventListener('click', testConnection);
  document.getElementById('testBtn').addEventListener('click', testConnection);
  document.getElementById('clearBtn').addEventListener('click', function(){
    input.value = '';
    window.__portableGas.setApiUrl('');
    renderCurrent();
    setStatus('Saved value cleared.', '');
  });

  var apiFromQuery = new URLSearchParams(window.location.search).get('api');
  if (apiFromQuery) {
    input.value = apiFromQuery;
    window.__portableGas.setApiUrl(apiFromQuery);
  }
  renderCurrent();
})();
</script>
</body>
</html>
'@
}

Set-Content -LiteralPath (Join-Path $outDir 'teacher.html') -Value (Build-TeacherHtml) -Encoding UTF8
Set-Content -LiteralPath (Join-Path $outDir 'student.html') -Value (Build-StudentHtml) -Encoding UTF8
Set-Content -LiteralPath (Join-Path $outDir 'setup.html') -Value (Build-SetupHtml) -Encoding UTF8
Set-Content -LiteralPath (Join-Path $outDir 'README.md') -Value (Build-Readme) -Encoding UTF8

Write-Output 'Built portable teacher.html, student.html, and setup.html'
