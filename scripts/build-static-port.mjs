import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const portableSrcDir = path.join(rootDir, 'portable-src');
const outDir = path.join(rootDir, 'portable');

function readSrcFile(name) {
  return fs.readFileSync(path.join(srcDir, name), 'utf8');
}

function readPortableSrcFile(name) {
  return fs.readFileSync(path.join(portableSrcDir, name), 'utf8');
}

function writeOutFile(name, value) {
  fs.writeFileSync(path.join(outDir, name), value, 'utf8');
}

function resolveIncludes(html) {
  return html.replace(/<\?!=\s*include\('([^']+)'\);\s*\?>/g, (_match, includeName) => {
    return readSrcFile(`${includeName}.html`);
  });
}

function buildRuntimeShimVersion(runtimeShim) {
  return crypto.createHash('sha1').update(String(runtimeShim || ''), 'utf8').digest('hex').slice(0, 10);
}

function injectSharedRuntime(html, runtimeShimVersion) {
  return html.replace('<head>', `<head>\n<script src="./runtime-shim.js?v=${runtimeShimVersion}"></script>`);
}

function buildTeacherHtml(runtimeShimVersion) {
  const html = injectSharedRuntime(resolveIncludes(readSrcFile('teacher.html')), runtimeShimVersion);
  return html.replace(
    /window\.__TEACHER_BOOTSTRAP__ = <\?!= bootstrapTeacherJson \|\| 'null' \?>;/,
    "window.__TEACHER_BOOTSTRAP__ = window.__TEACHER_BOOTSTRAP__ || window.__portableGas.bootstrapTeacher();"
  );
}

function buildStudentHtml(runtimeShimVersion) {
  const html = injectSharedRuntime(readSrcFile('index.html'), runtimeShimVersion);
  return html.replace(
    /const bootstrapStudentOptions = <\?!= JSON\.stringify\(typeof bootstrapStudentOptions !== 'undefined' \? bootstrapStudentOptions : \{students:\[\]\}\) \?>;/,
    "const bootstrapStudentOptions = window.__STUDENT_BOOTSTRAP__ || { students: [], shell: {} };\nlet bootstrapStudentReadyPromise = Promise.resolve(bootstrapStudentOptions);\nif (!window.__STUDENT_BOOTSTRAP__) {\n  bootstrapStudentReadyPromise = window.__portableGas.bootstrapStudentAsync()\n    .then(data => { if (data && typeof data === 'object') Object.assign(bootstrapStudentOptions, data); return bootstrapStudentOptions; })\n    .catch(error => { console.error(error); return bootstrapStudentOptions; });\n}"
  ).replace(
    'startStudentApp_();',
    "startStudentApp_();\nbootstrapStudentReadyPromise.then(data => applyStudentBootstrapData_(data)).catch(error => { console.error(error); });"
  );
}

function buildRuntimeShim() {
  return readPortableSrcFile('runtime-shim.js');
}

function buildIndexHtml() {
  return String.raw`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ふりカエル Portable</title>
<style>
:root{
  --navy:#1A237E;--green:#388E3C;--bg:#F5F5F5;--card:#fff;--line:#D7E3F8;
  --font:'Hiragino Sans','Yu Gothic UI',sans-serif;
}
*{box-sizing:border-box}
body{margin:0;font-family:var(--font);background:var(--bg);color:#212121}
.nav{background:var(--navy);color:#fff;padding:16px 20px;font-size:20px;font-weight:700}
.wrap{max-width:820px;margin:0 auto;padding:20px}
.card{background:var(--card);border-radius:16px;padding:18px;box-shadow:0 6px 20px rgba(26,35,126,.08);margin-bottom:14px}
.lead{background:#EEF4FF;border:1px solid var(--line);border-radius:12px;padding:12px 14px;line-height:1.8}
.title{margin:0 0 8px;font-size:18px}
.links{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.linkcard{display:block;text-decoration:none;color:inherit;border:1px solid #D7E3F8;border-radius:14px;padding:16px;background:linear-gradient(135deg,#fff,#f7fbff)}
.linkcard strong{display:block;font-size:16px;margin-bottom:6px}
.linkcard span{display:block;font-size:13px;line-height:1.7;color:#546E7A}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}
</style>
</head>
<body>
<div class="nav">ふりカエル Portable</div>
<div class="wrap">
  <div class="card">
    <div class="lead">通常は先生が配るURLから入ります。<span class="mono">setup</span> は配布ページへの入口と、例外時の接続補助です。</div>
  </div>
  <div class="card">
    <h1 class="title">Open</h1>
    <div class="links">
      <a class="linkcard" href="./setup">
        <strong>Setup</strong>
        <span>配布ページへの入口と、手動接続が必要なときの補助ページです。</span>
      </a>
      <a class="linkcard" href="./student">
        <strong>Student</strong>
        <span>児童画面を開きます。</span>
      </a>
      <a class="linkcard" href="./teacher">
        <strong>Teacher</strong>
        <span>先生画面を開きます。</span>
      </a>
    </div>
  </div>
</div>
<script>
(function () {
  var params = new URLSearchParams(window.location.search || "");
  var api = String(params.get("api") || "").trim();
  if (!api) return;
  document.querySelectorAll("a[href]").forEach(function (anchor) {
    var href = anchor.getAttribute("href");
    if (!href) return;
    if (href.indexOf("?") >= 0) {
      anchor.setAttribute("href", href + "&api=" + encodeURIComponent(api));
      return;
    }
    anchor.setAttribute("href", href + "?api=" + encodeURIComponent(api));
  });
})();
</script>
</body>
</html>
`;
}

