const CONFIG = {
  registrationSheetName: 'Registrations',
  shellConfigSheetName: 'ShellConfig',
  templateCopyUrlBase: 'PASTE_TEMPLATE_COPY_URL_HERE',
  templateCopyChooserUrlBase: '',
  templateProvisionUrlBase: '',
  primaryShellConfigUrl: '',
  primaryMaintenanceUrl: '',
  guideModePath: '?mode=guide',
  latestTenantAppBuild: 'shell-config-phase2-2026-07-05-1730',
  latestTenantAppVersion: '376',
  latestTenantAppNote: 'Config のマルチオリジン配信とフォールバック対応',
  latestTenantBundleVersion: '1',
  minimumUpdaterVersion: '1',
  latestTenantBundlePath: 'update-bundle.json',
};

function doGet(e) {
  const mode = String((e && e.parameter && e.parameter.mode) || 'form');
  if (mode === 'form') {
    return HtmlService.createHtmlOutputFromFile('admin-register')
      .setTitle('Jibun Matome Registration');
  }
  if (mode === 'guide') {
    return HtmlService.createHtmlOutputFromFile('admin-guide')
      .setTitle('Jibun Matome Setup Guide');
  }
  if (mode === 'releaseInfo') {
    return jsonOutput_(getReleaseInfo_());
  }
  if (mode === 'releaseManifest') {
    return jsonOutput_(getReleaseManifest_());
  }
  if (mode === 'shellConfig') {
    return jsonOutput_(getShellConfigResponse_());
  }
  if (mode === 'maintenanceStatus') {
    return jsonOutput_(getMaintenanceStatusResponse_());
  }
  if (mode === 'copyChooser') {
    return HtmlService.createHtmlOutput(buildCopyChooserHtml_(e))
      .setTitle('コピー先アカウントを選ぶ')
      .addMetaTag('viewport', 'width=device-width,initial-scale=1');
  }
  return jsonOutput_({ ok: false, error: 'not_found' });
}

function doPost(e) {
  const body = parseJsonBody_(e);
  const action = String(body.action || '').trim();
  if (action === 'registerTeacher') return jsonOutput_(registerTeacher_(body));
  if (action === 'prepareProvision') return jsonOutput_(prepareProvision_(body));
  if (action === 'completeProvision') return jsonOutput_(completeProvision_(body));
  if (action === 'connectSheet') return jsonOutput_(connectSheet_(body));
  if (action === 'exportRegistration') return jsonOutput_(exportRegistration_(body));
  if (action === 'markDeployed') return jsonOutput_(markDeployed_(body));
  if (action === 'requestTenantUpdate') return jsonOutput_(requestTenantUpdate_(body));
  if (action === 'syncShellReleaseConfig') return jsonOutput_(syncShellReleaseConfig_());
  return jsonOutput_({ ok: false, error: 'unknown_action' });
}

function getReleaseInfo_() {
  return {
    ok: true,
    latestTenantAppBuild: String(CONFIG.latestTenantAppBuild || '').trim(),
    latestTenantAppVersion: String(CONFIG.latestTenantAppVersion || '').trim(),
    latestTenantAppNote: String(CONFIG.latestTenantAppNote || '').trim(),
    checkedAt: new Date().toISOString(),
  };
}

function getReleaseManifest_() {
  const sourceBundleUrl = buildLatestTenantBundleUrl_();
  return {
    ok: true,
    latestBuild: String(CONFIG.latestTenantAppBuild || '').trim(),
    latestVersion: String(CONFIG.latestTenantAppVersion || '').trim(),
    latestNote: String(CONFIG.latestTenantAppNote || '').trim(),
    bundleVersion: String(CONFIG.latestTenantBundleVersion || '').trim(),
    minimumUpdaterVersion: String(CONFIG.minimumUpdaterVersion || '').trim(),
    sourceBundleUrl,
    sourceSnapshot: null,
    updateAvailableMessage: '新しい版があります。URLはそのままで、更新タイミングを案内します。',
    releasedAt: new Date().toISOString(),
  };
}

