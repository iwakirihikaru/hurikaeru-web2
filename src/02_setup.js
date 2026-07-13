// ============================================================
//  初期化（初回のみ手動実行）
// ============================================================
function initSheets() {
  const ss = getTenantSpreadsheet_();
  cleanupGuideSheets_(ss);

  // 設定シート
  if (!ss.getSheetByName(SHEET_CFG)) {
    const s = ss.insertSheet(SHEET_CFG);
    s.getRange(1,1,1,3).setValues([['キー','値','説明']]);
    s.getRange(2,1,6,3).setValues([
      ['medal_top',      '5',  'メダル上位人数（最大5）'],
      ['prompt_comment', DEFAULT_PROMPT_COMMENT, 'コメント用プロンプト'],
      ['prompt_score',   DEFAULT_PROMPT_SCORE, 'スコア評価基準'],
      ['prompt_portfolio', DEFAULT_PROMPT_PORTFOLIO, 'ポートフォリオ所見用プロンプト'],
      ['prompt_unit_summary', DEFAULT_PROMPT_UNIT_SUMMARY, '単元記録AI要約用プロンプト'],
      ['prompt_assessment', DEFAULT_PROMPT_ASSESSMENT, 'AI仮評定用プロンプト'],
      ['active_unit',    '', 'アクティブ単元ID'],
      ['active_period',  '0','アクティブ時間目（0=未選択）'],
      ['active_timeline_field', '', '他者参照で優先表示する項目キー（空=自動）'],
    ]);
  }

  // 教科デフォルトシート
  if (!ss.getSheetByName(SHEET_SUBJECT)) {
    const s = ss.insertSheet(SHEET_SUBJECT);
    s.getRange(1,1,1,3).setValues([['教科','項目設定(JSON または旧カンマ区切り)','説明']]);
    s.getRange(2,1,SUBJECTS.length,3).setValues(
      SUBJECTS.map(subject => [subject, JSON.stringify(getDefaultSubjectFields_(subject)), ''])
    );
  }

  // 単元一覧シート
  if (!ss.getSheetByName(SHEET_UNITS)) {
    const s = ss.insertSheet(SHEET_UNITS);
    s.getRange(1,1,1,7).setValues([
      ['ID','単元名','教科','最大時間数','作成日','フィールドJSON','削除']
    ]);
  }

  // 単元集約シート
  if (!ss.getSheetByName(SHEET_AGG)) {
    const s = ss.insertSheet(SHEET_AGG);
    s.getRange(1,1,1,AGG_HEADERS.length).setValues([AGG_HEADERS]);
  }

  if (!ss.getSheetByName(SHEET_FIELD_PRESETS)) {
    const s = ss.insertSheet(SHEET_FIELD_PRESETS);
    s.getRange(1,1,1,FIELD_PRESET_HEADERS.length).setValues([FIELD_PRESET_HEADERS]);
  }

  ensureDbSheets_();
  ensureSubjectDefaultRows_();
  ensureFieldPresetSheet_();

  Logger.log('初期化完了！');
}

function startTeacherSetup() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  cleanupGuideSheets_(ss);
  const initialState = getSetupRunnerState_();
  if (!initialState.setupCompleted) {
    const registrationResult = registerTeacherSetup_({ ui, ss });
    if (!registrationResult || !registrationResult.ok) return registrationResult;
  }
  const deployResult = ensureTeacherWebAppDeployment_({ silent: true });
  tryMarkCurrentSheetDeployed_();
  const currentState = getSetupRunnerState_();
  if (currentState.deployPending) {
    const deployError = deployResult && deployResult.error ? `\n\n自動デプロイ: ${deployResult.error}` : '';
    ui.alert(`登録は完了しました。次は Webアプリ化 です。まず自動デプロイを試しましたが、ここでは完了しませんでした。開いたガイドからデプロイし、終わったら同じメニューの「デプロイURL反映と更新認可」を押してください。${deployError}`);
    showWebAppDeploySidebar_();
    return { ok: true, step: 'deploy_required' };
  }
  if (!currentState.updateAuthReady) {
    const authResult = checkTeacherUpdateAuthorization_();
    if (authResult && authResult.ok) {
      ui.alert('セットアップが完了しました。先生ページと更新機能が使えます。');
      return { ok: true, step: 'completed' };
    }
    return { ok: false, step: 'update_auth_required', error: authResult && authResult.error ? authResult.error : 'update_auth_required' };
  }
  ui.alert('セットアップは完了しています。先生ページと更新機能は利用可能です。');
  return { ok: true, step: 'already_completed' };
}

function registerTeacherSetup_(options) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const opts = options || {};
  const targetUi = opts.ui || ui;
  const targetSs = opts.ss || ss;
  const config = loadTemplateSetupConfig_(targetSs);
  const setupInfo = collectTeacherSetupInfo_(targetUi, targetSs, config);
  if (!setupInfo) return;
  const payload = {
    action: 'connectSheet',
    registrationId: String(config.registrationId || '').trim(),
    teacherName: setupInfo.teacherName,
    teacherEmail: setupInfo.teacherEmail,
    schoolName: setupInfo.schoolName,
    grade: setupInfo.grade,
    className: setupInfo.className,
    spreadsheetId: targetSs.getId(),
    spreadsheetUrl: targetSs.getUrl(),
    scriptId: ScriptApp.getScriptId(),
    scriptUrl: `https://script.google.com/home/projects/${ScriptApp.getScriptId()}/edit`,
  };

  const response = UrlFetchApp.fetch(ADMIN_WEBAPP_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(response.getContentText() || '{}');
  if (!json.ok) {
    throw new Error(json.error || 'connectSheet failed');
  }

  saveTemplateSetupConfig_({
    registrationId: String(json.registrationId || '').trim(),
    teacherName: setupInfo.teacherName,
    teacherEmail: setupInfo.teacherEmail,
    schoolName: setupInfo.schoolName,
    grade: setupInfo.grade,
    className: setupInfo.className,
    spreadsheetId: targetSs.getId(),
    setupCompletedAt: new Date().toISOString(),
    lastWebAppUrl: '',
  }, targetSs);
  tryMarkCurrentSheetDeployed_();
  return {
    ok: true,
    registrationId: String(json.registrationId || '').trim(),
  };
}

function getTeacherEmailForSetup_(ss) {
  const sessionEmail = String(Session.getActiveUser().getEmail() || '').trim();
  if (sessionEmail) return sessionEmail;
  try {
    const owner = DriveApp.getFileById(ss.getId()).getOwner();
    const ownerEmail = owner && typeof owner.getEmail === 'function' ? String(owner.getEmail() || '').trim() : '';
    if (ownerEmail) return ownerEmail;
  } catch (_err) {}
  return '';
}

function collectTeacherSetupInfo_(ui, ss, config) {
  const detectedEmail = getTeacherEmailForSetup_(ss);
  const alreadyConfigured = Boolean(String(config.setupCompletedAt || '').trim());
  const values = {
    teacherName: firstNonEmptyValue_(config.teacherName, getTeacherName_()),
    teacherEmail: firstNonEmptyValue_(config.teacherEmail, detectedEmail),
    schoolName: firstNonEmptyValue_(config.schoolName),
    grade: firstNonEmptyValue_(config.grade),
    className: firstNonEmptyValue_(config.className),
  };

  if (!values.teacherName) {
    values.teacherName = promptSetupField_(ui, '先生名を入力してください', '例: 岩切');
    if (values.teacherName === null) return null;
  }
  if (!values.schoolName) {
    values.schoolName = promptSetupField_(ui, '学校名を入力してください', '例: 北郷小中学校');
    if (values.schoolName === null) return null;
  }
  if (!alreadyConfigured && !values.teacherEmail) {
    const teacherEmail = promptSetupField_(ui, 'メールアドレスを入力してください（空欄のままでも可）', '例: sample@example.com', { allowBlank: true });
    if (teacherEmail === null) return null;
    values.teacherEmail = teacherEmail;
  }

  values.teacherName = String(values.teacherName || '').trim();
  values.teacherEmail = String(values.teacherEmail || '').trim().toLowerCase();
  values.schoolName = String(values.schoolName || '').trim();
  values.grade = String(values.grade || '').trim();
  values.className = String(values.className || '').trim();
  return values;
}

function promptSetupField_(ui, title, helpText, options) {
  const opt = options || {};
  while (true) {
    const result = ui.prompt(title, helpText || '', ui.ButtonSet.OK_CANCEL);
    if (result.getSelectedButton() !== ui.Button.OK) return null;
    const value = String(result.getResponseText() || '').trim();
    if (value || opt.allowBlank) {
      return value;
    }
    ui.alert('入力が空です。入力するか、キャンセルで中止してください。');
  }
}

function firstNonEmptyValue_() {
  for (let i = 0; i < arguments.length; i++) {
    const value = String(arguments[i] || '').trim();
    if (value) return value;
  }
  return '';
}

function createDistributionTemplate() {
  const ui = SpreadsheetApp.getUi();
  const source = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getDocumentProperties();
  const runningKey = 'TEMPLATE_BUILD_RUNNING';
  const startedAtKey = 'TEMPLATE_BUILD_STARTED_AT';
  const startedAt = Number(props.getProperty(startedAtKey) || 0);
  if (props.getProperty(runningKey) === '1' && Date.now() - startedAt < 3 * 60 * 1000) {
    ui.alert('いまテンプレート作成を実行中です。少し待ってから確認してください。');
    return;
  }
  const answer = ui.alert(
    '配布用テンプレートを作ります',
    '今のシートをコピーして、児童データ・単元・記録を空にした配布専用テンプレートを作成します。',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) return;

  props.setProperties({
    [runningKey]: '1',
    [startedAtKey]: String(Date.now()),
  }, false);

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('テンプレートをコピーしています...', '導入・配布', 5);
    const copyFile = createSpreadsheetCopyInSameFolder_(source);
    const templateSpreadsheet = SpreadsheetApp.openById(copyFile.getId());
    resetSpreadsheetForDistributionTemplate_(templateSpreadsheet);
    SpreadsheetApp.getActiveSpreadsheet().toast('テンプレートを作成しました。', '導入・配布', 5);
    showTemplateCreatedDialog_(templateSpreadsheet.getUrl());
  } finally {
    props.deleteProperty(runningKey);
    props.deleteProperty(startedAtKey);
  }
}

