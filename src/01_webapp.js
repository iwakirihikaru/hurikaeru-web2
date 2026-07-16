// ============================================================
//  Web 繧｢繝励Μ 繧ｨ繝ｳ繝医Μ繝ｼ
// ============================================================
function doGet(e) {
  const mode = String((e && e.parameter && e.parameter.mode) || '').trim();
  if (mode === 'shellConfig') {
    return jsonOutput_(getLocalTenantShellConfigResponse_());
  }
  if (mode === 'maintenanceStatus') {
    return jsonOutput_(getLocalTenantMaintenanceStatusResponse_());
  }
  if (mode === 'releaseInfo') {
    return jsonOutput_(getLocalTenantReleaseInfoResponse_());
  }
  return textOutput_(MASTER_GAS_API_GET_TEXT);
}

function doPost(e) {
  const body = parseWebAppJsonBody_(e);
  if (String(body && body.action || '').trim() === 'syncLocalTenantReleaseInfo') {
    return jsonOutput_(syncLocalTenantReleaseInfo_(body));
  }
  const masterApiResponse = tryHandleMasterGasApiPost_(body);
  if (masterApiResponse) {
    return jsonOutput_(masterApiResponse);
  }
  if (isPortableActionRequestBody_(body)) {
    return jsonOutput_({ ok: true, data: dispatchPortableActionRequest_(body) });
  }
  return jsonOutput_({ ok: false, error: 'unknown_action' });
}


function parseWebAppJsonBody_(e) {
  const raw = String((e && e.postData && e.postData.contents) || '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    return {
      __parseError: true,
      __raw: raw,
      __message: err && err.message ? err.message : 'Invalid JSON',
    };
  }
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function onOpen() {
  let ss = null;
  let isTemplateMaster = false;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    trySyncDistributionTemplateMasterName_(ss);
    const setupConfig = loadTemplateSetupConfig_(ss);
    isTemplateMaster = isDistributionTemplateMasterSheet_(setupConfig, ss);
    cleanupGuideSheets_(ss);
    tryMarkCurrentSheetDeployed_();
  } catch (_err) {}
  SpreadsheetApp.getUi()
    .createMenu('じぶんまとめ')
    .addItem('先生画面を開く', 'openTeacherPage_')
    .addItem('児童画面を開く', 'openStudentPage_')
    .addToUi();
  SpreadsheetApp.getUi()
    .createMenu('導入・配布')
    .addItem('導入パネルを開く', 'showSetupRunnerSidebar')
    .addItem('先生情報を登録する', 'startTeacherSetup')
    .addItem('Webアプリ化ガイドを開く', 'showWebAppDeploySidebar')
    .addItem('デプロイURL反映と更新認可', 'showWebAppUrlCaptureSidebar')
    .addItem('更新認可だけやり直す', 'enableTeacherUpdateAuthorization')
    .addToUi();
  if (isTemplateMaster) {
    SpreadsheetApp.getUi()
      .createMenu('配布')
      .addItem('配布用テンプレートを作る', 'createDistributionTemplate')
      .addToUi();
  }
  try {
    const setupState = getSetupRunnerState_({ lightweight: true });
    if (!setupState.setupCompleted || setupState.deployPending || !setupState.updateAuthReady) {
      ss.toast('開いた直後はメニューやボタンが出るまで数秒かかることがあります。待ってから「導入・配布」→「導入パネルを開く」から進めます。', '導入案内', 7);
    }
  } catch (_err) {}
}

function openTeacherPage_() {
  openWebAppLinkDialog_('先生画面', buildWebAppUrl_({ page: 'teacher' }));
}

function openStudentPage_() {
  openWebAppLinkDialog_('児童画面', buildWebAppUrl_({ page: 'student' }));
}
function buildWebAppUrl_(params) {
  let baseUrl = '';
  try {
    baseUrl = String(ScriptApp.getService().getUrl() || '').trim();
  } catch (_err) {}
  if (!baseUrl) {
    try {
      const spreadsheet = getTenantSpreadsheet_();
      const setupConfig = loadTemplateSetupConfig_(spreadsheet);
      baseUrl = String(resolveSetupWebAppBaseUrl_(setupConfig, {
        currentWebAppUrl: getCurrentWebAppBaseUrl_(),
      }) || '').trim();
    } catch (_err) {}
  }
  if (!baseUrl) {
    throw new Error('WebアプリURLを取得できません。先にWebアプリとしてデプロイしてください。');
  }
  const normalizedBaseUrl = normalizeWebAppUrl_(baseUrl);
  const rawPage = String(params && (params.page || params.p) || '').trim().toLowerCase();
  if (rawPage === 'student' || rawPage === 's') {
    return buildPortableStudentRelayUrl_(normalizedBaseUrl);
  }
  return buildPortableTeacherRelayUrl_(normalizedBaseUrl);
}

function openWebAppLinkDialog_(title, url) {
  const safeTitle = String(title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeUrl = String(url || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <body style="font-family:sans-serif;padding:16px;">
      <p style="margin:0 0 12px;font-size:14px;">${safeTitle}を新しいタブで開きます。</p>
      <p style="margin:0 0 12px;"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">開かない場合はこちらをクリック</a></p>
      <script>
        window.open(${JSON.stringify(url)}, '_blank', 'noopener,noreferrer');
        google.script.host.close();
      </script>
    </body>
    </html>
  `).setWidth(360).setHeight(120);
  SpreadsheetApp.getUi().showModelessDialog(html, title);
}