function buildLatestTenantBundleUrl_() {
  const rawPath = String(CONFIG.latestTenantBundlePath || '').trim();
  if (!rawPath) return '';
  if (/^https?:\/\//i.test(rawPath)) return rawPath;
  const baseUrl = resolveReleaseAssetBaseUrl_();
  return baseUrl ? resolveAbsoluteUrl_(baseUrl, rawPath) : '';
}

function resolveReleaseAssetBaseUrl_() {
  const shellConfigUrl = String(CONFIG.primaryShellConfigUrl || '').trim();
  if (shellConfigUrl) return shellConfigUrl;
  const maintenanceUrl = String(CONFIG.primaryMaintenanceUrl || '').trim();
  if (maintenanceUrl) return maintenanceUrl;
  return '';
}

function resolveAbsoluteUrl_(baseUrl, relativePath) {
  const base = String(baseUrl || '').trim();
  const relative = String(relativePath || '').trim();
  if (!base || !relative) return '';
  if (/^https?:\/\//i.test(relative)) return relative;
  const normalizedBase = base.replace(/[^/]+$/, '');
  const trimmedRelative = relative.replace(/^\.\/+/, '');
  return `${normalizedBase}${trimmedRelative}`;
}

function getShellConfigResponse_() {
  const shell = getResolvedShellConfig_();
  return {
    ok: true,
    latestVersion: String(shell.latestVersion || '').trim(),
    latestBuild: String(shell.latestBuild || '').trim(),
    maintenanceMode: Boolean(shell.maintenanceMode),
    featureToggles: shell.featureToggles || {},
    endpoints: shell.endpoints || {},
    labels: shell.labels || {},
    questionTemplates: shell.questionTemplates || {},
    aiPrompts: shell.aiPrompts || {},
    noticeBanner: shell.noticeBanner || {},
    checkedAt: new Date().toISOString(),
    configVersion: String(shell.configVersion || '').trim(),
    source: shell.source || 'sheet',
  };
}

function getMaintenanceStatusResponse_() {
  const shell = getResolvedShellConfig_();
  return {
    ok: true,
    maintenanceMode: Boolean(shell.maintenanceMode),
    noticeBanner: shell.noticeBanner || {},
    checkedAt: new Date().toISOString(),
    configVersion: String(shell.configVersion || '').trim(),
  };
}

function parseJsonBody_(e) {
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

function getRegistrationSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.registrationSheetName);
  const headers = [[
    'registrationId',
    'createdAt',
    'updatedAt',
    'status',
    'teacherName',
    'teacherEmail',
    'schoolName',
    'grade',
    'className',
    'tenantId',
    'spreadsheetId',
    'spreadsheetUrl',
    'scriptId',
    'scriptUrl',
    'deploymentId',
    'notes',
    'errorMessage',
  ]];
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.registrationSheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  }
  return sheet;
}

function getShellConfigSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.shellConfigSheetName);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.shellConfigSheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([['key', 'value', 'note']]);
  }
  ensureShellConfigDefaults_(sheet);
  return sheet;
}

function ensureShellConfigDefaults_(sheet) {
  const target = sheet || getShellConfigSheet_();
  const lastRow = target.getLastRow();
  const existing = {};
  if (lastRow > 1) {
    target.getRange(2, 1, lastRow - 1, 2).getValues().forEach(row => {
      const key = String(row[0] || '').trim();
      if (key) existing[key] = row[1];
    });
  }
  const defaults = buildDefaultShellConfigRows_().filter(row => !Object.prototype.hasOwnProperty.call(existing, row[0]));
  if (defaults.length) {
    target.getRange(target.getLastRow() + 1, 1, defaults.length, 3).setValues(defaults);
  }
}

