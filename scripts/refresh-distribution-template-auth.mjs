import { readFile } from 'node:fs/promises';
import { initAuth } from '../node_modules/@google/clasp/build/src/auth/auth.js';

const SHEET_INTRO = 'はじめに';
const SHEET_NEXT = 'つぎへ';
const SHEET_SETUP = '_setup';

function parseJsonFile(text) {
  return JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
}

function extractSpreadsheetId(url) {
  const text = String(url || '').trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
  return match ? String(match[1] || '').trim() : '';
}

function sanitizeTemplateBaseName(name) {
  const text = String(name || '').trim();
  if (!text) return 'じぶんまとめ';
  return text
    .replace(/_配布テンプレート_.+$/, '')
    .replace(/_(配布用マスター|デバッグ用マスター|配布用|デバッグ用)(_.+)?$/u, '');
}

function buildDistributionTemplateMasterName(currentName, at = new Date()) {
  const yyyy = String(at.getFullYear());
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  const dd = String(at.getDate()).padStart(2, '0');
  return `${sanitizeTemplateBaseName(currentName)}_配布用マスター_${yyyy}${mm}${dd}`;
}

function rgb(hex) {
  const normalized = String(hex || '').replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map(ch => ch + ch).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const asInt = Number.parseInt(value, 16);
  return {
    red: ((asInt >> 16) & 255) / 255,
    green: ((asInt >> 8) & 255) / 255,
    blue: (asInt & 255) / 255,
  };
}

function gridRange(sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex) {
  return { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex };
}

function repeatCell(sheetId, range, format = {}, fields = '') {
  return {
    repeatCell: {
      range: gridRange(sheetId, range[0], range[1], range[2], range[3]),
      cell: { userEnteredFormat: format },
      fields: fields || 'userEnteredFormat',
    },
  };
}

function setBorder(sheetId, range, colorHex, style = 'SOLID') {
  const color = rgb(colorHex);
  const border = { style, color };
  return {
    updateBorders: {
      range: gridRange(sheetId, range[0], range[1], range[2], range[3]),
      top: border,
      bottom: border,
      left: border,
      right: border,
      innerHorizontal: border,
      innerVertical: border,
    },
  };
}

async function getAccessToken() {
  const authInfo = await initAuth({ userKey: 'default' });
  const auth = authInfo.credentials;
  if (!auth) {
    throw new Error('clasp credentials are not available.');
  }
  const tokenResult = await auth.getAccessToken();
  const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;
  if (!token) {
    throw new Error('Could not acquire an OAuth access token from clasp credentials.');
  }
  return token;
}