function createDistributionTemplateNoUi() {
  const source = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getDocumentProperties();
  const runningKey = 'TEMPLATE_BUILD_RUNNING';
  const startedAtKey = 'TEMPLATE_BUILD_STARTED_AT';
  const startedAt = Number(props.getProperty(startedAtKey) || 0);
  if (props.getProperty(runningKey) === '1' && Date.now() - startedAt < 3 * 60 * 1000) {
    return {
      ok: false,
      error: 'template_build_running',
    };
  }

  props.setProperties({
    [runningKey]: '1',
    [startedAtKey]: String(Date.now()),
  }, false);

  try {
    const copyFile = createSpreadsheetCopyInSameFolder_(source);
    const templateSpreadsheet = SpreadsheetApp.openById(copyFile.getId());
    resetSpreadsheetForDistributionTemplate_(templateSpreadsheet);
    return {
      ok: true,
      spreadsheetId: templateSpreadsheet.getId(),
      url: templateSpreadsheet.getUrl(),
      name: templateSpreadsheet.getName(),
    };
  } finally {
    props.deleteProperty(runningKey);
    props.deleteProperty(startedAtKey);
  }
}

function createSpreadsheetCopyInSameFolder_(spreadsheet) {
  const sourceFile = DriveApp.getFileById(spreadsheet.getId());
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
  const baseName = sanitizeTemplateBaseName_(spreadsheet.getName());
  const copyName = `${baseName}_配布テンプレート_${stamp}`;
  const parents = sourceFile.getParents();
  if (parents.hasNext()) {
    return sourceFile.makeCopy(copyName, parents.next());
  }
  return sourceFile.makeCopy(copyName);
}

function sanitizeTemplateBaseName_(name) {
  const text = String(name || '').trim();
  if (!text) return 'じぶんまとめ';
  return text
    .replace(/_配布テンプレート_.+$/, '')
    .replace(/_(配布用マスター|デバッグ用マスター|配布用|デバッグ用)(_.+)?$/u, '');
}

function buildDistributionTemplateMasterName_(spreadsheet, at) {
  const target = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const date = at instanceof Date ? at : new Date();
  const stamp = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyyMMdd');
  const baseName = sanitizeTemplateBaseName_(target.getName());
  return `${baseName}_配布用マスター_${stamp}`;
}

function trySyncDistributionTemplateMasterName_(spreadsheet) {
  const target = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  ensureDistributionTemplateMasterSetup_(target);
  const config = loadTemplateSetupConfig_(target);
  if (!isDistributionTemplateMasterSheet_(config, target)) {
    return false;
  }
  const nextName = buildDistributionTemplateMasterName_(target, new Date());
  if (String(target.getName() || '').trim() === nextName) {
    return false;
  }
  target.rename(nextName);
  return true;
}

function resetSpreadsheetForDistributionTemplate_(ss) {
  cleanupGuideSheets_(ss);
  resetRowsSheet_(ss, SHEET_CFG, buildTemplateConfigRows_());
  resetRowsSheet_(ss, SHEET_SUBJECT, buildTemplateSubjectRows_());
  resetRowsSheet_(ss, SHEET_UNITS, [[
    'ID','単元名','教科','最大時間数','作成日','フィールドJSON','削除'
  ]]);
  resetRowsSheet_(ss, SHEET_AGG, [AGG_HEADERS]);
  resetRowsSheet_(ss, SHEET_FIELD_PRESETS, [FIELD_PRESET_HEADERS]);
  resetRowsSheet_(ss, SHEET_DB_STUDENTS, [STUDENT_HEADERS]);
  resetRowsSheet_(ss, SHEET_DB_LESSONS, [LESSON_HEADERS]);
  resetRowsSheet_(ss, SHEET_DB_RESPONSES, [RESPONSE_HEADERS]);
  resetRowsSheet_(ss, SHEET_DB_HISTORY, [HISTORY_HEADERS]);
  resetRowsSheet_(ss, SHEET_DB_AUDIT, [AUDIT_HEADERS]);
  resetRowsSheet_(ss, SHEET_DB_ASSESS, [ASSESS_HEADERS]);
  resetRowsSheet_(ss, SHEET_DB_AI_EVENTS, [AI_EVENT_HEADERS]);
  resetRowsSheet_(ss, '名簿', buildTemplateRosterRows_());
  resetTemplateSetupConfigForDistribution_(ss);
  deleteGeneratedLessonSheets_(ss);
  prepareDistributionTemplateLandingSheet_(ss);
}

function cleanupGuideSheets_(ss) {
  const targetSpreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  [SHEET_INTRO, SHEET_NEXT].forEach(name => {
    const sheet = targetSpreadsheet.getSheetByName(name);
    if (!sheet) return;
    if (targetSpreadsheet.getSheets().length <= 1) return;
    targetSpreadsheet.deleteSheet(sheet);
  });
}

function buildTemplateConfigRows_() {
  return [
    ['キー','値','説明'],
    ['medal_top', '5', 'メダル上位人数（最大5）'],
    ['prompt_comment', DEFAULT_PROMPT_COMMENT, 'コメント用プロンプト'],
    ['prompt_score', DEFAULT_PROMPT_SCORE, 'スコア評価基準'],
    ['prompt_portfolio', DEFAULT_PROMPT_PORTFOLIO, 'ポートフォリオ所見用プロンプト'],
    ['prompt_unit_summary', DEFAULT_PROMPT_UNIT_SUMMARY, '単元記録AI要約用プロンプト'],
    ['prompt_assessment', DEFAULT_PROMPT_ASSESSMENT, 'AI仮評定用プロンプト'],
    ['active_unit', '', 'アクティブ単元ID'],
    ['active_period', '0', 'アクティブ時間目（0=未選択）'],
    ['active_timeline_field', '', '他者参照で優先表示する項目キー（空=自動）'],
  ];
}

function buildTemplateSubjectRows_() {
  return [
    ['教科','項目設定(JSON または旧カンマ区切り)','説明'],
    ...SUBJECTS.map(subject => [subject, JSON.stringify(getDefaultSubjectFields_(subject)), '']),
  ];
}

function buildTemplateRosterRows_() {
  const rows = [];
  for (let i = 1; i <= MAX_STUDENTS; i++) {
    rows.push([i, '']);
  }
  return rows;
}

function resetRowsSheet_(ss, name, rows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clearContents();
  const maxColumns = Math.max(...rows.map(row => row.length), 1);
  if (sheet.getMaxColumns() < maxColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), maxColumns - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, rows.length, maxColumns).setValues(rows);
}

function prepareDistributionTemplateLandingSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_CFG) || ss.insertSheet(SHEET_CFG);
  if (sheet.getIndex() !== 1) {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
  }
  if (sheet.getMaxColumns() < 11) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 11 - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < 12) {
    sheet.insertRowsAfter(sheet.getMaxRows(), 12 - sheet.getMaxRows());
  }
  if (typeof sheet.setHiddenGridlines === 'function') {
    sheet.setHiddenGridlines(true);
  }
  try { sheet.hideColumns(1, 4); } catch (_err) {}
  try { sheet.showColumns(5, 7); } catch (_err) {}
  sheet.setColumnWidths(5, 7, 120);
  sheet.setRowHeights(1, 12, 30);
  sheet.getRange('E1:K12').clearFormat().clearContent();

  sheet.getRange('E2:K3')
    .merge()
    .setValue('最初は「導入・配布」→「導入パネルを開く」')
    .setBackground('#eef6f3')
    .setFontSize(18)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#c9e5dd', SpreadsheetApp.BorderStyle.SOLID_THICK);

  sheet.getRange('E4:K6')
    .merge()
    .setValue('このシートを開いた直後は、上のメニューやボタンが押せるようになるまで数秒かかることがあります。少し待ってから、右上の「導入・配布」メニューを開いてください。')
    .setBackground('#fffdf8')
    .setWrap(true)
    .setFontSize(12)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#d8cbb7', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange('E8:K9')
    .merge()
    .setValue('通常は 1. 先生情報を登録して導入を進める から始めます。うまく進まなかったときだけ、同じメニューのガイドやURL反映を使います。')
    .setBackground('#fff7f0')
    .setWrap(true)
    .setFontSize(12)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#efc7b8', SpreadsheetApp.BorderStyle.SOLID);

  sheet.setActiveRange(sheet.getRange('E2'));
}

function resetTemplateSetupConfigForDistribution_(ss) {
  let sheet = ss.getSheetByName(TEMPLATE_CFG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TEMPLATE_CFG_SHEET);
  }
  sheet.clearContents();
  sheet.getRange(1, 1, 10, 2).setValues([
    ['registrationId', ''],
    ['teacherName', ''],
    ['teacherEmail', ''],
    ['schoolName', ''],
    ['grade', ''],
    ['className', ''],
    ['spreadsheetId', ''],
    ['setupCompletedAt', ''],
    ['lastWebAppUrl', ''],
    ['templateMasterSpreadsheetId', String(ss.getId() || '').trim()],
  ]);
  sheet.hideSheet();
}

function ensureDistributionTemplateMasterSetup_(ss) {
  const targetSpreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  const currentSpreadsheetId = String(targetSpreadsheet.getId() || '').trim();
  const config = loadTemplateSetupConfig_(targetSpreadsheet);
  if (!isKnownDistributionTemplateMasterSpreadsheetId_(currentSpreadsheetId)) {
    const masterSpreadsheetId = String(config.templateMasterSpreadsheetId || '').trim();
    if (masterSpreadsheetId) {
      const nextConfig = {
        ...config,
        templateMasterSpreadsheetId: '',
      };
      saveTemplateSetupConfig_(nextConfig, targetSpreadsheet);
      return nextConfig;
    }
    return config;
  }
  if (String(config.templateMasterSpreadsheetId || '').trim() === currentSpreadsheetId) {
    const setupSheet = getTemplateSetupSheet_(targetSpreadsheet);
    if (!setupSheet.isSheetHidden()) {
      setupSheet.hideSheet();
    }
    return config;
  }
  const nextConfig = {
    ...config,
    templateMasterSpreadsheetId: currentSpreadsheetId,
  };
  saveTemplateSetupConfig_(nextConfig, targetSpreadsheet);
  const setupSheet = getTemplateSetupSheet_(targetSpreadsheet);
  if (!setupSheet.isSheetHidden()) {
    setupSheet.hideSheet();
  }
  return nextConfig;
}

function ensureIntroSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_INTRO);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_INTRO, 0);
  }
  if (sheet.getIndex() !== 1) {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
  }
  return sheet;
}

function ensureNextSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NEXT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NEXT, 1);
  }
  return sheet;
}