function buildDefaultShellConfigRows_() {
  return [
    ['latestVersion', String(CONFIG.latestTenantAppVersion || '').trim(), '配布版の最新version'],
    ['latestBuild', String(CONFIG.latestTenantAppBuild || '').trim(), '配布版の最新build'],
    ['maintenanceMode', 'false', '緊急停止フラグ true/false'],
    ['featureToggles', JSON.stringify({
      allowUpdateRequest: true,
      showAiSettings: true,
      showUpdateTab: true,
      showNoticeBanner: true,
      showRegistrationLink: true,
      showHelpUpdateGuide: true,
    }), 'JSON'],
    ['endpoints', JSON.stringify(buildDefaultShellEndpoints_()), 'JSON'],
    ['labels', JSON.stringify({
      appName: 'じぶんまとめ',
      teacherUpdateCta: '更新を確認',
      helpIntro: '最初にやること、APIキー設定、児童への配布方法をここにまとめています。',
      helpStep1Title: '1. 最初の流れ',
      helpStep1Item1: '単元設定で単元を作る',
      helpStep1Item2: '必要なら名簿を入れる',
      helpStep1Item3: '授業スタートで授業を開始する',
      helpStep1Item4: 'この下の児童ページURLを配布する',
      helpStep2Title: '2. 児童への配布',
      helpStep2Item1: '基本URLを開くと先生ページが表示される',
      helpStep2Item2: '下の児童ページURLをコピーする',
      helpStep2Item3: 'ロイロノート等で同じURLを全員に配布する',
      helpStep2Item4: '児童はそのURLから毎時間入る',
      helpStep2Item5: '単元と時間目は先生側の授業スタートに連動する',
      helpStudentCardTitle: '児童ページ',
      helpRegistrationCardTitle: '登録ページ',
      helpOpenLabel: '開く',
      helpCopyLabel: 'URLをコピー',
      helpStudentQrTitle: '児童ページQR',
      helpRegistrationQrTitle: '登録ページQR',
      helpDistributionNote: '基本URLは先生用です。児童にはここにある児童ページURLだけを配布してください。',
        helpStep3Title: '3. Gemini APIキーの取得',
        helpStep4Title: '4. APIキーの注意',
        helpStep5Title: '5. アプリ更新',
        helpApiStudioLabel: 'Google AI Studio を開く',
        helpOpenUpdateLabel: '設定の更新を開く',
        helpStep5Item1: '更新確認は「設定・Aiプロンプト」タブの「更新」から行います',
        helpStep5Item2: '通常は最新版確認だけで十分です',
        helpStep5Item3: '必要なときだけ「更新を依頼」または「1つ前に戻す」を使います',
        teacherLatestPrefix: '最新版:',
        teacherCurrentPrefix: 'このアプリ:',
        teacherMaintenanceOnLabel: '緊急停止: ON この個体は保守表示を優先します',
        teacherMaintenanceOffLabel: '緊急停止: OFF',
        teacherNoticePrefix: 'お知らせ:',
        teacherNoticeEmptyLabel: 'お知らせ: なし',
        teacherShellCacheFreshLabel: '設定キャッシュ: 新しい',
        teacherShellCacheStaleLabel: '設定キャッシュ: 古いキャッシュ使用中',
        teacherShellCacheEmptyLabel: '設定キャッシュ: 取得前',
        teacherShellSourceConfigLabel: '設定',
        teacherShellSourceMaintenanceLabel: '保守',
        teacherShellSourceCdnLabel: 'CDN配信',
        teacherShellSourceGasLabel: 'GAS予備経路',
        teacherShellSourceCacheLabel: 'ローカルキャッシュ',
        teacherShellSourceDefaultLabel: '既定値',
        teacherUpdateLastPrefix: '前回更新:',
        teacherUpdateConditionPrefix: '更新条件:',
        studentSelectTitle: '✏️ じぶんまとめ',
      studentSelectSubtitle: 'きみのばんごうをタップしてね',
      studentResumeStartLabel: 'この番号ではじめる',
      studentResumeChangeLabel: 'えらびなおす',
      studentPeriodTitle: '📚 なんじかんめ？',
      studentChangeNumberLabel: '番号をえらびなおす',
      studentAutoSaveLabel: '⏱️ 30びょうごとにじどうほぞん',
      studentCurrentTabLabel: '✏️ こんかい',
      studentHistoryTabLabel: '📚 これまで',
      studentTimelineLabel: 'みんなのきろく',
      studentMyRecordTitle: '🙋 わたしのきろく',
      studentSubmitLabel: '🚀 ていしゅつ',
      studentMaintenanceSubmitLabel: '⏸️ メンテナンス中',
      studentRewriteLabel: '✏️ かきなおす（さいていしゅつできるよ）',
      studentAiCommentTitle: '🤖 AIせんせいからのコメント',
      studentHistoryCardTitle: '📚 これまでのきろく',
      studentHistoryNote: 'じゅぎょうのあとで、これまでの自分のきろくを見くらべられるよ。',
      studentMaintenanceMessage: 'ただいまメンテナンス中です。しばらく待ってからひらいてね。',
      studentMaintenanceSubmitNote: 'メンテナンス中はていしゅつできません。',
      studentRosterEmptyMessage: '名簿がまだ設定されていません。先生に伝えてね。',
      studentResumeMessageTemplate: '前につかった {{number}}ばん でそのままはじめられるよ。',
    }), 'JSON'],
    ['questionTemplates', JSON.stringify({}), 'JSON'],
    ['aiPrompts', JSON.stringify({
      prompt_comment: '',
      prompt_score: '',
      prompt_portfolio: '',
      prompt_unit_summary: '',
      prompt_assessment: '',
    }), 'JSON'],
    ['noticeBanner', JSON.stringify({
      enabled: false,
      level: 'info',
      title: '',
      message: '',
      linkUrl: '',
      linkLabel: '',
    }), 'JSON'],
    ['configVersion', 'shell-config-phase2', '任意の設定版ラベル'],
  ];
}

