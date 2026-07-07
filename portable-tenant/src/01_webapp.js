// ============================================================
//  Web アプリ エントリー
// ============================================================
function doGet(e) {
  const mode = String((e && e.parameter && e.parameter.mode) || '').trim();
  if (mode === 'refreshTemplateMaster') {
    const spreadsheetId = String((e && e.parameter && e.parameter.spreadsheetId) || '').trim();
    return jsonOutput_(refreshTemplateMasterFromWeb_({ spreadsheetId }));
  }
  if (mode === 'teacherDiag') {
    return jsonOutput_(buildTeacherDiag_());
  }
  if (mode === 'updateBundle') {
    return jsonOutput_(buildPublishedUpdateBundle_());
  }
  if (mode === 'copyChooser') {
    return HtmlService.createHtmlOutput(buildCopyChooserHtml_(e))
      .setTitle('コピー先アカウントを選ぶ')
      .addMetaTag('viewport','width=device-width,initial-scale=1');
  }
  const page = resolveWebAppPage_(e);
  if (page === 'teacher') {
    const template = HtmlService.createTemplateFromFile('teacher');
    template.bootstrapTeacherJson = safeJsonForHtml_(buildTeacherBootstrap_());
    return template.evaluate()
      .setTitle('先生画面')
      .addMetaTag('viewport','width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no');
  }
  const template = HtmlService.createTemplateFromFile('index');
  template.bootstrapStudentOptions = getStudentEntryOptions();
  return template.evaluate()
    .setTitle('じぶんまとめ')
    .addMetaTag('viewport','width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no');
}

function resolveWebAppPage_(e) {
  const params = (e && e.parameter) || {};
  const rawPage = String(params.page || params.p || '').trim().toLowerCase();
  if (rawPage === 'student' || rawPage === 's') return 'student';
  if (rawPage === 'teacher' || rawPage === 't') return 'teacher';
  return 'teacher';
}

function buildTeacherDiag_() {
  const result = {
    ok: true,
    build: typeof APP_BUILD !== 'undefined' ? APP_BUILD : '',
    timestamp: new Date().toISOString(),
    spreadsheetId: '',
    spreadsheetName: '',
    unitsCount: null,
    unitsSample: [],
    active: null,
    rosterCount: null,
    unitProgressKeys: null,
    errors: [],
  };
  try {
    const ss = getTenantSpreadsheet_();
    result.spreadsheetId = ss.getId();
    result.spreadsheetName = ss.getName();
  } catch (err) {
    result.errors.push(`spreadsheet: ${err && err.message ? err.message : err}`);
  }
  try {
    const units = getAllUnits();
    result.unitsCount = units.length;
    result.unitsSample = units.slice(0, 5).map(unit => ({
      id: unit.id,
      name: unit.name,
      subject: unit.subject,
      maxPeriod: unit.maxPeriod,
    }));
  } catch (err) {
    result.errors.push(`units: ${err && err.message ? err.message : err}`);
  }
  try {
    result.active = getActiveSetting();
  } catch (err) {
    result.errors.push(`active: ${err && err.message ? err.message : err}`);
  }
  try {
    result.rosterCount = getRosterEntries_(true).length;
  } catch (err) {
    result.errors.push(`roster: ${err && err.message ? err.message : err}`);
  }
  try {
    result.unitProgressKeys = Object.keys(getTeacherUnitProgress_()).length;
  } catch (err) {
    result.errors.push(`unitProgress: ${err && err.message ? err.message : err}`);
  }
  return result;
}

function buildTeacherBootstrap_() {
  try {
    const data = teacherInit();
    return data && typeof data === 'object'
      ? data
      : { units: [], active: null, roster: [], unitProgress: {}, build: APP_BUILD, errors: ['teacherInit returned empty'] };
  } catch (err) {
    return {
      units: [],
      active: null,
      roster: [],
      unitProgress: {},
      build: typeof APP_BUILD !== 'undefined' ? APP_BUILD : '',
      errors: [`bootstrap: ${err && err.message ? err.message : err}`],
    };
  }
}