async function apiFetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function apiFetchText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${text}`);
  }
  return text;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractIframeSrc(html) {
  const text = String(html || '');
  const match = text.match(/<iframe[^>]+src="([^"]+)"/i);
  return match ? decodeHtmlEntities(match[1]) : '';
}

async function loadSpreadsheet(token, spreadsheetId) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
  url.searchParams.set('fields', 'spreadsheetId,properties.title,sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount,hiddenGridlines)))');
  return apiFetchJson(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function isServiceDisabledError(error) {
  return /SERVICE_DISABLED|sheets\.googleapis\.com|drive\.googleapis\.com/i.test(String(error && error.message ? error.message : error));
}

async function ensureSheetIds(token, spreadsheetId, spreadsheet) {
  const existing = new Map((spreadsheet.sheets || []).map(sheet => [sheet.properties.title, sheet.properties]));
  const requests = [];

  if (!existing.has(SHEET_INTRO)) {
    requests.push({ addSheet: { properties: { title: SHEET_INTRO, index: 0 } } });
  }
  if (!existing.has(SHEET_NEXT)) {
    requests.push({ addSheet: { properties: { title: SHEET_NEXT, index: existing.has(SHEET_INTRO) ? 1 : 0 } } });
  }
  if (!existing.has(SHEET_SETUP)) {
    requests.push({ addSheet: { properties: { title: SHEET_SETUP, hidden: true } } });
  }

  if (requests.length) {
    await apiFetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
    return loadSpreadsheet(token, spreadsheetId);
  }

  return spreadsheet;
}

function buildIntroValues() {
  return [
    { range: `${SHEET_INTRO}!B2:E2`, values: [['はじめに']] },
    { range: `${SHEET_INTRO}!B3:E3`, values: [['最初は初期設定だけで大丈夫です。']] },
    { range: `${SHEET_INTRO}!B5:E5`, values: [['1. このシートを使い始める']] },
    {
      range: `${SHEET_INTRO}!B6:E9`,
      values: [[
        '1. 上のメニューの「初期設定」→「このシートを使えるようにする」を押して進めます。もしも表示がない場合は、30秒ほど待ってください。\n' +
        '2. 認証が出たら OK を押します。\n' +
        '3. 「次へ」をクリックします。\n' +
        '4. すべて選択をチェックし、下にある続行をクリックして、教師情報を入力してください。'
      ]],
    },
    { range: `${SHEET_INTRO}!B11:E11`, values: [['2. Webアプリ化へ進む']] },
    { range: `${SHEET_INTRO}!B12:E13`, values: [['初期設定が終わると「つぎへ」シートが開きます。そこから Webアプリ化 に進みます。']] },
    { range: `${SHEET_INTRO}!B15:E15`, values: [['コピー先が違ったとき']] },
    {
      range: `${SHEET_INTRO}!B16:E18`,
      values: [[
        '思っていた Drive と違う場所に保存されたら、そのコピーでは初期設定せず閉じてください。戻って別のアカウントでやり直します。'
      ]],
    },
  ];
}

function buildNextValues(spreadsheetUrl) {
  return [
    { range: `${SHEET_NEXT}!B2:E2`, values: [['つぎへ']] },
    {
      range: `${SHEET_NEXT}!B3:E3`,
      values: [['初期設定が終わると、このシートに先生ページと児童ページの案内が出ます。']],
    },
    { range: `${SHEET_NEXT}!B5:E5`, values: [['1. Webアプリ化をする']] },
    {
      range: `${SHEET_NEXT}!B6:D10`,
      values: [[
        '1. 右のボタンからこのスプレッドシートを開きます。\n' +
        '2. 上のメニューの「初期設定」→「Webアプリ化ガイドを開く」または「拡張機能」→「Apps Script」を押します。\n' +
        '3. Apps Script 画面で「デプロイ」→「新しいデプロイ」を押します。\n' +
        '4. 種類の選択で「ウェブアプリ」を選び、アクセスできるユーザーを「全員」にしてデプロイします。\n' +
        '5. 最後に表示された Web アプリ URL をコピーします。'
      ]],
    },
    {
      range: `${SHEET_NEXT}!E6:E10`,
      values: [[`=HYPERLINK("${String(spreadsheetUrl || '').replace(/"/g, '""')}","このシートから進む")`]],
    },
    { range: `${SHEET_NEXT}!B12:E12`, values: [['2. デプロイURLを反映する']] },
    {
      range: `${SHEET_NEXT}!B13:D16`,
      values: [[
        'Webアプリ化が終わったら、表示された Web アプリ URL をコピーし、上のメニューの「初期設定」→「デプロイURLを反映する」を押して貼り付けます。ここまで終わると、下の先生ページ・児童ページリンクが使えるようになります。'
      ]],
    },
    { range: `${SHEET_NEXT}!E13:E16`, values: [['メニューから反映']] },
    { range: `${SHEET_NEXT}!B18:E18`, values: [['3. URL を使う']] },
    {
      range: `${SHEET_NEXT}!B19:D20`,
      values: [['まだ先生ページURLは使えません。先に Webアプリ化 と URL反映 をしてください。']],
    },
    { range: `${SHEET_NEXT}!E19:E20`, values: [['未反映']] },
    {
      range: `${SHEET_NEXT}!B22:D23`,
      values: [['まだ児童ページURLは使えません。先に Webアプリ化 と URL反映 をしてください。']],
    },
    { range: `${SHEET_NEXT}!E22:E23`, values: [['未反映']] },
    { range: `${SHEET_NEXT}!B25:E25`, values: [['4. 最初にやること']] },
    {
      range: `${SHEET_NEXT}!B26:E27`,
      values: [['Webアプリ化が終わったら、まず先生ページで「単元設定」を行います。そのあと「授業状況」を使い始めます。']],
    },
    { range: `${SHEET_NEXT}!B29:E29`, values: [['困ったとき']] },
    {
      range: `${SHEET_NEXT}!B30:E32`,
      values: [['まだ初期設定が終わっていません。先に「はじめに」シートへ戻ってください。\n\nリンクが開かないのは、まだ Webアプリ URL を反映していない可能性が高いです。デプロイ完了後に「初期設定 → デプロイURLを反映する」を押してください。']],
    },
  ];
}