function refreshIntroSheet_(ss) {
  const targetSpreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  ensureDistributionTemplateMasterSetup_(targetSpreadsheet);
  const sheet = ensureIntroSheet_(targetSpreadsheet);
  const introContent = buildIntroSheetContent_();

  sheet.clear();
  if (sheet.getMaxRows() < 18) {
    sheet.insertRowsAfter(sheet.getMaxRows(), 18 - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < 5) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 5 - sheet.getMaxColumns());
  }
  sheet.setFrozenRows(0);
  sheet.setColumnWidths(1, 1, 24);
  sheet.setColumnWidths(2, 1, 180);
  sheet.setColumnWidths(3, 3, 230);
  sheet.setRowHeights(6, 4, 30);
  sheet.setRowHeights(11, 2, 30);
  sheet.setRowHeights(15, 3, 30);
  if (typeof sheet.setHiddenGridlines === 'function') {
    sheet.setHiddenGridlines(true);
  }

  sheet.getRange('B2:E2').merge()
    .setValue('はじめに')
    .setFontSize(20)
    .setFontWeight('bold')
    .setBackground('#f6f1e8')
    .setHorizontalAlignment('center');
  sheet.getRange('B3:E3').merge()
    .setValue(introContent.header)
    .setFontColor('#5f6b72')
    .setHorizontalAlignment('center')
    .setFontSize(11);

  sheet.getRange('B5:E5').merge()
    .setValue('1. このシートを使い始める')
    .setFontWeight('bold')
    .setFontSize(14)
    .setBackground('#fff7f0');
  sheet.getRange('B6:E9')
    .merge()
    .setValue(introContent.setupBody)
    .setWrap(true)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('top')
    .setFontSize(12)
    .setBackground('#fffdf8')
    .setBorder(true, true, true, true, true, true, '#d8cbb7', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange('B11:E11').merge()
    .setValue('2. Webアプリ化へ進む')
    .setFontWeight('bold')
    .setFontSize(14)
    .setBackground('#eef6f3');
  sheet.getRange('B12:E13')
    .merge()
    .setValue(introContent.noteBody)
    .setWrap(true)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('top')
    .setFontSize(12)
    .setBackground('#fffdf8')
    .setBorder(true, true, true, true, true, true, '#c9e5dd', SpreadsheetApp.BorderStyle.SOLID_THICK);

  sheet.getRange('B15:E15').merge()
    .setValue(introContent.troubleTitle)
    .setFontWeight('bold')
    .setBackground('#fff7f0');
  sheet.getRange('B16:E18')
    .merge()
    .setValue(introContent.troubleBody)
    .setWrap(true)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('top')
    .setFontSize(12)
    .setBackground('#fffdf8')
    .setBorder(true, true, true, true, true, true, '#d8cbb7', SpreadsheetApp.BorderStyle.SOLID);
}

function buildIntroSheetContent_() {
  return {
    header: '右上メニューの「導入・配布」から進めます。',
    copyBody: '',
    setupBody: '1. 導入パネルの「先生情報を登録して導入を進める」を押します。\n2. 未登録なら先生名と学校名を登録します。\n3. その場で自動デプロイを試し、通らないときだけ手動ガイドへ進みます。',
    authBody: '',
    noteBody: '導入後は、先生ページを主入口として使います。導入パネルでは必要な作業だけ続けて進められます。',
    troubleTitle: 'コピー先が違ったとき',
    troubleBody: '思っていた Drive と違う場所に保存されたら、そのコピーでは導入を進めず閉じてください。戻って別のアカウントでやり直します。',
  };
}

function getSetupRunnerState_(options) {
  const opts = options || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = loadTemplateSetupConfig_(ss);
  const setupCompleted = Boolean(String(config.setupCompletedAt || '').trim());
  const confirmedWebAppUrl = normalizeWebAppUrl_(String(config.lastWebAppUrl || '').trim());
  const currentWebAppUrl = normalizeWebAppUrl_(getCurrentWebAppBaseUrl_());
  const deploymentId = resolveSetupDeploymentId_(config, {
    currentWebAppUrl,
    confirmedWebAppUrl,
  });
  const verifiedWebAppUrl = resolveVerifiedSetupWebAppUrl_(config, {
    currentWebAppUrl,
    confirmedWebAppUrl,
  });
  const webAppBaseUrl = verifiedWebAppUrl || '';
  const teacherUrl = buildWebAppUrlFromBase_(webAppBaseUrl, { page: 'teacher' });
  const studentUrl = buildWebAppUrlFromBase_(webAppBaseUrl, { page: 'student' });
  const deployPending = !(teacherUrl && studentUrl);
  let updateAuthReady = false;
  let updateAuthReason = deployPending
    ? 'Webアプリ化とURL反映のあとで有効化します。'
    : 'まだ更新用認可が済んでいません。';
  try {
    if (!deployPending && !opts.lightweight) {
      const versionControl = getTeacherVersionControlInfo_();
      updateAuthReady = Boolean(versionControl && versionControl.ok);
      updateAuthReason = updateAuthReady
        ? '更新機能の認可は済んでいます。'
        : String(versionControl && (versionControl.reason || versionControl.error) || updateAuthReason);
    } else if (!deployPending && opts.lightweight) {
      updateAuthReason = '起動直後は認可状態を簡易表示しています。必要なら手動で更新してください。';
    }
  } catch (err) {
    updateAuthReason = String(err && err.message ? err.message : err || updateAuthReason);
  }
  return {
    setupCompleted,
    deployPending,
    updateAuthReady,
    updateAuthReason,
    teacherUrl,
    studentUrl,
    teacherName: String(config.teacherName || getTeacherName_() || '').trim(),
    schoolName: String(config.schoolName || '').trim(),
    grade: String(config.grade || '').trim(),
    className: String(config.className || '').trim(),
  };
}

function shouldAutoOpenSetupRunner_() {
  return false;
}

