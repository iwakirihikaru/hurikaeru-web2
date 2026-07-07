const ADMIN_WEBAPP_URL = 'PASTE_ADMIN_WEBAPP_URL_HERE';
const TEMPLATE_CFG_SHEET = '_setup';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('初期設定')
    .addItem('このシートを使えるようにする', 'startTeacherSetup')
    .addToUi();
}

function startTeacherSetup() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = loadTemplateSetupConfig_();
  const setupInfo = collectTeacherSetupInfo_(ui, ss, config);
  if (!setupInfo) return;
  const payload = {
    action: 'connectSheet',
    teacherName: setupInfo.teacherName,
    teacherEmail: setupInfo.teacherEmail,
    schoolName: setupInfo.schoolName,
    grade: setupInfo.grade,
    className: setupInfo.className,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
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
    spreadsheetId: ss.getId(),
    setupCompletedAt: new Date().toISOString(),
  });
  ui.alert('登録が完了しました。次は Webアプリ化 をしてください。');
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
    teacherName: firstNonEmptyValue_(config.teacherName),
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
  if (!values.grade) {
    values.grade = promptSetupField_(ui, '学年を入力してください', '例: 4');
    if (values.grade === null) return null;
  }
  if (!alreadyConfigured && values.className === '') {
    const className = promptSetupField_(ui, '組を入力してください（空欄のままでも可）', '例: 1', { allowBlank: true });
    if (className === null) return null;
    values.className = className;
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

function loadTemplateSetupConfig_() {
  const sheet = getTemplateSetupSheet_();
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
  };
}

function saveTemplateSetupConfig_(config) {
  const sheet = getTemplateSetupSheet_();
  const rows = [
    ['registrationId', String(config.registrationId || '').trim()],
    ['teacherName', String(config.teacherName || '').trim()],
    ['teacherEmail', String(config.teacherEmail || '').trim()],
    ['schoolName', String(config.schoolName || '').trim()],
    ['grade', String(config.grade || '').trim()],
    ['className', String(config.className || '').trim()],
    ['spreadsheetId', String(config.spreadsheetId || '').trim()],
    ['setupCompletedAt', String(config.setupCompletedAt || '').trim()],
  ];
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
}

function getTemplateSetupSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TEMPLATE_CFG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TEMPLATE_CFG_SHEET);
    sheet.hideSheet();
  }
  return sheet;
}