function buildDefaultShellEndpoints_() {
  const base = String(ScriptApp.getService().getUrl() || '').trim();
  return {
    primaryShellConfigUrl: String(CONFIG.primaryShellConfigUrl || '').trim(),
    fallbackShellConfigUrl: base ? buildUrlWithParams_(base, { mode: 'shellConfig' }) : '',
    primaryMaintenanceUrl: String(CONFIG.primaryMaintenanceUrl || '').trim(),
    fallbackMaintenanceUrl: base ? buildUrlWithParams_(base, { mode: 'maintenanceStatus' }) : '',
  };
}

function getResolvedShellConfig_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('shell_config_v1');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_err) {}
  }

  const values = {};
  const sheet = getShellConfigSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 2).getValues().forEach(row => {
      const key = String(row[0] || '').trim();
      if (key) values[key] = row[1];
    });
  }

  const resolved = {
    latestVersion: String(values.latestVersion || CONFIG.latestTenantAppVersion || '').trim(),
    latestBuild: String(values.latestBuild || CONFIG.latestTenantAppBuild || '').trim(),
    maintenanceMode: parseBooleanValue_(values.maintenanceMode, false),
    featureToggles: parseJsonObjectValue_(values.featureToggles),
    endpoints: parseJsonObjectValue_(values.endpoints),
    labels: parseJsonObjectValue_(values.labels),
    questionTemplates: parseJsonObjectValue_(values.questionTemplates),
    aiPrompts: parseJsonObjectValue_(values.aiPrompts),
    noticeBanner: parseJsonObjectValue_(values.noticeBanner),
    configVersion: String(values.configVersion || CONFIG.latestTenantAppBuild || '').trim(),
    source: 'sheet',
  };
  cache.put('shell_config_v1', JSON.stringify(resolved), 300);
  return resolved;
}

function syncShellReleaseConfig_() {
  const sheet = getShellConfigSheet_();
  const updates = {
    latestBuild: String(CONFIG.latestTenantAppBuild || '').trim(),
    latestVersion: String(CONFIG.latestTenantAppVersion || '').trim(),
    configVersion: 'shell-config-phase2',
    endpoints: JSON.stringify(buildDefaultShellEndpoints_()),
  };
  const lastRow = sheet.getLastRow();
  const keyRowMap = {};
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 2).getValues().forEach((row, index) => {
      const key = String(row[0] || '').trim();
      if (key) keyRowMap[key] = index + 2;
    });
  }
  Object.keys(updates).forEach(key => {
    const value = updates[key];
    const rowNumber = Number(keyRowMap[key] || 0);
    if (rowNumber > 0) {
      sheet.getRange(rowNumber, 2).setValue(value);
      return;
    }
    sheet.appendRow([key, value, 'auto synced from CONFIG']);
  });
  CacheService.getScriptCache().remove('shell_config_v1');
  const shell = getResolvedShellConfig_();
  return {
    ok: true,
    latestBuild: String(shell.latestBuild || '').trim(),
    latestVersion: String(shell.latestVersion || '').trim(),
    configVersion: String(shell.configVersion || '').trim(),
    endpoints: shell.endpoints || {},
  };
}