function refreshNextSheet_(ss, options) {
  const targetSpreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  ensureDistributionTemplateMasterSetup_(targetSpreadsheet);
  const sheet = ensureNextSheet_(targetSpreadsheet);
  const config = loadTemplateSetupConfig_(targetSpreadsheet);
  const scriptId = String(ScriptApp.getScriptId() || '').trim();
  const scriptEditUrl = buildScriptEditorUrl_(scriptId);
  const spreadsheetUrl = String(targetSpreadsheet.getUrl() || '').trim();
  const confirmedWebAppUrl = normalizeWebAppUrl_(String(config.lastWebAppUrl || '').trim());
  const currentWebAppUrl = normalizeWebAppUrl_(getCurrentWebAppBaseUrl_());
  const deploymentId = resolveSetupDeploymentId_(config, {
    currentWebAppUrl,
    confirmedWebAppUrl,
  });
  const verifiedWebAppUrl = resolveVerifiedSetupWebAppUrl_(config, {
    currentWebAppUrl,
    confirmedWebAppUrl,
  });
  const webAppBaseUrl = verifiedWebAppUrl || '';
  const teacherUrl = buildWebAppUrlFromBase_(webAppBaseUrl, { page: 'teacher' });
  const studentUrl = buildWebAppUrlFromBase_(webAppBaseUrl, { page: 'student' });
  const setupCompleted = Boolean(options && options.setupCompleted) || isTemplateSetupCompleted_(config, ss);
  const deployPending = setupCompleted && !webAppBaseUrl;

  sheet.clear();
  if (sheet.getMaxRows() < 34) {
    sheet.insertRowsAfter(sheet.getMaxRows(), 34 - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < 6) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 6 - sheet.getMaxColumns());
  }
  sheet.setColumnWidths(1, 1, 28);
  sheet.setColumnWidths(2, 1, 180);
  sheet.setColumnWidths(3, 2, 250);
  sheet.setColumnWidths(5, 1, 220);
  sheet.setRowHeights(1, 34, 28);
  sheet.setRowHeights(6, 5, 34);
  sheet.setRowHeights(13, 4, 34);
  sheet.setRowHeights(19, 2, 34);
  sheet.setRowHeights(22, 2, 34);
  sheet.setRowHeights(25, 2, 34);
  sheet.setRowHeights(29, 3, 32);

  sheet.getRange('B2:E2').merge().setValue('つぎへ').setFontSize(20).setFontWeight('bold').setBackground('#f6f1e8');
  sheet.getRange('B3:E3').merge().setValue(
    setupCompleted
      ? (deployPending ? '登録は完了しています。次は Webアプリ化 をしてください。反映は自動ですが、うまく出ないときだけ URL を手動反映します。' : '導入は完了しています。下のURLから先生ページと児童ページを開けます。')
      : '導入が終わると、このシートに先生ページと児童ページの案内が出ます。'
    ).setFontColor('#5f6b72');

  sheet.getRange('B5:E5').merge().setValue('1. Webアプリ化をする').setFontWeight('bold').setBackground('#eef8f6');
  sheet.getRange('B6:D10').merge().setValue(
    '1. 右のボタンからこのスプレッドシートを開きます。\n' +
    '2. 上のメニューの「導入・配布」→「Webアプリ化ガイドを開く」または「拡張機能」→「Apps Script」を押します。\n' +
    '3. Apps Script 画面で「デプロイ」→「新しいデプロイ」を押します。\n' +
    '4. 種類の選択で「ウェブアプリ」を選び、アクセスできるユーザーを「全員」にしてデプロイします。\n' +
    '5. 最後に表示された Web アプリ URL をコピーします。'
  ).setWrap(true).setVerticalAlignment('top');
  sheet.getRange('E6:E10').merge();
  if (spreadsheetUrl) {
    sheet.getRange('E6').setFormula('=HYPERLINK("' + spreadsheetUrl.replace(/"/g, '""') + '","このシートから進む")');
  } else if (scriptEditUrl) {
    sheet.getRange('E6').setFormula('=HYPERLINK("' + scriptEditUrl.replace(/"/g, '""') + '","Apps Script を開く")');
  } else {
    sheet.getRange('E6').setValue('手動で開く');
  }
  sheet.getRange('E6:E10')
    .setFontWeight('bold')
    .setFontColor('#0e7c66')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.getRange('B5:E10').setBorder(true, true, true, true, true, true, '#d8cbb7', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange('B12:E12').merge().setValue('2. デプロイURL反映と更新認可').setFontWeight('bold').setBackground('#eef5fb');
  sheet.getRange('B13:D16').merge().setValue(
    deployPending
      ? 'Webアプリ化が終わると、通常はこのシートを開き直したタイミングで自動反映されます。もし下のリンクが出ないときだけ、上のメニューの「導入・配布」→「デプロイURL反映と更新認可」を押してください。\n\nURLでも deploymentId だけでも受け付け、その場で更新機能の認可までまとめて進めます。'
      : '反映済みです。Web アプリ URL がこのシートに保存されています。URL を作り直したときだけ、もう一度「導入・配布」→「デプロイURL反映と更新認可」を押してください。\n\nこの操作では、URL反映と更新機能の認可確認をまとめて行えます。'
  ).setWrap(true).setVerticalAlignment('top');
  sheet.getRange('E13:E16').merge();
  if (deployPending) {
    sheet.getRange('E13').setValue('メニューから反映');
  } else {
    sheet.getRange('E13').setValue('反映ずみ');
  }
  sheet.getRange('B12:E16').setBorder(true, true, true, true, true, true, '#d8cbb7', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange('B18:E18').merge().setValue('3. URL を使う').setFontWeight('bold').setBackground('#eef5fb');
  sheet.getRange('B19:D20').merge().setValue(
    teacherUrl
      ? '先生ページです。授業状況、単元設定、AI一括コメント、返却などはここから行います。'
      : 'まだ先生ページURLは使えません。先に Webアプリ化 と URL反映 をしてください。'
  ).setWrap(true).setVerticalAlignment('middle');
  sheet.getRange('E19:E20').merge();
  if (teacherUrl) {
    sheet.getRange('E19').setFormula('=HYPERLINK("' + teacherUrl.replace(/"/g, '""') + '","先生ページを開く")');
  } else {
    sheet.getRange('E19').setValue('未反映');
  }
  sheet.getRange('B19:E20').setBorder(true, true, true, true, true, true, '#d8cbb7', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange('B22:D23').merge().setValue(
    studentUrl
      ? '児童ページです。児童にはこのURLを配布します。全員同じURLで大丈夫です。'
      : 'まだ児童ページURLは使えません。先に Webアプリ化 と URL反映 をしてください。'
  ).setWrap(true).setVerticalAlignment('middle');
  sheet.getRange('E22:E23').merge();
  if (studentUrl) {
    sheet.getRange('E22').setFormula('=HYPERLINK("' + studentUrl.replace(/"/g, '""') + '","児童ページを開く")');
  } else {
    sheet.getRange('E22').setValue('未反映');
  }
  sheet.getRange('B22:E23').setBorder(true, true, true, true, true, true, '#d8cbb7', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange('B25:E25').merge().setValue('4. 最初にやること').setFontWeight('bold').setBackground('#fdf6ea');
  sheet.getRange('B26:E27').merge().setValue(
    'Webアプリ化が終わったら、まず先生ページで「単元設定」を行います。そのあと「授業状況」を使い始めます。'
  ).setWrap(true).setVerticalAlignment('middle');
  sheet.getRange('B25:E27').setBorder(true, true, true, true, true, true, '#d8cbb7', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange('B29:E29').merge().setValue('困ったとき').setFontWeight('bold').setBackground('#fff7f0');
  sheet.getRange('B30:E32').merge().setValue(
    (!setupCompleted
      ? 'まだ導入が終わっていません。先に導入パネルから登録を進めてください。\n\n'
      : '') +
    (deployPending
      ? 'リンクが開かないときは、デプロイ後に一度このシートを開き直してください。それでも出ない場合だけ「導入・配布 → デプロイURL反映と更新認可」を押してください。'
      : 'URLが出ないときは、もう一度「デプロイURL反映と更新認可」を実行するか、Webアプリを再デプロイして新しいURLを貼り直してください。更新ボタンや版戻しが使えないときは「導入・配布 → 更新認可だけやり直す」を一度押してください。')
  ).setWrap(true).setVerticalAlignment('top');
  sheet.getRange('B29:E32').setBorder(true, true, true, true, true, true, '#d8cbb7', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRangeList(['B6:E10', 'B13:E16', 'B19:E23', 'B26:E27', 'B30:E32'])
    .setFontSize(12)
    .setHorizontalAlignment('left');
  sheet.getRangeList(['E6:E10', 'E13:E16', 'E19:E20', 'E22:E23'])
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setFontWeight('bold')
    .setFontColor('#0e7c66');
}

function refreshDistributionTemplateSelf(spreadsheetId) {
  const targetSpreadsheetId = String(
    spreadsheetId || DISTRIBUTION_TEMPLATE_MASTER_SPREADSHEET_ID || ''
  ).trim();
  return refreshDistributionTemplateMaster_(targetSpreadsheetId);
}

function refreshTemplateMaster(spreadsheetId) {
  const targetSpreadsheetId = String(
    spreadsheetId || DISTRIBUTION_TEMPLATE_MASTER_SPREADSHEET_ID || ''
  ).trim();
  return refreshDistributionTemplateMaster_(targetSpreadsheetId);
}

function refreshDistributionTemplateMaster_(spreadsheetId) {
  const targetSpreadsheetId = String(spreadsheetId || '').trim();
  if (!targetSpreadsheetId) {
    throw new Error('template spreadsheet id is empty.');
  }
  if (!isKnownDistributionTemplateMasterSpreadsheetId_(targetSpreadsheetId)) {
    throw new Error('template spreadsheet id is not allowed.');
  }
  const ss = SpreadsheetApp.openById(targetSpreadsheetId);
  ensureDistributionTemplateMasterSetup_(ss);
  resetSpreadsheetForDistributionTemplate_(ss);
  trySyncDistributionTemplateMasterName_(ss);
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    name: ss.getName(),
    url: ss.getUrl(),
  };
}

function buildWebAppUrlFromDeploymentId_(deploymentId) {
  const normalizedDeploymentId = String(deploymentId || '').trim();
  if (!normalizedDeploymentId) return '';
  return `https://script.google.com/macros/s/${normalizedDeploymentId}/exec`;
}

function inferDeploymentIdFromWebAppUrl_(url) {
  const text = String(url || '').trim();
  const match = text.match(/\/macros\/s\/([^/]+)\/exec/i);
  return match ? String(match[1] || '').trim() : '';
}

function buildWebAppUrlFromBase_(baseUrl, params) {
  const normalizedApiUrl = normalizeWebAppUrl_(String(baseUrl || '').trim());
  if (!normalizedApiUrl) return '';
  const rawPage = String(params && (params.page || params.p) || '').trim().toLowerCase();
  if (rawPage === 'student' || rawPage === 's') {
    return buildPortableStudentRelayUrl_(normalizedApiUrl);
  }
  return buildPortableTeacherRelayUrl_(normalizedApiUrl);
}

function buildScriptEditorUrl_(scriptId) {
  const normalizedScriptId = String(scriptId || '').trim();
  if (!normalizedScriptId) return '';
  return `https://script.google.com/home/projects/${normalizedScriptId}/edit`;
}

function normalizeWebAppUrl_(url) {
  const text = String(url || '').trim();
  if (!text) return '';
  const deploymentIdOnly = normalizeDeploymentId_(text);
  if (deploymentIdOnly) {
    return buildWebAppUrlFromDeploymentId_(deploymentIdOnly);
  }
  const match = text.match(/https:\/\/script\.google\.com(?:\/u\/\d+)?\/macros\/s\/([^/?#]+)\/exec(?:[?#].*)?/i);
  return match && match[1]
    ? buildWebAppUrlFromDeploymentId_(match[1])
    : '';
}

function normalizeDeploymentId_(value) {
  const text = String(value || '').trim();
  const match = text.match(/\bAKf[\w-]{20,}\b/i);
  return match ? String(match[0] || '').trim() : '';
}

function resolveSetupWebAppBaseUrl_(config, options) {
  const opts = options || {};
  const currentWebAppUrl = normalizeWebAppUrl_(opts.currentWebAppUrl || getCurrentWebAppBaseUrl_());
  const confirmedWebAppUrl = normalizeWebAppUrl_(opts.confirmedWebAppUrl || String(config && config.lastWebAppUrl || '').trim());
  const deploymentId = String(
    opts.deploymentId ||
    getScriptProperties_().getProperty('DEPLOYMENT_ID') ||
    inferDeploymentIdFromWebAppUrl_(confirmedWebAppUrl) ||
    inferDeploymentIdFromWebAppUrl_(currentWebAppUrl) ||
    fetchDeploymentIdFromAdmin_(config && config.registrationId) ||
    ''
  ).trim();
  if (currentWebAppUrl) return currentWebAppUrl;
  if (confirmedWebAppUrl) return confirmedWebAppUrl;
  return deploymentId ? buildWebAppUrlFromDeploymentId_(deploymentId) : '';
}

function resolveVerifiedSetupWebAppUrl_(config, options) {
  const opts = options || {};
  const currentWebAppUrl = normalizeWebAppUrl_(opts.currentWebAppUrl || getCurrentWebAppBaseUrl_());
  const confirmedWebAppUrl = normalizeWebAppUrl_(opts.confirmedWebAppUrl || String(config && config.lastWebAppUrl || '').trim());
  if (currentWebAppUrl) return currentWebAppUrl;
  if (confirmedWebAppUrl) return confirmedWebAppUrl;
  return '';
}

function resolveSetupDeploymentId_(config, options) {
  const opts = options || {};
  const currentWebAppUrl = normalizeWebAppUrl_(opts.currentWebAppUrl || getCurrentWebAppBaseUrl_());
  const confirmedWebAppUrl = normalizeWebAppUrl_(opts.confirmedWebAppUrl || String(config && config.lastWebAppUrl || '').trim());
  return String(
    opts.deploymentId ||
    inferDeploymentIdFromWebAppUrl_(confirmedWebAppUrl) ||
    inferDeploymentIdFromWebAppUrl_(currentWebAppUrl) ||
    fetchDeploymentIdFromAdmin_(config && config.registrationId) ||
    getScriptProperties_().getProperty('DEPLOYMENT_ID') ||
    ''
  ).trim();
}

function createScriptDeployment_(scriptId, versionNumber, description) {
  if (!versionNumber) throw new Error('versionNumber を取得できませんでした。');
  return callAppsScriptApi_(
    `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments`,
    'post',
    {
      deploymentConfig: {
        scriptId: String(scriptId || '').trim(),
        versionNumber: Number(versionNumber || 0),
        manifestFileName: 'appsscript',
        description: String(description || '').trim(),
      },
    }
  );
}

function ensureTeacherWebAppDeployment_(options) {
  const opts = options || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = loadTemplateSetupConfig_(ss);
  const verifiedUrl = resolveVerifiedSetupWebAppUrl_(config);
  if (verifiedUrl) {
    return {
      ok: true,
      deploymentId: inferDeploymentIdFromWebAppUrl_(verifiedUrl),
      webAppUrl: verifiedUrl,
      mode: 'existing',
    };
  }
  const scriptId = String(ScriptApp.getScriptId() || '').trim();
  if (!scriptId) {
    return { ok: false, error: 'scriptId を取得できませんでした。' };
  }
  const deploymentId = resolveSetupDeploymentId_(config);
  try {
    const version = createScriptProjectVersion_(
      scriptId,
      `teacher-setup-auto-deploy ${Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')}`
    );
    let deployedId = deploymentId;
    if (deploymentId) {
      updateScriptDeploymentVersion_(scriptId, deploymentId, version.versionNumber, 'teacher setup auto deploy');
    } else {
      const created = createScriptDeployment_(scriptId, version.versionNumber, 'teacher setup auto deploy');
      deployedId = String(created.deploymentId || '').trim();
    }
    const webAppUrl = buildWebAppUrlFromDeploymentId_(deployedId);
    if (!deployedId || !webAppUrl) {
      return { ok: false, error: 'deploymentId を取得できませんでした。' };
    }
    saveTemplateSetupConfig_({
      ...config,
      lastWebAppUrl: webAppUrl,
    }, ss);
    getScriptProperties_().setProperty('DEPLOYMENT_ID', deployedId);
    try {
      const registrationId = String(config.registrationId || '').trim();
      if (registrationId) {
        UrlFetchApp.fetch(ADMIN_WEBAPP_URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            action: 'markDeployed',
            registrationId,
            deploymentId: deployedId,
          }),
          muteHttpExceptions: true,
        });
      }
    } catch (_err) {}
    return {
      ok: true,
      deploymentId: deployedId,
      webAppUrl,
      mode: deploymentId ? 'updated' : 'created',
    };
  } catch (err) {
    return {
      ok: false,
      error: normalizeSetupDeployError_(err),
    };
  }
}

function normalizeSetupDeployError_(err) {
  const rawMessage = String(err && err.message ? err.message : err || '').trim();
  const status = Number(err && err.apiStatus || 0);
  const apiMessage = String(err && err.apiMessage ? err.apiMessage : '').trim();
  const combined = `${rawMessage} ${apiMessage}`.trim();
  if (/Access Not Configured|API has not been used|disabled/i.test(combined)) {
    return 'Apps Script API が未有効です。手動デプロイに切り替えてください。';
  }
  if (status === 401 || /invalid authentication credentials/i.test(combined)) {
    return '認証が不足しています。あとで更新認可画面が出たら許可してください。';
  }
  if (status === 403 && /insufficient authentication scopes/i.test(combined)) {
    return '自動デプロイ権限が不足しています。手動デプロイに切り替えてください。';
  }
  if (status === 403 && /permission denied|does not have permission/i.test(combined)) {
    return 'このコピー先を操作する権限が不足しています。コピー先の所有者アカウントで実行してください。';
  }
  if (status === 404 && /projects\//i.test(combined)) {
    return 'scriptId が見つかりませんでした。手動デプロイに切り替えてください。';
  }
  if (/Service invoked too many times|Rate Limit Exceeded/i.test(combined)) {
    return 'Google 側が混み合っています。少し待ってからもう一度試してください。';
  }
  return rawMessage || '自動デプロイに失敗しました。';
}

function checkTeacherUpdateAuthorization_(options) {
  const opts = options || {};
  try {
    const versionControl = getTeacherVersionControlInfo_();
    if (!versionControl.ok) {
      if (!opts.silent) {
        SpreadsheetApp.getUi().alert(`更新機能の確認に失敗しました。\n${versionControl.error || 'unknown_error'}`);
      }
      return {
        ok: false,
        error: versionControl.error || 'unknown_error',
      };
    }
    if (!opts.silent) {
      SpreadsheetApp.getUi().alert('更新機能を有効化しました。以後は先生画面の「設定 → 更新」から、更新確認や版戻しを実行できます。');
    }
    return {
      ok: true,
      currentVersionNumber: Number(versionControl.currentVersionNumber || 0),
      previousVersionNumber: Number(versionControl.previousVersionNumber || 0),
    };
  } catch (err) {
    const message = String(err && err.message ? err.message : err || 'unknown_error');
    if (!opts.silent) {
      SpreadsheetApp.getUi().alert(`更新機能の認可でエラーが出ました。\n${message}`);
    }
    return {
      ok: false,
      error: message,
    };
  }
}

function buildScriptEditorUrlCandidates_(scriptId) {
  const normalizedScriptId = String(scriptId || '').trim();
  if (!normalizedScriptId) return [];
  return [
    {
      label: 'Apps Script を開く（おすすめ）',
      note: 'いちばん開ける可能性が高いリンクです。まずはこれを試します。',
      url: `https://script.google.com/d/${normalizedScriptId}/edit`,
    },
    {
      label: 'Apps Script を開く（通常）',
      note: 'おすすめリンクでだめなときの通常URLです。',
      url: `https://script.google.com/home/projects/${normalizedScriptId}/edit`,
    },
    {
      label: 'Apps Script を開く（u/0）',
      note: '1番目のGoogleアカウントで開きたいときの予備です。',
      url: `https://script.google.com/u/0/home/projects/${normalizedScriptId}/edit`,
    },
  ];
}

function showWebAppDeploySidebar() {
  showWebAppDeploySidebar_();
}

function showWebAppDeploySidebar_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptId = String(ScriptApp.getScriptId() || '').trim();
  const spreadsheetUrl = String(ss.getUrl() || '').trim();
  const candidates = buildScriptEditorUrlCandidates_(scriptId);
  const linksHtml = candidates.map(item => {
    const safeUrl = String(item.url || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const safeLabel = String(item.label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeNote = String(item.note || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `
      <a class="btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>
      <div class="note">${safeNote}</div>
    `;
  }).join('');
  const safeSpreadsheetUrl = spreadsheetUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: sans-serif; padding: 16px; color: #243238; line-height: 1.6; }
        h2 { margin: 0 0 10px; font-size: 18px; }
        p { margin: 0 0 10px; font-size: 13px; }
        .btn {
          display: block;
          width: 100%;
          box-sizing: border-box;
          margin: 12px 0 6px;
          padding: 12px 14px;
          border-radius: 8px;
          background: #0e7c66;
          color: #fff !important;
          text-decoration: none;
          text-align: center;
          font-weight: 700;
        }
        .btn.alt { background: #1a73e8; }
        .note { font-size: 12px; color: #5f6b72; margin: 0 0 8px; }
        .box {
          margin-top: 14px;
          padding: 12px;
          background: #f7faf9;
          border: 1px solid #d8e8e2;
          border-radius: 8px;
        }
        ol { margin: 8px 0 0 18px; padding: 0; font-size: 13px; }
        li { margin-bottom: 6px; }
        .subtle { color: #66757f; font-size: 12px; word-break: break-all; }
      </style>
    </head>
    <body>
      <h2>Webアプリ化ガイド</h2>
      <p>まずは通常リンクを試してください。開けないときだけ予備リンクを押します。</p>
      ${linksHtml}
      <div class="box">
        <strong>どれも開けないとき</strong>
        <ol>
          <li>下のボタンでこのスプレッドシートを開きます。</li>
          <li>上のメニューの「拡張機能」→「Apps Script」を押します。</li>
          <li>Apps Script 画面で「デプロイ」→「新しいデプロイ」→「ウェブアプリ」で進めます。</li>
        </ol>
        <a class="btn alt" href="${safeSpreadsheetUrl}" target="_blank" rel="noopener noreferrer">このスプレッドシートを開く</a>
      </div>
      <p class="subtle">scriptId: ${scriptId ? scriptId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '(取得できませんでした)'}</p>
    </body>
    </html>
  `).setTitle('Webアプリ化ガイド');
  SpreadsheetApp.getUi().showSidebar(html);
}

function showWebAppUrlCaptureSidebar() {
  const config = loadTemplateSetupConfig_(SpreadsheetApp.getActiveSpreadsheet());
  const currentUrl = resolveVerifiedSetupWebAppUrl_(config) || resolveSetupWebAppBaseUrl_(config);
  const safeCurrentUrl = currentUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: sans-serif; padding: 16px; color: #243238; line-height: 1.6; }
        h2 { margin: 0 0 10px; font-size: 18px; }
        p { margin: 0 0 10px; font-size: 13px; }
        textarea {
          width: 100%;
          min-height: 110px;
          box-sizing: border-box;
          padding: 10px;
          border: 1px solid #c7d4da;
          border-radius: 8px;
          font-size: 12px;
          resize: vertical;
        }
        button {
          width: 100%;
          margin-top: 12px;
          padding: 12px 14px;
          border: 0;
          border-radius: 8px;
          background: #0e7c66;
          color: white;
          font-weight: 700;
          cursor: pointer;
        }
        .note { font-size: 12px; color: #5f6b72; }
        .current { margin-top: 12px; font-size: 12px; color: #66757f; word-break: break-all; }
      </style>
    </head>
    <body>
      <h2>デプロイURL反映と更新認可</h2>
      <p>Webアプリ化の最後に表示された URL をそのまま貼り付けてください。deploymentId だけでも受け付けます。空欄のままなら自動反映を試します。</p>
      <textarea id="webapp-url" placeholder="https://script.google.com/macros/s/.../exec または AKfy..."></textarea>
      <button onclick="saveUrl()">URLを反映して更新機能を有効化する</button>
      <p class="note">保存後、このシートの先生ページ・児童ページリンクが使えるようになり、更新機能の認可確認まで続けて行います。</p>
      <p class="current">現在の保存URL: ${safeCurrentUrl || '未保存'}</p>
      <script>
        function saveUrl() {
          const value = document.getElementById('webapp-url').value || '';
          google.script.run
            .withSuccessHandler(function(result) {
              if (!result || !result.ok) {
                alert((result && result.error) || '保存に失敗しました。');
                return;
              }
              var message = 'URLを反映しました。';
              if (result.updateAuth && result.updateAuth.ok) {
                message += '\\n更新機能の認可も確認できました。';
              } else if (result.updateAuth && result.updateAuth.error) {
                message += '\\n更新機能の認可は未完了です。\\n' + result.updateAuth.error;
              }
              message += '\\n先生ページのURLが使える状態になりました。';
              alert(message);
              google.script.host.close();
            })
            .withFailureHandler(function(err) {
              alert(err && err.message ? err.message : '保存に失敗しました。');
            })
            .saveConfirmedWebAppUrl(value);
        }
      </script>
    </body>
    </html>
  `).setTitle('デプロイURL反映と更新認可');
  SpreadsheetApp.getUi().showSidebar(html);
}

function saveConfirmedWebAppUrl(url) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = loadTemplateSetupConfig_(ss);
  const normalizedUrl = normalizeWebAppUrl_(url) || resolveSetupWebAppBaseUrl_(config);
  if (!normalizedUrl) {
    return { ok: false, error: 'WebアプリURLの形式が正しくありません。https://script.google.com/macros/s/.../exec または deploymentId を貼り付けてください。' };
  }
  const deploymentId = inferDeploymentIdFromWebAppUrl_(normalizedUrl);
  saveTemplateSetupConfig_({
    ...config,
    lastWebAppUrl: normalizedUrl,
  }, ss);
  if (deploymentId) {
    getScriptProperties_().setProperty('DEPLOYMENT_ID', deploymentId);
  }
  try {
    const registrationId = String(config.registrationId || '').trim();
    if (registrationId && deploymentId) {
      UrlFetchApp.fetch(ADMIN_WEBAPP_URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          action: 'markDeployed',
          registrationId,
          deploymentId,
        }),
        muteHttpExceptions: true,
      });
    }
  } catch (_err) {}
  cleanupGuideSheets_(ss);
  const updateAuth = checkTeacherUpdateAuthorization_({ silent: true });
  return {
    ok: true,
    webAppUrl: normalizedUrl,
    deploymentId,
    teacherUrl: buildWebAppUrlFromBase_(normalizedUrl, { page: 'teacher' }),
    studentUrl: buildWebAppUrlFromBase_(normalizedUrl, { page: 'student' }),
    updateAuth,
  };
}

function enableTeacherUpdateAuthorization() {
  const authInfo = getTeacherUpdateAuthorizationInfo_();
  if (authInfo.required && authInfo.authorizationUrl) {
    showTeacherUpdateAuthorizationDialog_(authInfo);
    return {
      ok: false,
      authorizationRequired: true,
      authorizationUrl: authInfo.authorizationUrl,
    };
  }
  return checkTeacherUpdateAuthorization_();
}

function confirmTeacherUpdateAuthorization() {
  const authInfo = getTeacherUpdateAuthorizationInfo_();
  if (authInfo.required) {
    return {
      ok: false,
      authorizationRequired: true,
      authorizationUrl: authInfo.authorizationUrl,
      error: '認可がまだ完了していません。認可後にもう一度確認してください。',
    };
  }
  return checkTeacherUpdateAuthorization_({ silent: true });
}

function getTeacherUpdateAuthorizationInfo_() {
  try {
    const authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    const status = authInfo && typeof authInfo.getAuthorizationStatus === 'function'
      ? authInfo.getAuthorizationStatus()
      : null;
    const authorizationUrl = authInfo && typeof authInfo.getAuthorizationUrl === 'function'
      ? String(authInfo.getAuthorizationUrl() || '').trim()
      : '';
    return {
      ok: true,
      required: status === ScriptApp.AuthorizationStatus.REQUIRED,
      status: String(status || ''),
      authorizationUrl,
    };
  } catch (err) {
    return {
      ok: false,
      required: false,
      status: '',
      authorizationUrl: '',
      error: String(err && err.message ? err.message : err || 'authorization_info_failed'),
    };
  }
}

function showTeacherUpdateAuthorizationDialog_(authInfo) {
  const url = String(authInfo && authInfo.authorizationUrl || '').trim();
  const safeUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body{font-family:sans-serif;margin:0;padding:18px;color:#243238;background:#f7f4ee;}
        h2{margin:0 0 10px;font-size:18px;}
        p{margin:0 0 10px;font-size:13px;line-height:1.8;color:#54646d;}
        .btn{display:flex;justify-content:center;align-items:center;width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;text-decoration:none;font-weight:bold;border:none;cursor:pointer;font-size:13px;}
        .primary{background:#1f6feb;color:#fff !important;}
        .secondary{background:#eef4ff;color:#234a84;margin-top:10px;}
        .note{margin-top:12px;font-size:11px;color:#66757f;}
        #busy{display:none;margin-top:10px;font-size:12px;color:#234a84;}
      </style>
    </head>
    <body>
      <h2>更新機能の認可</h2>
      <p>この個体で更新機能を使うには、最初に Google の認可を1回だけ通します。</p>
      <p>1. 下のボタンで認可画面を開く</p>
      <p>2. 許可したら、この画面に戻って確認する</p>
      <a class="btn primary" href="${safeUrl}" target="_blank" rel="noopener noreferrer">1. 認可画面を開く</a>
      <button class="btn secondary" onclick="confirmAuth()">2. 認可後に確認する</button>
      <div id="busy">確認中です...</div>
      <div class="note">最新版のまま使うだけなら今すぐ認可しなくても大丈夫です。更新や版戻しを使うときに必要です。</div>
      <script>
        function confirmAuth() {
          const busy = document.getElementById('busy');
          if (busy) busy.style.display = 'block';
          google.script.run
            .withSuccessHandler(function(result) {
              if (busy) busy.style.display = 'none';
              if (!result || !result.ok) {
                alert((result && (result.error || result.message)) || '認可確認に失敗しました。');
                return;
              }
              alert('更新機能の認可が完了しました。');
              google.script.host.close();
            })
            .withFailureHandler(function(err) {
              if (busy) busy.style.display = 'none';
              alert((err && err.message) || err || '認可確認に失敗しました。');
            })
            .confirmTeacherUpdateAuthorization();
        }
      </script>
    </body>
    </html>
  `).setWidth(420).setHeight(280);
  SpreadsheetApp.getUi().showModelessDialog(html, '更新機能の認可');
}

function showSetupRunnerSidebar() {
  showSetupRunnerSidebar_({});
}

function showSetupRunnerSidebar_(options) {
  const opts = options || {};
  const state = getSetupRunnerState_(opts);
  const title = opts.auto ? '導入案内' : '導入パネル';
  const statusRows = [
    {
      label: '登録',
      done: state.setupCompleted,
      text: state.setupCompleted
        ? `${state.teacherName || '先生'} / ${state.schoolName || '学校名未入力'}`
        : '最初の登録を進めます。',
    },
    {
      label: 'Webアプリ',
      done: !state.deployPending,
      text: state.deployPending ? 'まだ未反映です。URL反映まで進めます。' : 'URL反映まで完了しています。',
    },
    {
      label: '更新機能',
      done: state.updateAuthReady,
      text: state.updateAuthReady ? '認可ずみです。' : state.updateAuthReason,
    },
  ];
  const statusHtml = statusRows.map(row => `
    <div class="status-row">
      <div class="status-badge ${row.done ? 'done' : 'pending'}">${row.done ? '完了' : '未完了'}</div>
      <div class="status-body">
        <div class="status-label">${escapeHtmlForWebApp_(row.label)}</div>
        <div class="status-text">${escapeHtmlForWebApp_(row.text)}</div>
      </div>
    </div>
  `).join('');
  const teacherLinkHtml = state.teacherUrl
    ? `<a class="link-btn" href="${escapeHtmlForWebApp_(state.teacherUrl)}" target="_blank" rel="noopener noreferrer">先生ページを開く</a>`
    : '';
  const studentLinkHtml = state.studentUrl
    ? `<a class="link-btn ghost" href="${escapeHtmlForWebApp_(state.studentUrl)}" target="_blank" rel="noopener noreferrer">児童ページを開く</a>`
    : '';
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body{font-family:sans-serif;margin:0;padding:16px;color:#243238;background:#f7f4ee;}
        .hero{padding:14px 14px 12px;border-radius:14px;background:linear-gradient(135deg,#fff8ef,#f0f7ff);border:1px solid #e6d8bf;}
        .hero h2{margin:0 0 8px;font-size:18px;}
        .hero p{margin:0;font-size:12px;line-height:1.7;color:#54646d;}
        .panel{margin-top:14px;padding:14px;border-radius:14px;background:#fff;border:1px solid #e7e0d4;}
        .panel h3{margin:0 0 10px;font-size:14px;}
        .mini{margin:0 0 10px;font-size:11px;color:#66757f;line-height:1.7;}
        .status-row{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid #edf1f3;}
        .status-row:first-child{border-top:none;padding-top:0;}
        .status-badge{min-width:48px;text-align:center;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:bold;}
        .status-badge.done{background:#e8f6ef;color:#166534;}
        .status-badge.pending{background:#fff4e5;color:#9a5a00;}
        .status-label{font-size:12px;font-weight:bold;color:#243238;}
        .status-text{font-size:12px;line-height:1.6;color:#5f6b72;margin-top:2px;}
        .actions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;}
        button,.link-btn{display:flex;justify-content:center;align-items:center;width:100%;padding:11px 12px;border:none;border-radius:10px;font-size:13px;font-weight:bold;cursor:pointer;text-decoration:none;box-sizing:border-box;}
        .primary{background:#1f6feb;color:#fff;}
        .secondary{background:#eef4ff;color:#234a84;}
        .ghost{background:#f3f5f6;color:#42545c;}
        .link-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;}
        .note{margin-top:10px;font-size:11px;line-height:1.7;color:#5f6b72;}
        #busy{display:none;margin-top:10px;font-size:12px;color:#234a84;}
      </style>
    </head>
    <body>
      <div class="hero">
        <h2>導入パネル</h2>
        <p>日常運用では先生ページが主入口です。ここでは登録、Webアプリ化、更新認可だけを必要なときに進めます。</p>
      </div>
      <div class="panel">
        <h3>進行状況</h3>
        ${statusHtml}
      </div>
      <div class="panel">
        <h3>やること</h3>
        <p class="mini">基本は 1 を押せば進みます。2 〜 4 は、自動で進まなかったところだけ使う補助ボタンです。</p>
        <div class="actions">
          <button class="primary" onclick="runServer('startTeacherSetup')">1. 先生情報を登録して導入を進める</button>
          <button class="secondary" onclick="runServer('showSetupGuideDialog')">2. 詳しいガイドを開く</button>
          <button class="secondary" onclick="runServer('showWebAppUrlCaptureSidebar')">3. デプロイURL反映と更新認可</button>
          <button class="secondary" onclick="runServer('enableTeacherUpdateAuthorization')">4. 更新認可だけやり直す</button>
          <button class="ghost" onclick="runServer('showSetupRunnerSidebar')">進行状況を更新</button>
        </div>
        <div class="link-row">
          ${teacherLinkHtml || '<span></span>'}
          ${studentLinkHtml || '<span></span>'}
        </div>
        <div id="busy">処理中です。ダイアログや認可画面が出たら許可してください。</div>
        <div class="note">コピー直後や開き直した直後は、メニューやボタンが押せるようになるまで数秒かかることがあります。反応しないときは少し待ってから押してください。サイドバーは狭いので、画像や動画つきの説明は「詳しいガイド」を押すと大きい画面で開きます。</div>
      </div>
      <script>
        function runServer(fn){
          const busy=document.getElementById('busy');
          if(busy) busy.style.display='block';
          const runner=google.script.run
            .withSuccessHandler(function(){ if(busy) busy.style.display='none'; })
            .withFailureHandler(function(err){
              if(busy) busy.style.display='none';
              alert((err && err.message) || err || 'error');
            });
          runner[fn]();
        }
      </script>
    </body>
    </html>
  `).setTitle(title);
  SpreadsheetApp.getUi().showSidebar(html);
}

function showSetupGuideDialog() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body{font-family:sans-serif;margin:0;padding:24px;color:#243238;background:#f7f4ee;}
        h1{margin:0 0 14px;font-size:24px;}
        .lead{margin:0 0 18px;color:#5f6b72;line-height:1.8;}
        .grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;}
        .card{background:#fff;border:1px solid #e6ddd0;border-radius:16px;padding:18px;}
        .card h2{margin:0 0 10px;font-size:17px;}
        .steps{margin:0;padding-left:20px;line-height:1.9;font-size:14px;}
        .media{display:flex;flex-direction:column;gap:12px;}
        .media-box{min-height:150px;border-radius:14px;border:1px dashed #c8d1d8;background:linear-gradient(135deg,#fffdf9,#eef4ff);padding:14px;}
        .media-box h3{margin:0 0 8px;font-size:14px;}
        .media-box p{margin:0;font-size:12px;line-height:1.7;color:#5f6b72;}
        .tip{margin-top:12px;padding:12px;border-radius:12px;background:#fff8e8;border:1px solid #ecd7a8;font-size:12px;line-height:1.7;}
      </style>
    </head>
    <body>
      <h1>導入ガイド</h1>
      <p class="lead">この画面は大きく表示されるので、画像や動画を載せる場所として使えます。今は手順を整理し、あとから実際の動画URLや画像を差し替えやすい構成にしてあります。</p>
      <div class="grid">
        <div class="card">
          <h2>進め方</h2>
          <ol class="steps">
            <li>スプレッドシートで「導入・配布 → 導入パネルを開く」を押します。</li>
            <li>「先生情報を登録して導入を進める」で登録を完了します。</li>
            <li>「詳しいガイド」または Apps Script 画面から Webアプリ化します。</li>
            <li>表示された URL または deploymentId を「デプロイURL反映と更新認可」で保存します。</li>
            <li>その場で更新機能の認可確認まで進みます。失敗したときだけ認可をやり直します。</li>
          </ol>
          <div class="tip">ここに後から、実際の操作動画やスクリーンショットを差し込めます。サイドバーは進行管理、モーダルは詳しい説明用、という分担です。</div>
        </div>
        <div class="media">
          <div class="media-box">
            <h3>動画エリア</h3>
            <p>YouTube や公開動画URLを埋め込む場所です。1分程度の「最初の登録手順」動画を置く想定です。</p>
          </div>
          <div class="media-box">
            <h3>画像エリア</h3>
            <p>デプロイ画面や URL 反映画面のスクリーンショットを並べる場所です。誤設定しやすい項目だけ強調して見せられます。</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `).setWidth(980).setHeight(760);
  SpreadsheetApp.getUi().showModelessDialog(html, '導入ガイド');
}

function getCurrentWebAppBaseUrl_() {
  try {
    return String(ScriptApp.getService().getUrl() || '').trim();
  } catch (_err) {
    return '';
  }
}

function isTemplateSetupCompleted_(config, ss) {
  if (String(config.setupCompletedAt || '').trim()) return true;
  const savedSpreadsheetId = String(config.spreadsheetId || '').trim();
  if (savedSpreadsheetId && savedSpreadsheetId === String((ss || SpreadsheetApp.getActiveSpreadsheet()).getId() || '').trim()) {
    return true;
  }
  return false;
}

function isDistributionTemplateMasterSheet_(config, ss) {
  const masterSpreadsheetId = String(config.templateMasterSpreadsheetId || '').trim();
  const currentSpreadsheetId = String((ss || SpreadsheetApp.getActiveSpreadsheet()).getId() || '').trim();
  if (!currentSpreadsheetId) return false;
  if (masterSpreadsheetId && masterSpreadsheetId === currentSpreadsheetId) return true;
  return isKnownDistributionTemplateMasterSpreadsheetId_(currentSpreadsheetId);
}

function isKnownDistributionTemplateMasterSpreadsheetId_(spreadsheetId) {
  const currentSpreadsheetId = String(spreadsheetId || '').trim();
  const knownSpreadsheetId = String(DISTRIBUTION_TEMPLATE_MASTER_SPREADSHEET_ID || '').trim();
  return Boolean(currentSpreadsheetId && knownSpreadsheetId && currentSpreadsheetId === knownSpreadsheetId);
}

function deleteGeneratedLessonSheets_(ss) {
  ss.getSheets()
    .filter(sheet => /^授業_\d+_\d+$/.test(sheet.getName()))
    .forEach(sheet => ss.deleteSheet(sheet));
}

function showTemplateCreatedDialog_(url) {
  const safeUrl = String(url || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <body style="font-family:sans-serif;padding:16px;line-height:1.7;">
      <p style="margin:0 0 12px;font-size:14px;">配布用テンプレートを作成しました。</p>
      <p style="margin:0 0 12px;font-size:14px;">次にこのテンプレートを開いて、共有設定を「リンクを知っている全員が閲覧者」にしてください。</p>
      <p style="margin:0 0 12px;"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">テンプレートを開く</a></p>
      <p style="margin:0;color:#666;font-size:12px;word-break:break-all;">${safeUrl}</p>
    </body>
    </html>
  `).setWidth(520).setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, 'テンプレートを作成しました');
}

function loadTemplateSetupConfig_(ss) {
  const sheet = getTemplateSetupSheet_(ss);
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();
  const map = {};
  values.forEach(row => {
    const key = String(row[0] || '').trim();
    if (key) map[key] = String(row[1] || '');
  });
  return {
    registrationId: String(map.registrationId || '').trim(),
    teacherName: String(map.teacherName || '').trim(),
    teacherEmail: String(map.teacherEmail || '').trim(),
    schoolName: String(map.schoolName || '').trim(),
    grade: String(map.grade || '').trim(),
    className: String(map.className || '').trim(),
    spreadsheetId: String(map.spreadsheetId || '').trim(),
    setupCompletedAt: String(map.setupCompletedAt || '').trim(),
    lastWebAppUrl: String(map.lastWebAppUrl || '').trim(),
    templateMasterSpreadsheetId: String(map.templateMasterSpreadsheetId || '').trim(),
  };
}

function saveTemplateSetupConfig_(config, ss) {
  const sheet = getTemplateSetupSheet_(ss);
  const rows = [
    ['registrationId', String(config.registrationId || '').trim()],
    ['teacherName', String(config.teacherName || '').trim()],
    ['teacherEmail', String(config.teacherEmail || '').trim()],
    ['schoolName', String(config.schoolName || '').trim()],
    ['grade', String(config.grade || '').trim()],
    ['className', String(config.className || '').trim()],
    ['spreadsheetId', String(config.spreadsheetId || '').trim()],
    ['setupCompletedAt', String(config.setupCompletedAt || '').trim()],
    ['lastWebAppUrl', String(config.lastWebAppUrl || '').trim()],
    ['templateMasterSpreadsheetId', String(config.templateMasterSpreadsheetId || '').trim()],
  ];
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
}

function syncCurrentDeploymentState_(ss, options) {
  const targetSpreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  const opts = options || {};
  const config = loadTemplateSetupConfig_(targetSpreadsheet);
  const currentWebAppUrl = resolveVerifiedSetupWebAppUrl_(config, {
    currentWebAppUrl: getCurrentWebAppBaseUrl_(),
  });
  if (!currentWebAppUrl) {
    return { ok: false, reason: 'no_webapp_url' };
  }
  const deploymentId = inferDeploymentIdFromWebAppUrl_(currentWebAppUrl);
  let changed = false;
  if (String(config.lastWebAppUrl || '').trim() !== currentWebAppUrl) {
    saveTemplateSetupConfig_({
      ...config,
      lastWebAppUrl: currentWebAppUrl,
    }, targetSpreadsheet);
    changed = true;
  }
  if (deploymentId) {
    const props = getScriptProperties_();
    if (String(props.getProperty('DEPLOYMENT_ID') || '').trim() !== deploymentId) {
      props.setProperty('DEPLOYMENT_ID', deploymentId);
      changed = true;
    }
  }
  if (opts.markAdmin !== false) {
    const registrationId = String(config.registrationId || '').trim();
    if (registrationId && deploymentId) {
      try {
        UrlFetchApp.fetch(ADMIN_WEBAPP_URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            action: 'markDeployed',
            registrationId,
            deploymentId,
          }),
          muteHttpExceptions: true,
        });
      } catch (_err) {}
    }
  }
  return {
    ok: true,
    changed,
    webAppUrl: currentWebAppUrl,
    deploymentId,
  };
}

function tryMarkCurrentSheetDeployed_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = syncCurrentDeploymentState_(ss, { markAdmin: true });
  if (result && result.changed) {
    cleanupGuideSheets_(ss);
  }
}

function fetchDeploymentIdFromAdmin_(registrationId) {
  const normalizedRegistrationId = String(registrationId || '').trim();
  if (!normalizedRegistrationId) return '';
  try {
    const response = UrlFetchApp.fetch(ADMIN_WEBAPP_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        action: 'exportRegistration',
        registrationId: normalizedRegistrationId,
      }),
      muteHttpExceptions: true,
    });
    const json = JSON.parse(String(response.getContentText() || '{}'));
    if (!json || !json.ok || !json.registration) return '';
    return String(json.registration.deploymentId || '').trim();
  } catch (_err) {
    return '';
  }
}

function getTemplateSetupSheet_(ss) {
  const targetSpreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = targetSpreadsheet.getSheetByName(TEMPLATE_CFG_SHEET);
  if (!sheet) {
    sheet = targetSpreadsheet.insertSheet(TEMPLATE_CFG_SHEET);
    sheet.hideSheet();
  }
  return sheet;
}

// ============================================================
//  設定読み書き
// ============================================================
function readGlobalConfig() {
  const s    = getTenantSpreadsheet_().getSheetByName(SHEET_CFG);
  if (!s) return {};
  const data = s.getDataRange().getValues();
  const cfg  = {};
  data.slice(1).forEach(r => { if (r[0]) cfg[r[0]] = r[1]; });
  return cfg;
}

function getGlobalConfigWithDefaults_(remoteConfig) {
  const cfg = readGlobalConfig();
  const remote = remoteConfig && typeof remoteConfig === 'object' ? remoteConfig : {};
  const remotePrompts = remote.aiPrompts && typeof remote.aiPrompts === 'object'
    ? remote.aiPrompts
    : {};
  return {
    ...remotePrompts,
    ...cfg,
    medal_top: cfg.medal_top || '5',
    prompt_comment: cfg.prompt_comment || remotePrompts.prompt_comment || DEFAULT_PROMPT_COMMENT,
    prompt_score: cfg.prompt_score || remotePrompts.prompt_score || DEFAULT_PROMPT_SCORE,
    prompt_portfolio: cfg.prompt_portfolio || remotePrompts.prompt_portfolio || DEFAULT_PROMPT_PORTFOLIO,
    prompt_unit_summary: cfg.prompt_unit_summary || remotePrompts.prompt_unit_summary || DEFAULT_PROMPT_UNIT_SUMMARY,
    prompt_assessment: cfg.prompt_assessment || remotePrompts.prompt_assessment || DEFAULT_PROMPT_ASSESSMENT,
  };
}

function writeGlobalConfig(key, value) {
  const s    = getTenantSpreadsheet_().getSheetByName(SHEET_CFG);
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      s.getRange(i+1,2).setValue(value);
      syncGlobalConfigEntryToMaster_(key, value, { updatedBy: 'config_writeGlobalConfig' });
      return;
    }
  }
  s.appendRow([key, value, '']);
  syncGlobalConfigEntryToMaster_(key, value, { updatedBy: 'config_writeGlobalConfig' });
}

function writeGlobalConfigBatch(valuesByKey) {
  const updates = valuesByKey && typeof valuesByKey === 'object' ? valuesByKey : null;
  if (!updates) return;
  const keys = Object.keys(updates).filter(key => String(key || '').trim());
  if (!keys.length) return;
  const s = getTenantSpreadsheet_().getSheetByName(SHEET_CFG);
  const data = s.getDataRange().getValues();
  const rows = data.length ? data : [['キー', '値', '説明']];
  const indexByKey = {};
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '').trim();
    if (key) indexByKey[key] = i;
    if (rows[i].length < 3) rows[i] = [rows[i][0] || '', rows[i][1] || '', rows[i][2] || ''];
  }
  keys.forEach(key => {
    const normalizedKey = String(key || '').trim();
    const value = updates[key];
    if (Object.prototype.hasOwnProperty.call(indexByKey, normalizedKey)) {
      rows[indexByKey[normalizedKey]][1] = value;
      return;
    }
    rows.push([normalizedKey, value, '']);
  });
  s.getRange(1, 1, rows.length, 3).setValues(rows.map(row => [
    row[0] === undefined ? '' : row[0],
    row[1] === undefined ? '' : row[1],
    row[2] === undefined ? '' : row[2],
  ]));
  syncGlobalConfigBatchToMaster_(updates, { updatedBy: 'config_writeGlobalConfigBatch' });
}

// ============================================================
//  教科デフォルト管理
// ============================================================
function getSubjectDefaults() {
  const s = getTenantSpreadsheet_().getSheetByName(SHEET_SUBJECT);
  if (!s) return {};
  const data = s.getDataRange().getValues();
  const map  = {};
  data.slice(1).forEach(r => {
    if (r[0]) map[r[0]] = parseSubjectDefaultFields_(r[1]);
  });
  SUBJECTS.forEach(subject => {
    if (!map[subject] || map[subject].length === 0) {
      map[subject] = getDefaultSubjectFields_(subject);
    }
  });
  return map;
}

function getSubjectFieldKeys(subject) {
  const defaults = getSubjectDefaults();
  return (defaults[subject] || getDefaultSubjectFields_(subject)).map(field => field.key).filter(Boolean);
}

function getSubjectDefaultFields(subject) {
  const defaults = getSubjectDefaults();
  return defaults[subject] || getDefaultSubjectFields_(subject);
}

function updateSubjectDefault(subject, fieldDefs) {
  const s    = getTenantSpreadsheet_().getSheetByName(SHEET_SUBJECT);
  const data = s.getDataRange().getValues();
  const normalizedFields = normalizeFieldDefinitions_(fieldDefs);
  const storedValue = JSON.stringify(normalizedFields);
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === subject) {
      s.getRange(i+1,2).setValue(storedValue);
      return { ok: true };
    }
  }
  s.appendRow([subject, storedValue, '']);
  return { ok: true };
}

function getDefaultSubjectFieldKeys_(subject) {
  return DEFAULT_SUBJECT_FIELDS[subject] || ['goal','summary','eval','review'];
}

function getDefaultSubjectFields_(subject) {
  const presets = getPresets();
  return getDefaultSubjectFieldKeys_(subject)
    .map(key => presets.find(p => p.key === key))
    .filter(Boolean)
    .map(field => ({ ...field, enabled: true }));
}

function parseSubjectDefaultFields_(value) {
  if (!value) return [];
  const text = String(value).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      if (!parsed.length) return [];
      if (typeof parsed[0] === 'string') {
        return normalizeFieldDefinitions_(parsed);
      }
      return normalizeFieldDefinitions_(parsed);
    }
  } catch (e) {}
  return normalizeFieldDefinitions_(text.split(',').map(key => key.trim()).filter(Boolean));
}

