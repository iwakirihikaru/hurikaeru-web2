const CONFIG = {
  adminWebAppUrl: 'https://script.google.com/macros/s/AKfycbyIxBewjHHF2JLlGbI6yuDfdMM7l_AkvY1QRlclIM0uR_nOGa_NXNcAZXY9Jl_g973G/exec',
  templateSpreadsheetId: '1rW5FPPwmlfXbfAIxmVBzMRd8oB0_R4Hb5LOfCF8Jgzk',
  provisionRecordTtlMinutes: 15,
};

function doGet(e) {
  const mode = String((e && e.parameter && e.parameter.mode) || '').trim();
  if (mode === 'createTeacherTemplate') {
    return renderProvisionPage_(e);
  }
  return HtmlService.createHtmlOutput([
    '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:sans-serif;padding:24px;line-height:1.8;">',
    '<p>このページは配布用シート作成専用です。</p>',
    '<p>導入管理ページから開いてください。</p>',
    '</body></html>',
  ].join('')).setTitle('Template Provision');
}

function renderProvisionPage_(e) {
  try {
    const payload = readProvisionPayload_(e);
    if (!isProvisionConfirmed_(e)) {
      return HtmlService.createHtmlOutput(buildProvisionConfirmHtml_(payload))
        .setTitle('アカウント確認');
    }
    const result = createTeacherTemplateFromRequest_(e);
    return HtmlService.createHtmlOutput(buildProvisionSuccessHtml_(result))
      .setTitle('シートを作成しました');
  } catch (err) {
    return HtmlService.createHtmlOutput(buildProvisionErrorHtml_(err))
      .setTitle('シート作成エラー');
  }
}

function createTeacherTemplateFromRequest_(e) {
  const payload = readProvisionPayload_(e);
  const cacheKey = `provision:${payload.registrationId}`;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const existing = loadProvisionRecord_(cacheKey);
    if (existing) return existing;

    const templateFile = DriveApp.getFileById(CONFIG.templateSpreadsheetId);
    const copyName = buildProvisionedSpreadsheetName_(payload);
    const copyFile = templateFile.makeCopy(copyName);
    const spreadsheet = SpreadsheetApp.openById(copyFile.getId());
    bootstrapProvisionedSpreadsheet_(spreadsheet, payload);
    notifyProvisionCompleted_(payload, spreadsheet);

    const result = {
      ok: true,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      name: spreadsheet.getName(),
    };
    saveProvisionRecord_(cacheKey, result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function readProvisionPayload_(e) {
  const params = (e && e.parameter) || {};
  const registrationId = String(params.registrationId || '').trim();
  if (!registrationId) throw new Error('registrationId がありません。');
  const registration = fetchRegistrationFromAdmin_(registrationId);
  const payload = {
    registrationId: registrationId,
    teacherName: String(registration.teacherName || '').trim(),
    teacherEmail: String(registration.teacherEmail || '').trim().toLowerCase(),
    schoolName: String(registration.schoolName || '').trim(),
    grade: String(registration.grade || '').trim(),
    className: String(registration.className || '').trim(),
  };
  if (!payload.teacherName) throw new Error('先生名がありません。');
  if (!payload.schoolName) throw new Error('学校名がありません。');
  if (!payload.grade) throw new Error('学年がありません。');
  return payload;
}

function fetchRegistrationFromAdmin_(registrationId) {
  const response = UrlFetchApp.fetch(CONFIG.adminWebAppUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      action: 'exportRegistration',
      registrationId: registrationId,
    }),
  });
  const json = JSON.parse(String(response.getContentText() || '{}'));
  if (!json || !json.ok || !json.registration) {
    throw new Error('登録情報の取得に失敗しました。');
  }
  return json.registration;
}

function isProvisionConfirmed_(e) {
  const confirm = String((e && e.parameter && e.parameter.confirm) || '').trim();
  return confirm === '1';
}

function bootstrapProvisionedSpreadsheet_(ss, payload) {
  let sheet = ss.getSheetByName('_setup');
  if (!sheet) sheet = ss.insertSheet('_setup');
  const rows = [
    ['registrationId', payload.registrationId],
    ['teacherName', payload.teacherName],
    ['teacherEmail', payload.teacherEmail],
    ['schoolName', payload.schoolName],
    ['grade', payload.grade],
    ['className', payload.className],
    ['spreadsheetId', ss.getId()],
    ['setupCompletedAt', ''],
    ['lastWebAppUrl', ''],
    ['templateMasterSpreadsheetId', ''],
  ];
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.hideSheet();
}

function notifyProvisionCompleted_(payload, spreadsheet) {
  UrlFetchApp.fetch(CONFIG.adminWebAppUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      action: 'completeProvision',
      registrationId: payload.registrationId,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
    }),
  });
}

function buildProvisionedSpreadsheetName_(payload) {
  const parts = [
    'じぶんまとめ',
    payload.schoolName,
    `${payload.grade}年${payload.className ? `${payload.className}組` : ''}`,
    payload.teacherName,
  ].filter(Boolean);
  return sanitizeProvisionNamePart_(parts.join('_'));
}