function parseBooleanValue_(value, fallback) {
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return Boolean(fallback);
  if (['true', '1', 'yes', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'off'].includes(raw)) return false;
  return Boolean(fallback);
}

function parseJsonObjectValue_(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function registerTeacher_(body) {
  return {
    ok: true,
    directTemplateUrl: buildDirectTemplateUrl_(),
    chooserTemplateUrl: buildChooserTemplateUrl_(),
    guideUrl: buildGuideUrl_(),
  };
}

function registerTeacherFromForm(payload) {
  return registerTeacher_(payload || {});
}

function prepareProvision_(body) {
  const teacherName = String(body.teacherName || '').trim();
  const teacherEmail = String(body.teacherEmail || '').trim().toLowerCase();
  const schoolName = String(body.schoolName || '').trim();
  const grade = String(body.grade || '').trim();
  const className = String(body.className || '').trim();
  const notes = String(body.notes || '').trim();
  const provisionUrlBase = buildProvisionBaseUrl_();

  if (!provisionUrlBase) return { ok: false, error: 'provision_not_configured' };
  if (!teacherName) return { ok: false, error: 'teacherName required' };
  if (!schoolName) return { ok: false, error: 'schoolName required' };
  if (!grade) return { ok: false, error: 'grade required' };

  const registrationId = Utilities.getUuid();
  const now = new Date().toISOString();
  const sheet = getRegistrationSheet_();
  sheet.appendRow([
    registrationId,
    now,
    now,
    'prepared',
    teacherName,
    teacherEmail,
    schoolName,
    grade,
    className,
    '',
    '',
    '',
    '',
    '',
    '',
    notes,
    '',
  ]);

  return {
    ok: true,
    registrationId,
    provisionUrl: buildProvisionUrl_(registrationId),
  };
}

function prepareProvisionFromForm(payload) {
  return prepareProvision_(payload || {});
}

function completeProvision_(body) {
  const registrationId = String(body.registrationId || '').trim();
  const spreadsheetId = String(body.spreadsheetId || '').trim();
  const spreadsheetUrl = String(body.spreadsheetUrl || '').trim();
  const notes = String(body.notes || '').trim();
  if (!registrationId) return { ok: false, error: 'registrationId required' };
  if (!spreadsheetId) return { ok: false, error: 'spreadsheetId required' };

  const rowNumber = findRegistrationRow_(registrationId);
  if (!rowNumber) return { ok: false, error: 'registration not found' };

  const sheet = getRegistrationSheet_();
  const now = new Date().toISOString();
  sheet.getRange(rowNumber, 3).setValue(now);
  sheet.getRange(rowNumber, 4).setValue('provisioned');
  sheet.getRange(rowNumber, 11).setValue(spreadsheetId);
  sheet.getRange(rowNumber, 12).setValue(spreadsheetUrl);
  if (notes) sheet.getRange(rowNumber, 16).setValue(notes);
  sheet.getRange(rowNumber, 17).setValue('');
  return { ok: true, registrationId };
}

function connectSheet_(body) {
  const registrationId = String(body.registrationId || '').trim();
  const spreadsheetId = String(body.spreadsheetId || '').trim();
  const spreadsheetUrl = String(body.spreadsheetUrl || '').trim();
  const scriptId = String(body.scriptId || '').trim();
  const scriptUrl = String(body.scriptUrl || '').trim();
  const teacherName = String(body.teacherName || '').trim();
  const teacherEmail = String(body.teacherEmail || '').trim().toLowerCase();
  const schoolName = String(body.schoolName || '').trim();
  const grade = String(body.grade || '').trim();
  const className = String(body.className || '').trim();
  const notes = String(body.notes || '').trim();

  if (!spreadsheetId) return { ok: false, error: 'spreadsheetId required' };
  if (!scriptId) return { ok: false, error: 'scriptId required' };

  const sheet = getRegistrationSheet_();
  let rowNumber = 0;
  if (registrationId) {
    rowNumber = findRegistrationRow_(registrationId);
  }
  if (!rowNumber) {
    rowNumber = findRegistrationRowBySpreadsheetId_(spreadsheetId);
  }
  const now = new Date().toISOString();

  if (!rowNumber) {
    const createdRegistrationId = registrationId || Utilities.getUuid();
    sheet.appendRow([
      createdRegistrationId,
      now,
      now,
      'sheet_connected',
      teacherName,
      teacherEmail,
      schoolName,
      grade,
      className,
      '',
      spreadsheetId,
      spreadsheetUrl,
      scriptId,
      scriptUrl,
      '',
      notes,
      '',
    ]);
    return { ok: true, registrationId: createdRegistrationId, created: true };
  }

  const current = mapRegistrationRow_(sheet.getRange(rowNumber, 1, 1, 17).getValues()[0]);
  sheet.getRange(rowNumber, 3).setValue(now);
  sheet.getRange(rowNumber, 4).setValue(current.status === 'deployed' ? 'deployed' : 'sheet_connected');
  if (teacherName) sheet.getRange(rowNumber, 5).setValue(teacherName);
  if (teacherEmail) sheet.getRange(rowNumber, 6).setValue(teacherEmail);
  if (schoolName) sheet.getRange(rowNumber, 7).setValue(schoolName);
  if (grade) sheet.getRange(rowNumber, 8).setValue(grade);
  sheet.getRange(rowNumber, 9).setValue(className);
  sheet.getRange(rowNumber, 11).setValue(spreadsheetId);
  sheet.getRange(rowNumber, 12).setValue(spreadsheetUrl);
  sheet.getRange(rowNumber, 13).setValue(scriptId);
  sheet.getRange(rowNumber, 14).setValue(scriptUrl);
  if (notes) sheet.getRange(rowNumber, 16).setValue(notes);
  sheet.getRange(rowNumber, 17).setValue('');

  return { ok: true, registrationId: String(current.registrationId || '').trim(), created: false };
}

function markDeployed_(body) {
  const registrationId = String(body.registrationId || '').trim();
  const tenantId = String(body.tenantId || '').trim();
  const deploymentId = String(body.deploymentId || '').trim();
  if (!registrationId) return { ok: false, error: 'registrationId required' };

  const rowNumber = findRegistrationRow_(registrationId);
  if (!rowNumber) return { ok: false, error: 'registration not found' };

  const sheet = getRegistrationSheet_();
  const now = new Date().toISOString();
  sheet.getRange(rowNumber, 3).setValue(now);
  sheet.getRange(rowNumber, 4).setValue('deployed');
  if (tenantId) sheet.getRange(rowNumber, 10).setValue(tenantId);
  if (deploymentId) sheet.getRange(rowNumber, 15).setValue(deploymentId);
  sheet.getRange(rowNumber, 17).setValue('');
  return { ok: true, registrationId };
}

function requestTenantUpdate_(body) {
  const registrationId = String(body.registrationId || '').trim();
  const spreadsheetId = String(body.spreadsheetId || '').trim();
  if (!registrationId && !spreadsheetId) {
    return { ok: false, error: 'registrationId or spreadsheetId required' };
  }

  let rowNumber = registrationId ? findRegistrationRow_(registrationId) : 0;
  if (!rowNumber && spreadsheetId) {
    rowNumber = findRegistrationRowBySpreadsheetId_(spreadsheetId);
  }
  if (!rowNumber) return { ok: false, error: 'registration not found' };

  const sheet = getRegistrationSheet_();
  const current = mapRegistrationRow_(sheet.getRange(rowNumber, 1, 1, 17).getValues()[0]);
  const now = new Date().toISOString();
  const nextNotes = appendRegistrationNote_(
    current.notes,
    buildTenantUpdateRequestNote_(body, now)
  );

  sheet.getRange(rowNumber, 3).setValue(now);
  if (body.teacherName) sheet.getRange(rowNumber, 5).setValue(String(body.teacherName || '').trim());
  if (body.teacherEmail) sheet.getRange(rowNumber, 6).setValue(String(body.teacherEmail || '').trim().toLowerCase());
  if (body.schoolName) sheet.getRange(rowNumber, 7).setValue(String(body.schoolName || '').trim());
  if (body.grade) sheet.getRange(rowNumber, 8).setValue(String(body.grade || '').trim());
  if (body.className !== undefined) sheet.getRange(rowNumber, 9).setValue(String(body.className || '').trim());
  if (body.tenantId) sheet.getRange(rowNumber, 10).setValue(String(body.tenantId || '').trim());
  if (spreadsheetId) sheet.getRange(rowNumber, 11).setValue(spreadsheetId);
  if (body.spreadsheetUrl) sheet.getRange(rowNumber, 12).setValue(String(body.spreadsheetUrl || '').trim());
  if (body.scriptId) sheet.getRange(rowNumber, 13).setValue(String(body.scriptId || '').trim());
  if (body.scriptUrl) sheet.getRange(rowNumber, 14).setValue(String(body.scriptUrl || '').trim());
  if (body.deploymentId) sheet.getRange(rowNumber, 15).setValue(String(body.deploymentId || '').trim());
  sheet.getRange(rowNumber, 16).setValue(nextNotes);
  sheet.getRange(rowNumber, 17).setValue('');

  return {
    ok: true,
    registrationId: String(current.registrationId || registrationId || '').trim(),
    status: String(current.status || '').trim(),
    requestedAt: now,
    latestTenantAppBuild: String(CONFIG.latestTenantAppBuild || '').trim(),
    latestTenantAppVersion: String(CONFIG.latestTenantAppVersion || '').trim(),
  };
}

function exportRegistration_(body) {
  const registrationId = String(body.registrationId || '').trim();
  if (!registrationId) return { ok: false, error: 'registrationId required' };
  const rowNumber = findRegistrationRow_(registrationId);
  if (!rowNumber) return { ok: false, error: 'registration not found' };

  const sheet = getRegistrationSheet_();
  const row = sheet.getRange(rowNumber, 1, 1, 17).getValues()[0];
  return {
    ok: true,
    registration: mapRegistrationRow_(row),
  };
}

function findRegistrationRow_(registrationId) {
  const sheet = getRegistrationSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '') === registrationId) return i + 2;
  }
  return 0;
}