function safeJsonForHtml_(value) {
  return JSON.stringify(value == null ? null : value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function doPost(e) {
  const body = parseWebAppJsonBody_(e);
  const action = String(body.action || '').trim();
  if (action === 'rpc') {
    return jsonOutput_({ ok: true, data: dispatchPortableRpc_(body) });
  }
  if (action === 'tenantSetup') {
    return jsonOutput_(applyTenantSetupFromWeb_(body));
  }
  if (action === 'createDistributionTemplateNoUi') {
    return jsonOutput_(createDistributionTemplateNoUi());
  }
  if (action === 'refreshTemplateMaster') {
    return jsonOutput_(refreshTemplateMasterFromWeb_(body));
  }
  if (action === 'refreshShellConfigCache') {
    return jsonOutput_(refreshShellConfigCacheFromWeb_());
  }
  return jsonOutput_({ ok: false, error: 'unknown_action' });
}

function buildPublishedUpdateBundle_() {
  const bundle = (typeof SELF_UPDATE_BUNDLE !== 'undefined' && SELF_UPDATE_BUNDLE)
    ? SELF_UPDATE_BUNDLE
    : null;
  if (!bundle || !Array.isArray(bundle.files) || !bundle.files.length) {
    return { ok: false, error: 'bundle_not_ready' };
  }
  return {
    ok: true,
    ...bundle,
  };
}

function parseWebAppJsonBody_(e) {
  try {
    return JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_err) {
    return {};
  }
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function applyTenantSetupFromWeb_(body) {
  const result = setTenantDeploymentConfig(body || {});
  initSheets();
  refreshNextSheet_(getTenantSpreadsheet_(), { setupCompleted: true });
  return {
    ok: true,
    tenantId: result.tenantId,
    teacherName: result.teacherName,
    spreadsheetId: result.spreadsheetId,
  };
}

function refreshTemplateMasterFromWeb_(body) {
  const spreadsheetId = String((body && body.spreadsheetId) || '').trim();
  if (!isKnownDistributionTemplateMasterSpreadsheetId_(spreadsheetId)) {
    return { ok: false, error: 'forbidden_spreadsheet' };
  }
  const ss = SpreadsheetApp.openById(spreadsheetId);
  ensureDistributionTemplateMasterSetup_(ss);
  refreshIntroSheet_(ss);
  refreshNextSheet_(ss);
  trySyncDistributionTemplateMasterName_(ss);
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    name: ss.getName(),
    url: ss.getUrl(),
  };
}

function refreshShellConfigCacheFromWeb_() {
  clearTenantShellConfigCache_();
  const shell = getTenantShellConfig_({ forceRefresh: true, includeMaintenance: true });
  return {
    ok: Boolean(shell && shell.ok),
    source: String(shell && shell.source || '').trim(),
    configSource: String(shell && shell.configSource || '').trim(),
    maintenanceSource: String(shell && shell.maintenanceSource || '').trim(),
    latestBuild: String(shell && shell.config && shell.config.latestBuild || '').trim(),
    latestVersion: String(shell && shell.config && shell.config.latestVersion || '').trim(),
    configVersion: String(shell && shell.config && shell.config.configVersion || '').trim(),
    fetchError: String(shell && shell.fetchError || '').trim(),
  };
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    trySyncDistributionTemplateMasterName_(ss);
    refreshIntroSheet_(ss);
    refreshNextSheet_(ss);
    tryMarkCurrentSheetDeployed_();
  } catch (_err) {}
  SpreadsheetApp.getUi()
    .createMenu('じぶんまとめ')
    .addItem('先生画面を開く', 'openTeacherPage_')
    .addItem('児童画面を開く', 'openStudentPage_')
    .addToUi();
  SpreadsheetApp.getUi()
    .createMenu('初期設定')
    .addItem('セットアップパネルを開く', 'showSetupRunnerSidebar')
    .addItem('セットアップ開始', 'startTeacherSetup')
    .addItem('Webアプリ化ガイドを開く', 'showWebAppDeploySidebar')
    .addItem('デプロイURL反映と更新認可', 'showWebAppUrlCaptureSidebar')
    .addItem('更新認可だけやり直す', 'enableTeacherUpdateAuthorization')
    .addToUi();
  SpreadsheetApp.getUi()
    .createMenu('配布')
    .addItem('配布用テンプレートを作る', 'createDistributionTemplate')
    .addToUi();
  try {
    if (shouldAutoOpenSetupRunner_()) {
      showSetupRunnerSidebar_({ auto: true });
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
  const baseUrl = ScriptApp.getService().getUrl();
  if (!baseUrl) {
    throw new Error('WebアプリURLが取得できません。いちどWebアプリとしてデプロイしてください。');
  }
  const normalizedParams = normalizeWebAppRouteParams_(params);
  const query = Object.keys(normalizedParams)
    .filter(key => normalizedParams[key] !== '' && normalizedParams[key] !== null && normalizedParams[key] !== undefined)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(normalizedParams[key])}`)
    .join('&');
  return query ? `${baseUrl}?${query}` : baseUrl;
}

function normalizeWebAppRouteParams_(params) {
  const source = { ...(params || {}) };
  const rawPage = String(source.page || source.p || '').trim().toLowerCase();
  delete source.page;
  delete source.p;
  if (rawPage === 'student' || rawPage === 's') {
    source.p = 's';
  } else if (rawPage === 'teacher' || rawPage === 't' || rawPage === '') {
    // teacher is the default route, so keep the base URL clean.
  } else if (rawPage) {
    source.page = rawPage;
  }
  return source;
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

function buildCopyChooserHtml_(e) {
  const params = (e && e.parameter) || {};
  const spreadsheetId = String(params.spreadsheetId || '').trim();
  const title = String(params.title || '').trim() || '配布テンプレート';
  const copyUrl = buildSpreadsheetCopyUrl_(spreadsheetId);
  const authuserLinks = [0, 1, 2, 3].map(index => {
    const url = `${copyUrl}${copyUrl.indexOf('?') >= 0 ? '&' : '?'}authuser=${index}`;
    return {
      label: `${index + 1}番目のアカウントでコピー`,
      note: `Chrome 右上のアカウント一覧で ${index + 1} 番目に見えている Google アカウント向け`,
      url,
    };
  });
  const safeTitle = escapeHtmlForWebApp_(title);
  const cardsHtml = authuserLinks.map(link => `
    <a href="${escapeAttributeForWebApp_(link.url)}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;border:1px solid #d8cbb7;border-radius:14px;padding:16px;background:#fffdf8;color:#1f2a30;">
      <div style="font-weight:700;font-size:16px;margin-bottom:6px;">${escapeHtmlForWebApp_(link.label)}</div>
      <div style="font-size:13px;line-height:1.7;color:#5f6b72;">${escapeHtmlForWebApp_(link.note)}</div>
    </a>
  `).join('');
  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <base target="_blank">
    </head>
    <body style="margin:0;font-family:'Yu Gothic UI','Hiragino Sans',sans-serif;background:linear-gradient(180deg,#efe6d7 0%,#f6f1e8 100%);color:#1f2a30;">
      <div style="max-width:760px;margin:0 auto;padding:32px 20px 56px;">
        <div style="background:#fffdf8;border:1px solid #d8cbb7;border-radius:18px;padding:24px;box-shadow:0 18px 40px rgba(44,37,24,0.08);">
          <h1 style="margin:0 0 10px;font-size:28px;">どの Google アカウントでコピーするか選ぶ</h1>
          <p style="margin:0 0 18px;line-height:1.8;color:#5f6b72;">${safeTitle} をどの Google アカウントの Drive にコピーするか選びます。</p>
          <div style="display:grid;gap:12px;">
            ${cardsHtml}
          </div>
          <div style="margin-top:18px;padding:14px 16px;border-radius:14px;background:#f7fbfa;border:1px solid #c9e5dd;line-height:1.8;">
            <div style="font-weight:700;margin-bottom:6px;">分からないとき</div>
            <div style="color:#5f6b72;font-size:13px;">まず 1番目 で試し、違う Drive に入ったら戻って 2番目 / 3番目 を試してください。コピー先が違ったら、そのコピーでは初期設定を押さずに閉じます。</div>
          </div>
          <p style="margin:18px 0 0;font-size:12px;color:#5f6b72;word-break:break-all;">通常リンク: ${escapeHtmlForWebApp_(copyUrl)}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function escapeHtmlForWebApp_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttributeForWebApp_(value) {
  return escapeHtmlForWebApp_(value).replace(/"/g, '&quot;');
}