function buildSetupValues(existingRows, spreadsheetId) {
  const map = new Map();
  for (const row of existingRows) {
    const key = String(row?.[0] || '').trim();
    if (key) {
      map.set(key, String(row?.[1] || ''));
    }
  }
  map.set('templateMasterSpreadsheetId', spreadsheetId);
  const orderedKeys = [
    'registrationId',
    'teacherName',
    'teacherEmail',
    'schoolName',
    'grade',
    'className',
    'spreadsheetId',
    'setupCompletedAt',
    'lastWebAppUrl',
    'templateMasterSpreadsheetId',
  ];
  const rows = orderedKeys.map(key => [key, map.get(key) || '']);
  for (const [key, value] of map.entries()) {
    if (!orderedKeys.includes(key)) {
      rows.push([key, value]);
    }
  }
  return rows;
}

function buildSheetFormattingRequests(introSheetId, nextSheetId, setupSheetId) {
  const requests = [];

  requests.push(
    { updateSheetProperties: { properties: { sheetId: introSheetId, index: 0, hiddenGridlines: true, gridProperties: { rowCount: 18, columnCount: 5 } }, fields: 'index,hiddenGridlines,gridProperties.rowCount,gridProperties.columnCount' } },
    { updateSheetProperties: { properties: { sheetId: nextSheetId, index: 1, hiddenGridlines: true, gridProperties: { rowCount: 34, columnCount: 6 } }, fields: 'index,hiddenGridlines,gridProperties.rowCount,gridProperties.columnCount' } },
    { updateSheetProperties: { properties: { sheetId: setupSheetId, hidden: true }, fields: 'hidden' } },
    { unmergeCells: { range: gridRange(introSheetId, 0, 18, 0, 5) } },
    { unmergeCells: { range: gridRange(nextSheetId, 0, 34, 0, 6) } },
    { updateDimensionProperties: { range: { sheetId: introSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: introSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: introSheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 5 }, properties: { pixelSize: 230 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: introSheetId, dimension: 'ROWS', startIndex: 5, endIndex: 9 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: introSheetId, dimension: 'ROWS', startIndex: 10, endIndex: 12 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: introSheetId, dimension: 'ROWS', startIndex: 14, endIndex: 17 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 4 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'ROWS', startIndex: 0, endIndex: 34 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'ROWS', startIndex: 5, endIndex: 10 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'ROWS', startIndex: 12, endIndex: 16 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'ROWS', startIndex: 18, endIndex: 20 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'ROWS', startIndex: 21, endIndex: 23 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'ROWS', startIndex: 24, endIndex: 27 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: nextSheetId, dimension: 'ROWS', startIndex: 28, endIndex: 31 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } },
  );

  const merges = [
    [introSheetId, 1, 2, 1, 5], [introSheetId, 2, 3, 1, 5], [introSheetId, 4, 5, 1, 5], [introSheetId, 5, 9, 1, 5],
    [introSheetId, 10, 11, 1, 5], [introSheetId, 11, 13, 1, 5], [introSheetId, 14, 15, 1, 5], [introSheetId, 15, 18, 1, 5],
    [nextSheetId, 1, 2, 1, 5], [nextSheetId, 2, 3, 1, 5], [nextSheetId, 4, 5, 1, 5], [nextSheetId, 5, 10, 1, 4],
    [nextSheetId, 5, 10, 4, 5], [nextSheetId, 11, 12, 1, 5], [nextSheetId, 12, 16, 1, 4], [nextSheetId, 12, 16, 4, 5],
    [nextSheetId, 17, 18, 1, 5], [nextSheetId, 18, 20, 1, 4], [nextSheetId, 18, 20, 4, 5], [nextSheetId, 21, 23, 1, 4],
    [nextSheetId, 21, 23, 4, 5], [nextSheetId, 24, 25, 1, 5], [nextSheetId, 25, 27, 1, 5], [nextSheetId, 28, 29, 1, 5],
    [nextSheetId, 29, 32, 1, 5],
  ];
  for (const [sheetId, sr, er, sc, ec] of merges) {
    requests.push({ mergeCells: { range: gridRange(sheetId, sr, er, sc, ec), mergeType: 'MERGE_ALL' } });
  }

  const center = { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' };
  const leftTop = { horizontalAlignment: 'LEFT', verticalAlignment: 'TOP' };
  const leftMiddle = { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' };

  requests.push(
    repeatCell(introSheetId, [1, 2, 1, 5], { backgroundColor: rgb('#f6f1e8'), textFormat: { fontSize: 20, bold: true }, ...center }),
    repeatCell(introSheetId, [2, 3, 1, 5], { textFormat: { fontSize: 11, foregroundColor: rgb('#5f6b72') }, horizontalAlignment: 'CENTER' }),
    repeatCell(introSheetId, [4, 5, 1, 5], { backgroundColor: rgb('#fff7f0'), textFormat: { fontSize: 14, bold: true } }),
    repeatCell(introSheetId, [5, 9, 1, 5], { backgroundColor: rgb('#fffdf8'), wrapStrategy: 'WRAP', textFormat: { fontSize: 12 }, ...leftTop }),
    repeatCell(introSheetId, [10, 11, 1, 5], { backgroundColor: rgb('#eef6f3'), textFormat: { fontSize: 14, bold: true } }),
    repeatCell(introSheetId, [11, 13, 1, 5], { backgroundColor: rgb('#fffdf8'), wrapStrategy: 'WRAP', textFormat: { fontSize: 12 }, ...leftTop }),
    repeatCell(introSheetId, [14, 15, 1, 5], { backgroundColor: rgb('#fff7f0'), textFormat: { bold: true } }),
    repeatCell(introSheetId, [15, 18, 1, 5], { backgroundColor: rgb('#fffdf8'), wrapStrategy: 'WRAP', textFormat: { fontSize: 12 }, ...leftTop }),
    setBorder(introSheetId, [5, 9, 1, 5], '#d8cbb7'),
    setBorder(introSheetId, [11, 13, 1, 5], '#c9e5dd', 'SOLID_THICK'),
    setBorder(introSheetId, [15, 18, 1, 5], '#d8cbb7'),

    repeatCell(nextSheetId, [1, 2, 1, 5], { backgroundColor: rgb('#f6f1e8'), textFormat: { fontSize: 20, bold: true } }),
    repeatCell(nextSheetId, [2, 3, 1, 5], { textFormat: { foregroundColor: rgb('#5f6b72') } }),
    repeatCell(nextSheetId, [4, 5, 1, 5], { backgroundColor: rgb('#eef8f6'), textFormat: { bold: true } }),
    repeatCell(nextSheetId, [5, 10, 1, 4], { wrapStrategy: 'WRAP', textFormat: { fontSize: 12 }, ...leftTop }),
    repeatCell(nextSheetId, [5, 10, 4, 5], { textFormat: { bold: true, foregroundColor: rgb('#0e7c66') }, wrapStrategy: 'WRAP', ...center }),
    setBorder(nextSheetId, [4, 10, 1, 5], '#d8cbb7'),
    repeatCell(nextSheetId, [11, 12, 1, 5], { backgroundColor: rgb('#eef5fb'), textFormat: { bold: true } }),
    repeatCell(nextSheetId, [12, 16, 1, 4], { wrapStrategy: 'WRAP', textFormat: { fontSize: 12 }, ...leftTop }),
    repeatCell(nextSheetId, [12, 16, 4, 5], { textFormat: { bold: true, foregroundColor: rgb('#0e7c66') }, ...center }),
    setBorder(nextSheetId, [11, 16, 1, 5], '#d8cbb7'),
    repeatCell(nextSheetId, [17, 18, 1, 5], { backgroundColor: rgb('#eef5fb'), textFormat: { bold: true } }),
    repeatCell(nextSheetId, [18, 20, 1, 4], { wrapStrategy: 'WRAP', textFormat: { fontSize: 12 }, ...leftMiddle }),
    repeatCell(nextSheetId, [18, 20, 4, 5], { textFormat: { bold: true, foregroundColor: rgb('#0e7c66') }, ...center }),
    setBorder(nextSheetId, [18, 20, 1, 5], '#d8cbb7'),
    repeatCell(nextSheetId, [21, 23, 1, 4], { wrapStrategy: 'WRAP', textFormat: { fontSize: 12 }, ...leftMiddle }),
    repeatCell(nextSheetId, [21, 23, 4, 5], { textFormat: { bold: true, foregroundColor: rgb('#0e7c66') }, ...center }),
    setBorder(nextSheetId, [21, 23, 1, 5], '#d8cbb7'),
    repeatCell(nextSheetId, [24, 25, 1, 5], { backgroundColor: rgb('#fdf6ea'), textFormat: { bold: true } }),
    repeatCell(nextSheetId, [25, 27, 1, 5], { wrapStrategy: 'WRAP', textFormat: { fontSize: 12 }, ...leftMiddle }),
    setBorder(nextSheetId, [24, 27, 1, 5], '#d8cbb7'),
    repeatCell(nextSheetId, [28, 29, 1, 5], { backgroundColor: rgb('#fff7f0'), textFormat: { bold: true } }),
    repeatCell(nextSheetId, [29, 32, 1, 5], { wrapStrategy: 'WRAP', textFormat: { fontSize: 12 }, ...leftTop }),
    setBorder(nextSheetId, [28, 32, 1, 5], '#d8cbb7'),
  );

  return requests;
}

async function runDirectApiRefresh(token, spreadsheetId) {
  let spreadsheet = await loadSpreadsheet(token, spreadsheetId);
  spreadsheet = await ensureSheetIds(token, spreadsheetId, spreadsheet);

  const introSheet = spreadsheet.sheets.find(sheet => sheet.properties.title === SHEET_INTRO)?.properties;
  const nextSheet = spreadsheet.sheets.find(sheet => sheet.properties.title === SHEET_NEXT)?.properties;
  const setupSheet = spreadsheet.sheets.find(sheet => sheet.properties.title === SHEET_SETUP)?.properties;
  if (!introSheet || !nextSheet || !setupSheet) {
    throw new Error('Could not resolve required sheet ids.');
  }

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const nextName = buildDistributionTemplateMasterName(spreadsheet.properties?.title || '');

  await apiFetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ranges: [
        `${SHEET_INTRO}!A:Z`,
        `${SHEET_NEXT}!A:Z`,
      ],
    }),
  });

  const setupValues = await apiFetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${SHEET_SETUP}!A:B`)}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => ({ values: [] }));
  const setupRows = buildSetupValues(setupValues.values || [], spreadsheetId);

  await apiFetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        ...buildIntroValues(),
        ...buildNextValues(spreadsheetUrl),
        { range: `${SHEET_SETUP}!A1:B${setupRows.length}`, values: setupRows },
      ],
    }),
  });

  await apiFetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: buildSheetFormattingRequests(introSheet.sheetId, nextSheet.sheetId, setupSheet.sheetId),
    }),
  });

  if (String(spreadsheet.properties?.title || '').trim() !== nextName) {
    await apiFetchText(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=id,name`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: nextName }),
    });
  }

  return {
    ok: true,
    spreadsheetId,
    name: nextName,
    url: spreadsheetUrl,
    refreshMode: 'sheets-drive-api',
  };
}