function buildReadme() {
  return `# Portable GAS UI

現行の GAS 版 UI をそのまま静的公開用に切り出したディレクトリです。

## Files

- \`index.html\`
  - 入口ページ
- \`setup.html\`
  - 配布ページへの入口と接続補助
- \`student.html\`
  - 児童画面
- \`teacher.html\`
  - 先生画面
- \`runtime-shim.js\`
  - \`google.script.run\` 互換の HTTP ラッパー
- \`_headers\`
  - no-store 設定

## Build

\`\`\`powershell
npm run build:portable
\`\`\`

## Local Serve

\`\`\`powershell
npm run portable:serve
\`\`\`

open:

- \`http://localhost:4173/\`

## Cloudflare Pages

Deploy \`portable/\` as a static site.

- Build command:
  - \`npm run build:portable\`
- Build output directory:
  - \`portable\`
- Entry:
  - \`/\`
- Pages の pretty URL をそのまま使う:
  - \`/setup\`
  - \`/student\`
  - \`/teacher\`
`;
}

function buildSetupHtml(runtimeShimVersion) {
  return String.raw`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ふりカエル 接続補助</title>
<script src="./runtime-shim.js?v=${runtimeShimVersion}"></script>
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
.lead{background:#EEF4FF;border:1px solid var(--line);border-radius:12px;padding:14px 16px;line-height:1.8}
.steps{margin:0;padding-left:20px;line-height:1.9;color:#455A64}
.manual{padding:0}
.manual summary{list-style:none;cursor:pointer;padding:18px;font-size:14px;font-weight:700;color:#37474F}
.manual summary::-webkit-details-marker{display:none}
.manual summary::after{content:'開く';float:right;font-size:12px;color:#607D8B}
.manual[open] summary::after{content:'閉じる'}
.manual-body{padding:0 18px 18px}
.label{display:block;font-size:13px;font-weight:700;margin:0 0 8px}
.input{width:100%;padding:12px 14px;border:1.5px solid #CFD8DC;border-radius:10px;font-size:14px;font-family:var(--font)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.btn{padding:10px 16px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--font)}
.btn-main{background:linear-gradient(135deg,var(--green),#2E7D32);color:#fff}
.btn-sub{background:linear-gradient(135deg,#F7FBFF,#E3F2FD);color:#0D47A1;border:1.5px solid #90CAF9}
.btn-ghost{background:#CFD8DC;color:#37474F}
.btn-copy{background:#FFF8E1;color:#6D4C41;border:1.5px solid #FFE082}
.status{margin-top:12px;padding:12px 14px;border-radius:12px;line-height:1.7;background:#F8FBFF;border:1px solid #E1ECF7}
.status.ok{background:#E8F5E9;border-color:#A5D6A7;color:#1B5E20}
.status.error{background:#FFF8E1;border-color:#FFE082;color:#6D4C41}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}
.links{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.linkbtn{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:999px;background:#fff;color:#46627d;border:1px solid #D7E3F8;text-decoration:none;font-size:13px;font-weight:700}
</style>
</head>
<body>
<div class="nav">ふりカエル 接続補助</div>
<div class="wrap">
  <div class="card">
    <div class="lead">このページは接続補助です。通常は先生が配るURLから入り、ここは保存が消えたときや、接続先を手で入れ替えたいときだけ使います。</div>
  </div>
  <div class="card">
    <div class="label">このページを使うとき</div>
    <ol class="steps">
      <li>保存が消えて、児童ページや先生ページで開けなくなったとき</li>
      <li>接続先のGAS URLを手で入れ替えたいとき</li>
      <li>障害時に、標準接続先ではなく別のGASへ一時的に切り替えたいとき</li>
    </ol>
  </div>
  <div class="card">
    <div class="links">
      <a class="linkbtn" href="./student.html">児童ページを開く</a>
      <a class="linkbtn" href="./teacher.html">先生ページを開く</a>
    </div>
  </div>
  <details class="card manual" id="manualBox">
    <summary>接続先を手動で入れる</summary>
    <div class="manual-body">
      <div class="lead">通常は標準接続先が自動で使われます。URLに <span class="mono">?api=...</span> が入っていればその値が優先保存されます。手動入力は例外時だけで大丈夫です。</div>
      <label class="label" for="apiUrl" style="margin-top:14px;">接続先の GAS Web App URL</label>
      <input id="apiUrl" class="input" type="url" placeholder="https://script.google.com/macros/s/.../exec">
      <div class="row">
        <button id="saveBtn" class="btn btn-main" type="button">保存して接続確認</button>
        <button id="testBtn" class="btn btn-sub" type="button">接続確認だけする</button>
        <button id="copyBtn" class="btn btn-copy" type="button">GAS URLをコピー</button>
        <button id="clearBtn" class="btn btn-ghost" type="button">保存を消す</button>
      </div>
      <div id="status" class="status">通常はここを使わなくても大丈夫です。</div>
      <div class="label" style="margin-top:14px;">いま保存されている接続先</div>
      <div id="currentValue" class="mono"></div>
    </div>
  </details>
  <div class="card">
    <div class="label">補足</div>
    <div class="lead">登録ページでスプレッドシートを作る流れとは別のページです。このページを直接配る必要はありません。</div>
  </div>
</div>
<script>
(function(){
  var input = document.getElementById('apiUrl');
  var status = document.getElementById('status');
  var currentValue = document.getElementById('currentValue');
  var manualBox = document.getElementById('manualBox');

  function renderCurrent() {
    var value = window.__portableGas.getApiUrl();
    currentValue.textContent = value || '未設定';
    if (!input.value) input.value = value;
  }

  function setStatus(message, tone) {
    status.className = 'status' + (tone ? ' ' + tone : '');
    status.textContent = message;
  }

  async function copyApiUrl() {
    var url = String(input.value || window.__portableGas.getApiUrl() || '').trim();
    if (!url) {
      setStatus('コピーするURLがありません。', 'error');
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        input.focus();
        input.select();
        input.setSelectionRange(0, input.value.length);
        if (!document.execCommand('copy')) throw new Error('copy_failed');
      }
      setStatus('GAS URLをコピーしました。', 'ok');
    } catch (_error) {
      setStatus('コピーに失敗しました。URL欄を長押ししてコピーしてください。', 'error');
    }
  }

  async function testConnection() {
    var url = String(input.value || '').trim();
    if (!url) {
      setStatus('URLを入れてください。', 'error');
      return;
    }
    window.__portableGas.setApiUrl(url);
    renderCurrent();
    setStatus('接続確認中...', '');
    try {
      await window.__portableGas.postAction('teacherInit', {});
      setStatus('接続できました。この端末は使えます。', 'ok');
    } catch (error) {
      setStatus('接続に失敗しました: ' + (error && error.message ? error.message : String(error)), 'error');
    }
  }

  document.getElementById('saveBtn').addEventListener('click', testConnection);
  document.getElementById('testBtn').addEventListener('click', testConnection);
  document.getElementById('copyBtn').addEventListener('click', copyApiUrl);
  document.getElementById('clearBtn').addEventListener('click', function(){
    input.value = '';
    window.__portableGas.setApiUrl('');
    renderCurrent();
    setStatus('保存した接続先を消しました。', '');
  });

  var apiFromQuery = new URLSearchParams(window.location.search).get('api');
  var missingApi = new URLSearchParams(window.location.search).get('missingApi');
  if (apiFromQuery) {
    input.value = apiFromQuery;
    window.__portableGas.setApiUrl(apiFromQuery);
  }
  if (missingApi || !window.__portableGas.getApiUrl()) {
    manualBox.open = true;
  }
  renderCurrent();
})();
</script>
</body>
</html>
`;
}

const runtimeShim = buildRuntimeShim();
const runtimeShimVersion = buildRuntimeShimVersion(runtimeShim);

writeOutFile('teacher.html', buildTeacherHtml(runtimeShimVersion));
writeOutFile('student.html', buildStudentHtml(runtimeShimVersion));
writeOutFile('index.html', buildIndexHtml());
writeOutFile('setup.html', buildSetupHtml(runtimeShimVersion));
writeOutFile('runtime-shim.js', runtimeShim);
writeOutFile('README.md', buildReadme());

console.log('Built portable teacher.html, student.html, setup.html, and runtime-shim.js');