function normalizeFieldDefinitions_(fields) {
  const presets = getPresets();
  return (fields || [])
    .map(field => {
      if (!field) return null;
      if (typeof field === 'string') {
        const preset = presets.find(p => p.key === field);
        return preset ? { ...preset, enabled: true } : null;
      }
      const key = String(field.key || '').trim();
      if (!key) return null;
      const preset = presets.find(p => p.key === key);
      const categories = normalizeFieldCategories_(field.categories ?? preset?.categories ?? []);
      return {
        ...(preset || {}),
        ...field,
        key,
        label: String(field.label || preset?.label || key).trim(),
        emoji: String(field.emoji || preset?.emoji || '📌'),
        type: String(field.type || preset?.type || 'text'),
        placeholder: String(field.placeholder || preset?.placeholder || ''),
        options: String(field.options || preset?.options || ''),
        hints: String(field.hints || preset?.hints || ''),
        categories,
        enabled: field.enabled !== false,
        isReview: field.isReview === true || key === REVIEW_FIELD_KEY || String(field.type || preset?.type || '') === 'review',
      };
    })
    .filter(Boolean);
}

function normalizeFieldCategories_(categories) {
  const allowed = ['knowledge', 'thinking', 'attitude'];
  if (!Array.isArray(categories)) return [];
  return categories
    .map(category => String(category || '').trim())
    .filter(category => allowed.includes(category))
    .filter((category, index, arr) => arr.indexOf(category) === index);
}