function findRegistrationRowBySpreadsheetId_(spreadsheetId) {
  const sheet = getRegistrationSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const values = sheet.getRange(2, 11, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === String(spreadsheetId || '').trim()) {
      return i + 2;
    }
  }
  return 0;
}

function buildDirectTemplateUrl_() {
  const base = String(CONFIG.templateCopyUrlBase || '').trim();
  if (!base) {
    throw new Error('CONFIG.templateCopyUrlBase is not set.');
  }
  const activeSpreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const templateSpreadsheetId = extractSpreadsheetId_(base);
  if (templateSpreadsheetId && templateSpreadsheetId === activeSpreadsheetId) {
    throw new Error('CONFIG.templateCopyUrlBase points to the admin spreadsheet. Set a separate template spreadsheet URL.');
  }
  if (templateSpreadsheetId) {
    return `https://docs.google.com/spreadsheets/d/${templateSpreadsheetId}/copy`;
  }
  return base;
}

function buildChooserTemplateUrl_() {
  const base = String(CONFIG.templateCopyUrlBase || '').trim();
  const chooserBase = String(CONFIG.templateCopyChooserUrlBase || '').trim();
  if (!base) {
    throw new Error('CONFIG.templateCopyUrlBase is not set.');
  }
  const templateSpreadsheetId = extractSpreadsheetId_(base);
  const effectiveChooserBase = chooserBase || resolveLocalChooserBaseUrl_();
  if (effectiveChooserBase && templateSpreadsheetId) {
    return buildUrlWithParams_(effectiveChooserBase, {
      mode: 'copyChooser',
      spreadsheetId: templateSpreadsheetId,
      title: 'ふりかえりアプリ 配布テンプレート',
    });
  }
  return buildDirectTemplateUrl_();
}