async function runWebAppRefresh(token, deploymentId, spreadsheetId) {
  const url = `https://script.google.com/macros/s/${deploymentId}/exec`;
  const wrapperText = await apiFetchText(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: 'refreshTemplateMaster',
      spreadsheetId,
    }),
  });

  try {
    const payload = JSON.parse(wrapperText);
    if (!payload?.ok) {
      throw new Error(payload?.error || 'unknown_error');
    }
    return { ...payload, refreshMode: 'webapp-json-direct' };
  } catch (_err) {}

  const iframeSrc = extractIframeSrc(wrapperText);
  if (!iframeSrc) {
    throw new Error(`refresh response was not JSON and iframe src was not found.\n${wrapperText}`);
  }

  const iframeText = await apiFetchText(iframeSrc, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let payload = null;
  try {
    payload = JSON.parse(iframeText);
  } catch (_err) {
    throw new Error(`iframe response was not JSON.\n${iframeText}`);
  }
  if (!payload?.ok) {
    throw new Error(payload?.error || 'unknown_error');
  }
  return { ...payload, refreshMode: 'webapp-googleusercontent' };
}

async function main() {
  const adminConfig = parseJsonFile(await readFile(new URL('../admin.config.json', import.meta.url), 'utf8'));
  const deployConfig = parseJsonFile(await readFile(new URL('../deploy.config.json', import.meta.url), 'utf8'));
  const spreadsheetId = extractSpreadsheetId(adminConfig.templateCopyUrlBase);
  const deploymentId = String(adminConfig.templateDeploymentId || process.env.TEMPLATE_DEPLOYMENT_ID || deployConfig.webappDeploymentId || '').trim();
  if (!spreadsheetId) {
    throw new Error('Could not extract template spreadsheet id from admin.config.json templateCopyUrlBase.');
  }
  if (!deploymentId) {
    throw new Error('deploy.config.json webappDeploymentId is empty.');
  }

  const token = await getAccessToken();
  let payload = null;
  let directError = null;
  try {
    payload = await runDirectApiRefresh(token, spreadsheetId);
  } catch (error) {
    directError = error;
    if (!isServiceDisabledError(error)) {
      throw error;
    }
  }

  if (!payload) {
    try {
      payload = await runWebAppRefresh(token, deploymentId, spreadsheetId);
    } catch (webError) {
      const directMessage = directError ? String(directError.message || directError) : 'none';
      throw new Error(`direct api refresh failed:\n${directMessage}\n\nwebapp refresh failed:\n${String(webError.message || webError)}`);
    }
  }

  console.log(JSON.stringify(payload));
}

await main();