function ensureSubjectDefaultRows_() {
  const s = getTenantSpreadsheet_().getSheetByName(SHEET_SUBJECT);
  if (!s) return;
  const data = s.getDataRange().getValues();
  const existing = new Map();
  data.slice(1).forEach((row, idx) => {
    if (row[0]) existing.set(row[0], idx + 2);
  });
  SUBJECTS.forEach(subject => {
    const value = JSON.stringify(getDefaultSubjectFields_(subject));
    if (existing.has(subject)) {
      const rowNumber = existing.get(subject);
      if (!data[rowNumber - 1][1]) s.getRange(rowNumber, 2).setValue(value);
    } else {
      s.appendRow([subject, value, '']);
    }
  });
}

function ensureFieldPresetSheet_() {
  const ss = getTenantSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_FIELD_PRESETS);
  if (!sheet) sheet = ss.insertSheet(SHEET_FIELD_PRESETS);
  if (sheet.getLastColumn() < FIELD_PRESET_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getLastColumn() || 1, FIELD_PRESET_HEADERS.length - sheet.getLastColumn());
  }
  const current = sheet.getRange(1, 1, 1, FIELD_PRESET_HEADERS.length).getValues()[0];
  const needsUpdate = FIELD_PRESET_HEADERS.some((header, idx) => current[idx] !== header);
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, FIELD_PRESET_HEADERS.length).setValues([FIELD_PRESET_HEADERS]);
  }
  return sheet;
}