function sanitizeProvisionNamePart_(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function loadProvisionRecord_(cacheKey) {
  const raw = PropertiesService.getScriptProperties().getProperty(cacheKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const createdAt = Number(parsed.createdAt || 0);
    const ttlMs = Number(CONFIG.provisionRecordTtlMinutes || 15) * 60 * 1000;
    if (!createdAt || Date.now() - createdAt > ttlMs) return null;
    return parsed.result || null;
  } catch (_err) {
    return null;
  }
}

function saveProvisionRecord_(cacheKey, result) {
  PropertiesService.getScriptProperties().setProperty(cacheKey, JSON.stringify({
    createdAt: Date.now(),
    result: result,
  }));
}

function buildProvisionSuccessHtml_(result) {
  const safeUrl = escapeHtml_(result.spreadsheetUrl || '');
  return [
    '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"></head>',
    '<body style="font-family:sans-serif;padding:24px;line-height:1.8;">',
    '<p>シートを作成しました。開かない場合は下のリンクを押してください。</p>',
    `<p><a href="${safeUrl}" rel="noopener noreferrer" style="display:inline-block;padding:12px 16px;border-radius:12px;background:#0e7c66;color:#fff;text-decoration:none;font-weight:700;">自分のシートを開く</a></p>`,
    `<p style="font-size:12px;color:#666;word-break:break-all;">${safeUrl}</p>`,
    '</body></html>',
  ].join('');
}

function buildProvisionConfirmHtml_(payload) {
  const continueUrl = buildProvisionContinueUrl_(payload);
  const retryUrl = buildProvisionPendingUrl_(payload);
  const emailHint = getCurrentAccountHint_();
  return [
    '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_top"></head>',
    '<body style="font-family:sans-serif;padding:24px;line-height:1.8;background:#f6f1e8;color:#1f2a30;">',
    '<div style="max-width:680px;margin:0 auto;background:#fffdf8;border:1px solid #d8cbb7;border-radius:18px;padding:24px;">',
    '<h1 style="margin:0 0 12px;font-size:26px;">このアカウントで作成するか確認</h1>',
    `<p style="margin:0 0 16px;color:#5f6b72;">${escapeHtml_(emailHint)}</p>`,
    '<p style="margin:0 0 12px;">このまま進むと、今のブラウザで有効な Google アカウント側の Drive に先生用シートを作成します。</p>',
    '<div style="margin:18px 0;padding:14px 16px;border:1px solid #c9e5dd;border-radius:14px;background:#f7fbfa;">',
    `<div><strong>先生名:</strong> ${escapeHtml_(payload.teacherName)}</div>`,
    `<div><strong>学校名:</strong> ${escapeHtml_(payload.schoolName)}</div>`,
    `<div><strong>学年・組:</strong> ${escapeHtml_(`${payload.grade}年${payload.className ? ` ${payload.className}組` : ''}`)}</div>`,
    '</div>',
    '<div style="display:grid;gap:12px;margin-top:20px;">',
    `<a href="${escapeHtml_(continueUrl)}" target="_top" rel="noopener noreferrer" style="display:block;text-align:center;text-decoration:none;padding:14px 16px;border-radius:14px;background:#0e7c66;color:#fff;font-weight:700;">このアカウントで続ける</a>`,
    `<a href="${escapeHtml_(retryUrl)}" target="_top" rel="noopener noreferrer" style="display:block;text-align:center;text-decoration:none;padding:14px 16px;border-radius:14px;background:#fff7f3;color:#d96c3f;border:1px solid #efc7b8;font-weight:700;">戻って別アカウントでやり直す</a>`,
    '</div>',
    '<p style="margin:18px 0 0;color:#5f6b72;font-size:13px;">想定と違うアカウントなら、このページでは進まず、別ブラウザまたは別プロフィールで導入管理ページを開き直してください。</p>',
    '</div></body></html>',
  ].join('');
}

function buildProvisionErrorHtml_(err) {
  const message = escapeHtml_(err && err.message ? err.message : String(err || '不明なエラーです。'));
  return [
    '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="font-family:sans-serif;padding:24px;line-height:1.8;">',
    '<p>シート作成に失敗しました。</p>',
    `<p style="color:#b00020;">${message}</p>`,
    '<p>導入管理ページに戻って、もう一度やり直してください。</p>',
    '</body></html>',
  ].join('');
}

function buildProvisionPendingUrl_(payload) {
  return buildProvisionUrlWithParams_(payload, false);
}

function buildProvisionContinueUrl_(payload) {
  return buildProvisionUrlWithParams_(payload, true);
}

function buildProvisionUrlWithParams_(payload, confirm) {
  const baseUrl = String(ScriptApp.getService().getUrl() || '').trim();
  const params = {
    mode: 'createTeacherTemplate',
    registrationId: payload.registrationId,
    confirm: confirm ? '1' : '',
  };
  const query = Object.keys(params)
    .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  return query ? `${baseUrl}?${query}` : baseUrl;
}

function getCurrentAccountHint_() {
  try {
    const sessionEmail = String(Session.getActiveUser().getEmail() || '').trim();
    if (sessionEmail) {
      return `現在の Google アカウント: ${sessionEmail}`;
    }
  } catch (_err) {}
  return 'Google のアカウント選択が出ない場合は、今のブラウザで既定になっているアカウントで進みます。';
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}













































































