function buildProvisionBaseUrl_() {
  return '';
}

function buildProvisionUrl_(_registrationId) {
  return '';
}

function buildUrlWithParams_(base, params) {
  const query = Object.keys(params || {})
    .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  if (!query) return base;
  return base.indexOf('?') >= 0 ? `${base}&${query}` : `${base}?${query}`;
}

function resolveLocalChooserBaseUrl_() {
  try {
    return String(ScriptApp.getService().getUrl() || '').trim();
  } catch (_err) {
    return '';
  }
}

function extractSpreadsheetId_(url) {
  const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
}

function buildGuideUrl_() {
  const path = String(CONFIG.guideModePath || '?mode=guide').trim();
  return ScriptApp.getService().getUrl() + path;
}

function buildCopyChooserHtml_(e) {
  const params = (e && e.parameter) || {};
  const spreadsheetId = String(params.spreadsheetId || '').trim();
  const title = String(params.title || '').trim() || '配布テンプレート';
  const copyUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/copy`
    : buildDirectTemplateUrl_();
  const authuserLinks = [0, 1, 2, 3].map(index => {
    const url = `${copyUrl}${copyUrl.indexOf('?') >= 0 ? '&' : '?'}authuser=${index}`;
    return {
      label: `${index + 1}番目のアカウントでコピー`,
      note: `Chrome 右上のアカウント一覧で ${index + 1} 番目に見えている Google アカウント向け`,
      url,
    };
  });
  const safeTitle = escapeHtmlForAdmin_(title);
  const cardsHtml = authuserLinks.map(link => `
    <a href="${escapeAttributeForAdmin_(link.url)}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;border:1px solid #d8cbb7;border-radius:14px;padding:16px;background:#fffdf8;color:#1f2a30;">
      <div style="font-weight:700;font-size:16px;margin-bottom:6px;">${escapeHtmlForAdmin_(link.label)}</div>
      <div style="font-size:13px;line-height:1.7;color:#5f6b72;">${escapeHtmlForAdmin_(link.note)}</div>
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
          <p style="margin:18px 0 0;font-size:12px;color:#5f6b72;word-break:break-all;">通常リンク: ${escapeHtmlForAdmin_(copyUrl)}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function escapeHtmlForAdmin_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttributeForAdmin_(value) {
  return escapeHtmlForAdmin_(value).replace(/"/g, '&quot;');
}

function mapRegistrationRow_(row) {
  return {
    registrationId: row[0] || '',
    createdAt: row[1] || '',
    updatedAt: row[2] || '',
    status: row[3] || '',
    teacherName: row[4] || '',
    teacherEmail: row[5] || '',
    schoolName: row[6] || '',
    grade: row[7] || '',
    className: row[8] || '',
    tenantId: row[9] || '',
    spreadsheetId: row[10] || '',
    spreadsheetUrl: row[11] || '',
    scriptId: row[12] || '',
    scriptUrl: row[13] || '',
    deploymentId: row[14] || '',
    notes: row[15] || '',
    errorMessage: row[16] || '',
  };
}

function appendRegistrationNote_(existing, entry) {
  const current = String(existing || '').trim();
  const next = String(entry || '').trim();
  if (!next) return current;
  if (!current) return next;
  return `${current}\n${next}`;
}

function buildTenantUpdateRequestNote_(body, requestedAt) {
  const parts = [
    `[update_request ${requestedAt}]`,
  ];
  const currentBuild = String(body.currentBuild || '').trim();
  const latestKnownBuild = String(body.latestKnownBuild || '').trim();
  const latestKnownVersion = String(body.latestKnownVersion || '').trim();
  const deploymentId = String(body.deploymentId || '').trim();
  const scriptId = String(body.scriptId || '').trim();
  const currentWebAppUrl = String(body.currentWebAppUrl || '').trim();
  if (currentBuild) parts.push(`currentBuild=${currentBuild}`);
  if (latestKnownBuild) parts.push(`latestBuild=${latestKnownBuild}`);
  if (latestKnownVersion) parts.push(`latestVersion=${latestKnownVersion}`);
  if (deploymentId) parts.push(`deploymentId=${deploymentId}`);
  if (scriptId) parts.push(`scriptId=${scriptId}`);
  if (currentWebAppUrl) parts.push(`webAppUrl=${currentWebAppUrl}`);
  return parts.join(' | ');
}