function listRecentCustomFieldPresets_(limit) {
  const maxItems = Math.max(1, Number(limit) || 8);
  const sheet = ensureFieldPresetSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, FIELD_PRESET_HEADERS.length).getValues();
  return rows
    .filter(row => String(row[0] || '').trim())
    .filter(row => row[10] !== true)
    .map(row => {
      const parsed = normalizeFieldDefinitions_([{
        key: row[0] || '',
        label: row[1] || '',
        emoji: row[2] || '🆕',
        type: row[3] || 'text',
        placeholder: row[4] || '',
        options: row[5] || '',
        hints: row[6] || '',
        categories: parseJsonArray_(row[7]),
        isReview: row[8] === true,
        enabled: true,
      }])[0];
      return parsed ? { ...parsed, updatedAt: row[9] || '' } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, maxItems)
    .map(item => ({
      key: item.key,
      label: item.label,
      emoji: item.emoji,
      type: item.type,
      placeholder: item.placeholder,
      options: item.options,
      hints: item.hints,
      categories: item.categories || [],
      isReview: Boolean(item.isReview),
      enabled: true,
    }));
}

function saveRecentCustomFieldPreset(field) {
  const normalized = normalizeFieldDefinitions_([field || {}])[0];
  if (!normalized || !normalized.key) throw new Error('保存する項目が不正です。');
  const sheet = ensureFieldPresetSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, FIELD_PRESET_HEADERS.length).getValues() : [];
  const now = nowIso_();
  const values = [[
    normalized.key,
    normalized.label || normalized.key,
    normalized.emoji || '🆕',
    normalized.type || 'text',
    normalized.placeholder || '',
    normalized.options || '',
    normalized.hints || '',
    JSON.stringify(normalized.categories || []),
    normalized.isReview === true,
    now,
    false,
  ]];
  let targetRow = 0;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '') === String(normalized.key)) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow) {
    sheet.getRange(targetRow, 1, 1, FIELD_PRESET_HEADERS.length).setValues(values);
  } else {
    sheet.getRange(lastRow + 1, 1, 1, FIELD_PRESET_HEADERS.length).setValues(values);
  }
  return { ok: true, preset: listRecentCustomFieldPresets_(8).find(item => item.key === normalized.key) || normalized };
}

function deleteRecentCustomFieldPreset(key) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return { ok: true };
  const sheet = ensureFieldPresetSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { ok: true };
  const rows = sheet.getRange(2, 1, lastRow - 1, FIELD_PRESET_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '') === normalizedKey) {
      sheet.getRange(i + 2, 11).setValue(true);
    }
  }
  return { ok: true };
}

function parseJsonArray_(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}






