// ============================================================
//  じぶんまとめシステム v3  コード.gs
//
//  シート構成:
//    「設定」        … グローバル設定（プロンプト・メダル数等）
//    「教科デフォルト」… 教科ごとのデフォルト項目セット
//    「単元一覧」    … 単元・単元ごとの項目設定
//    「名簿」        … 出席番号・名前（任意）
//    「授業_単元ID_時間目」… 授業ごとのデータ
//    「単元集約」    … 全授業ふりかえり蓄積
// ============================================================

// ---- 固定定数 ----
const SHEET_CFG     = '設定';
const SHEET_SUBJECT = '教科デフォルト';
const SHEET_UNITS   = '単元一覧';
const SHEET_AGG     = '単元集約';
const HEADER_ROWS   = 2;
const MAX_STUDENTS  = 40;

// 授業シートの列（固定6項目＋内部列）
// ふりかえりは常に最後の入力列
// カスタム項目は最大5つ（プリセット5種）
const BASE_COL = {
  NUM      : 1,
  NAME     : 2,
  // 3〜7: カスタム項目（項目数により可変）
  // 最終入力列の次から:
  COMMENT  : 8,
  RANK     : 9,
  MEDAL    : 10,
  PREV     : 11,
  SUBMITTED: 12,
  SCORE    : 13,
};
const CUSTOM_START = 3; // カスタム項目は3列目から最大5列
const MAX_FIELDS   = 5;

// ふりかえりは常にカスタム項目の最後（必須）
const REVIEW_FIELD_KEY = 'review';

// ランク・メダル
const RANKS  = ['C','C+','B','B+','A','A+','S','S+'];
const MEDALS = ['🥇','🥈','🥉','4th','5th'];
const MEDAL_COLORS = ['','','','#FF7043','#AB47BC'];

// ============================================================
//  プリセット項目定義（ワンクリック追加）
// ============================================================
function getPresets() {
  return [
    {
      key    : 'goal',
      label  : 'めあて',
      emoji  : '🎯',
      type   : 'text',
      placeholder: 'きょうのじゅぎょうのめあてをかいてみよう',
      options: '',
      hints  : '',
    },
    {
      key    : 'method',
      label  : '学習のやり方',
      emoji  : '🔧',
      type   : 'radio',
      placeholder: '',
      options: '１人で,友達と,先生と',
      hints  : '',
    },
    {
      key    : 'summary',
      label  : 'まとめ',
      emoji  : '📝',
      type   : 'text',
      placeholder: 'わかったこと・きづいたことをかいてみよう',
      options: '',
      hints  : '',
    },
    {
      key    : 'eval',
      label  : 'よくわかりましたか？',
      emoji  : '🤔',
      type   : 'select',
      placeholder: '',
      options: 'よくわかった,だいたいわかった,あまりわからなかった,わからなかった',
      hints  : '',
    },
    {
      key    : 'review',
      label  : 'ふりかえり',
      emoji  : '💬',
      type   : 'review',  // 特殊：観点ヒント付き自由記述
      placeholder: 'くわしくかいてみよう！',
      options: '',
      hints  : 'がんばったこと,やり方,わかったこと,次にしたいこと,しりたいこと,おもったこと,むずかしかったこと',
    },
  ];
}

// ============================================================
//  Web アプリ エントリー
// ============================================================
function doGet(e) {
  const page = e.parameter.page || 'student';
  const file = page === 'teacher' ? 'teacher' : 'index';
  return HtmlService.createHtmlOutputFromFile(file)
    .setTitle(page === 'teacher' ? '先生画面' : 'じぶんまとめ')
    .addMetaTag('viewport','width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no');
}

// ============================================================
//  初期化（初回のみ手動実行）
// ============================================================
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 設定シート
  if (!ss.getSheetByName(SHEET_CFG)) {
    const s = ss.insertSheet(SHEET_CFG);
    s.getRange(1,1,1,3).setValues([['キー','値','説明']]);
    s.getRange(2,1,5,3).setValues([
      ['medal_top',      '5',  'メダル上位人数（最大5）'],
      ['prompt_comment', 'あなたは小学3年生の担任の先生です。以下のふりかえりを読んで、やさしく励ますコメントを60文字以内で書いてください。ひらがな・カタカナを中心に使い、自己調整学習（めあてへの意識・方略・内省）を促す言葉を入れてください。', 'コメント用プロンプト'],
      ['prompt_score',   '自己調整学習スコア(0-7)を評価してください。0=C:一言のみ, 1=C+:感想のみ, 2=B:学んだ内容に触れている, 3=B+:めあてと照らした振り返り, 4=A:方略（工夫）が書かれている, 5=A+:方略＋次への改善意図, 6=S:深い内省・概念的理解, 7=S+:教科を超えた汎用的な気づき', 'スコア評価基準'],
      ['active_unit',    '', 'アクティブ単元ID'],
      ['active_period',  '0','アクティブ時間目（0=未選択）'],
    ]);
  }

  // 教科デフォルトシート
  if (!ss.getSheetByName(SHEET_SUBJECT)) {
    const s = ss.insertSheet(SHEET_SUBJECT);
    s.getRange(1,1,1,3).setValues([['教科','項目キー一覧(カンマ区切り)','説明']]);
    // デフォルト：全教科共通
    const defaultFields = 'goal,method,summary,eval,review';
    s.getRange(2,1,10,3).setValues([
      ['算数',       defaultFields, ''],
      ['国語',       defaultFields, ''],
      ['理科',       defaultFields, ''],
      ['社会',       defaultFields, ''],
      ['生活',       'goal,summary,eval,review', ''],
      ['体育',       'goal,method,eval,review', ''],
      ['図工',       'goal,summary,review', ''],
      ['音楽',       'goal,eval,review', ''],
      ['道徳',       'goal,review', ''],
      ['総合',       'goal,method,summary,eval,review', ''],
    ]);
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
    s.getRange(1,1,1,9).setValues([[
      '単元名','教科','時間目','出席番号','なまえ','日付','ふりかえり','ランク','AIコメント'
    ]]);
  }

  Logger.log('初期化完了！');
}

// ============================================================
//  設定読み書き
// ============================================================
function readGlobalConfig() {
  const s    = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CFG);
  if (!s) return {};
  const data = s.getDataRange().getValues();
  const cfg  = {};
  data.slice(1).forEach(r => { if (r[0]) cfg[r[0]] = r[1]; });
  return cfg;
}

function writeGlobalConfig(key, value) {
  const s    = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CFG);
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) { s.getRange(i+1,2).setValue(value); return; }
  }
  s.appendRow([key, value, '']);
}

// ============================================================
//  教科デフォルト管理
// ============================================================
function getSubjectDefaults() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SUBJECT);
  if (!s) return {};
  const data = s.getDataRange().getValues();
  const map  = {};
  data.slice(1).forEach(r => {
    if (r[0]) map[r[0]] = (r[1]||'').split(',').map(k=>k.trim()).filter(Boolean);
  });
  return map;
}

function getSubjectFieldKeys(subject) {
  const defaults = getSubjectDefaults();
  return defaults[subject] || ['goal','summary','eval','review'];
}

function updateSubjectDefault(subject, fieldKeys) {
  const s    = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SUBJECT);
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === subject) {
      s.getRange(i+1,2).setValue(fieldKeys.join(','));
      return { ok: true };
    }
  }
  s.appendRow([subject, fieldKeys.join(','), '']);
  return { ok: true };
}

// ============================================================
//  単元管理
// ============================================================
function getUnitSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNITS);
}

function getAllUnits() {
  const s = getUnitSheet();
  if (!s) return [];
  const data = s.getDataRange().getValues();
  return data.slice(1)
    .filter(r => r[0] && r[6] !== '削除')
    .map(r => {
      let fields = [];
      try { fields = JSON.parse(r[5] || '[]'); } catch(e) {}
      return {
        id        : r[0],
        name      : r[1],
        subject   : r[2],
        maxPeriod : r[3] || 10,
        createdAt : r[4] ? Utilities.formatDate(new Date(r[4]),'Asia/Tokyo','yyyy/MM/dd') : '',
        fields,   // 項目定義の配列
      };
    });
}

function addUnit(name, subject, maxPeriod) {
  const s     = getUnitSheet();
  const units = getAllUnits();
  const newId = units.length > 0 ? Math.max(...units.map(u=>u.id)) + 1 : 1;
  // 教科デフォルトから項目を引き継ぐ
  const presets    = getPresets();
  const defaultKeys = getSubjectFieldKeys(subject);
  const fields     = defaultKeys
    .map(k => presets.find(p => p.key === k))
    .filter(Boolean)
    .map(p => ({ ...p, enabled: true }));

  s.appendRow([newId, name, subject, maxPeriod||10, new Date(), JSON.stringify(fields), '']);
  return { ok: true, id: newId, fields };
}

function updateUnit(id, name, subject, maxPeriod, fields) {
  const s    = getUnitSheet();
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      // 列2〜4：単元名・教科・最大時間数
      s.getRange(i+1,2,1,3).setValues([[name, subject, maxPeriod]]);
      // 列6：フィールドJSON（作成日=列5 を上書きしない）
      s.getRange(i+1,6).setValue(JSON.stringify(fields||[]));
      return { ok: true };
    }
  }
  return { ok: false };
}

function updateUnitFields(id, fields) {
  const s    = getUnitSheet();
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      s.getRange(i+1,6).setValue(JSON.stringify(fields));
      return { ok: true };
    }
  }
  return { ok: false };
}

function deleteUnit(id) {
  const s    = getUnitSheet();
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) { s.getRange(i+1,7).setValue('削除'); return { ok: true }; }
  }
  return { ok: false };
}

// ============================================================
//  アクティブ授業
// ============================================================
function getActiveSetting() {
  const cfg    = readGlobalConfig();
  const unitId = parseInt(cfg.active_unit) || 0;
  const period = parseInt(cfg.active_period) || 0;
  const units  = getAllUnits();
  const unit   = units.find(u => u.id == unitId) || null;
  return { unitId, period, unit, units };
}

function teacherStartLesson(unitId, period) {
  writeGlobalConfig('active_unit',   unitId);
  writeGlobalConfig('active_period', period);
  getOrCreateLessonSheet(unitId, period);
  return { ok: true };
}

function teacherEndLesson() {
  writeGlobalConfig('active_period', 0);
  return { ok: true };
}

// ============================================================
//  授業シート管理
// ============================================================
function getLessonSheetName(unitId, period) {
  return `授業_${unitId}_${period}`;
}

function getOrCreateLessonSheet(unitId, period) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const name = getLessonSheetName(unitId, period);
  let sheet  = ss.getSheetByName(name);
  if (sheet) return sheet;

  sheet = ss.insertSheet(name);
  const headers = ['番号','なまえ',
    'カスタム1','カスタム2','カスタム3','カスタム4','カスタム5',
    'AIコメント','ランク','メダル','前回(内部)','提出','スコア(内部)'];
  sheet.getRange(1,1,1,headers.length).setValues([headers]);
  sheet.getRange(2,1,1,headers.length).setValues([Array(headers.length).fill('')]);

  const rows = [];
  for (let i = 1; i <= MAX_STUDENTS; i++) {
    rows.push([i,'','','','','','','','','','',false,0]);
  }
  sheet.getRange(HEADER_ROWS+1, 1, MAX_STUDENTS, headers.length).setValues(rows);

  try {
    const roster = ss.getSheetByName('名簿');
    if (roster) {
      const names = roster.getRange(1,2,MAX_STUDENTS,1).getValues();
      sheet.getRange(HEADER_ROWS+1, 2, MAX_STUDENTS, 1).setValues(names);
    }
  } catch(e) {}

  return sheet;
}

// ============================================================
//  児童向け API
// ============================================================
function studentInit(num, periodOverride) {
  const active = getActiveSetting();
  const period = active.period > 0 ? active.period
               : (parseInt(periodOverride) > 0 ? parseInt(periodOverride) : 0);

  if (!active.unit || period === 0) {
    return {
      needPeriodSelect: true,
      unit  : active.unit,
      units : active.units,
      period: 0,
      presets: getPresets(),
    };
  }

  const sheet = getOrCreateLessonSheet(active.unitId, period);
  const row   = HEADER_ROWS + num;
  const vals  = sheet.getRange(row, 1, 1, 13).getValues()[0];

  // 有効な項目だけ返す
  const enabledFields = (active.unit.fields || []).filter(f => f.enabled !== false);

  // 前回ふりかえり
  let prevReview = '';
  if (period > 1) {
    const ps = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(getLessonSheetName(active.unitId, period-1));
    if (ps) {
      // ふりかえりは常に最後の有効フィールド
      const prevFields = getEnabledFields_(active.unit);
      const reviewIdx  = prevFields.findIndex(f => f.key === REVIEW_FIELD_KEY);
      if (reviewIdx >= 0) {
        prevReview = ps.getRange(row, CUSTOM_START + reviewIdx).getValue() || '';
      }
    }
  }

  return {
    needPeriodSelect: false,
    unit    : active.unit,
    period,
    fields  : enabledFields,
    num,
    name    : vals[1] || '',
    customs : [vals[2]||'', vals[3]||'', vals[4]||'', vals[5]||'', vals[6]||''],
    comment : vals[7] || '',
    rank    : vals[8] || '',
    medal   : vals[9] || '',
    medalColor: getMedalColor_(vals[9]||''),
    submitted : vals[11] === true,
    prevReview,
    teacherSetPeriod: active.period > 0,
  };
}

function getEnabledFields_(unit) {
  return (unit.fields || []).filter(f => f.enabled !== false);
}

function getTimeline(unitId, period) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(getLessonSheetName(unitId, period));
  if (!sheet) return [];
  const data = sheet.getRange(HEADER_ROWS+1, 1, MAX_STUDENTS, 13).getValues();
  return data.map((r,i) => ({
    num      : i+1,
    name     : r[1] || '',
    customs  : [r[2]||'',r[3]||'',r[4]||'',r[5]||'',r[6]||''],
    comment  : r[7] || '',
    rank     : r[8] || '',
    medal    : r[9] || '',
    medalColor: getMedalColor_(r[9]||''),
    submitted: r[11] === true,
    score    : r[12] || 0,
  }));
}

function getMedalColor_(medal) {
  const idx = MEDALS.indexOf(medal);
  return idx >= 0 ? MEDAL_COLORS[idx] : '';
}

function autoSave(unitId, period, num, customs) {
  const sheet = getOrCreateLessonSheet(unitId, period);
  const row   = HEADER_ROWS + num;
  if (customs && customs.length > 0) {
    const vals = customs.slice(0, MAX_FIELDS).map(v => v||'');
    while (vals.length < MAX_FIELDS) vals.push('');
    sheet.getRange(row, CUSTOM_START, 1, MAX_FIELDS).setValues([vals]);
  }
  return { ok: true };
}

function submitReview(unitId, period, num, customs) {
  const sheet = getOrCreateLessonSheet(unitId, period);
  const row   = HEADER_ROWS + num;

  // ふりかえりを特定（fieldsのreview項目のインデックス）
  const units  = getAllUnits();
  const unit   = units.find(u => u.id == unitId);
  const fields = getEnabledFields_(unit || {});
  const revIdx = fields.findIndex(f => f.key === REVIEW_FIELD_KEY);
  const review = revIdx >= 0 ? (customs[revIdx] || '').trim() : '';

  if (!review || review.length < 5) {
    return { ok: false, error: 'ふりかえりをもっとくわしくかいてね！' };
  }

  const prevReview = sheet.getRange(row, BASE_COL.PREV).getValue() || '';
  const isRewrite  = prevReview !== '' && prevReview !== review;

  autoSave(unitId, period, num, customs);
  sheet.getRange(row, BASE_COL.SUBMITTED).setValue(true);
  sheet.getRange(row, BASE_COL.PREV).setValue(review);

  // カスタムフィールドのまとめテキスト（AI用）
  const customText = fields
    .map((f,i) => f.label + '：' + (customs[i]||''))
    .filter((_,i) => customs[i])
    .join('\n');

  runAIForOne_(sheet, row, review, customText, isRewrite, unitId, period);
  return { ok: true, isRewrite };
}

// ============================================================
//  AI フィードバック
// ============================================================
function runAIForOne_(sheet, row, review, customText, isRewrite, unitId, period) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    sheet.getRange(row, BASE_COL.COMMENT).setValue('APIキーが設定されていません。先生に伝えてね。');
    return;
  }

  if (review.length <= 10 || /^(がんばった|たのしかった)[。！\s]*$/.test(review)) {
    sheet.getRange(row, BASE_COL.COMMENT).setValue('なにをがんばったか、くわしくかいてみよう！');
    sheet.getRange(row, BASE_COL.RANK).setValue('C');
    sheet.getRange(row, BASE_COL.SCORE).setValue(0);
    updateMedals_(sheet);
    return;
  }

  const cfg    = readGlobalConfig();
  const prompt = `${cfg.prompt_comment || 'あなたは小学3年生の担任の先生です。やさしく励ますコメントを60文字以内で書いてください。'}

${cfg.prompt_score || '自己調整学習スコア(0-7)で評価してください。'}

${customText ? '--- 児童の記録 ---\n' + customText : ''}
ふりかえり：${review}

必ず以下のJSON形式のみで返してください：
{"comment":"コメント","score":数字}`;

  try {
    const res  = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method:'post', contentType:'application/json',
        payload: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }),
        muteHttpExceptions: true }
    );
    const json   = JSON.parse(res.getContentText());
    const text   = json.candidates[0].content.parts[0].text.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(text);

    const score   = Math.max(0, Math.min(7, Math.round(parsed.score||0)));
    const rank    = RANKS[score];
    const comment = (isRewrite ? '🆕' : '') + (parsed.comment||'');

    sheet.getRange(row, BASE_COL.COMMENT).setValue(comment);
    sheet.getRange(row, BASE_COL.RANK).setValue(rank);
    sheet.getRange(row, BASE_COL.SCORE).setValue(score);
    sheet.getRange(row, BASE_COL.COMMENT).setBackground(isRewrite ? '#FFFDE7' : null);

    appendToAggregate_(sheet, row, review, comment, rank, unitId, period);
    updateMedals_(sheet);
  } catch(err) {
    sheet.getRange(row, BASE_COL.COMMENT).setValue('AIのよみこみにしっぱいしました。もういちどためしてね。');
  }
}

function updateMedals_(sheet) {
  const cfg  = readGlobalConfig();
  const top  = Math.min(parseInt(cfg.medal_top)||5, 5);
  const last = sheet.getLastRow();
  if (last < HEADER_ROWS+1) return;
  const rows      = last - HEADER_ROWS;
  const scores    = sheet.getRange(HEADER_ROWS+1, BASE_COL.SCORE,     rows, 1).getValues();
  const submitted = sheet.getRange(HEADER_ROWS+1, BASE_COL.SUBMITTED, rows, 1).getValues();
  sheet.getRange(HEADER_ROWS+1, BASE_COL.MEDAL, rows, 1).setValues(Array(rows).fill(['']));
  const ranked = scores
    .map((r,i) => ({ row:HEADER_ROWS+1+i, score:r[0], sub:submitted[i][0] }))
    .filter(r => r.sub===true && r.score>0)
    .sort((a,b) => b.score-a.score);
  ranked.slice(0,top).forEach((r,i) => sheet.getRange(r.row, BASE_COL.MEDAL).setValue(MEDALS[i]));
}

function appendToAggregate_(sheet, row, review, comment, rank, unitId, period) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const agg  = ss.getSheetByName(SHEET_AGG);
  if (!agg) return;
  const units = getAllUnits();
  const unit  = units.find(u => u.id==unitId);
  const vals  = sheet.getRange(row,1,1,2).getValues()[0];
  const date  = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd');
  agg.appendRow([unit?.name||'', unit?.subject||'', period, vals[0], vals[1], date, review, rank, comment]);
}

// ============================================================
//  先生向け API
// ============================================================
function teacherInit() {
  const cfg    = readGlobalConfig();
  const units  = getAllUnits();
  const active = getActiveSetting();
  const subjectDefaults = getSubjectDefaults();

  return {
    units, active,
    presets: getPresets(),
    subjectDefaults,
    subjects: Object.keys(subjectDefaults),
    globalCfg: {
      medal_top     : cfg.medal_top      || '5',
      prompt_comment: cfg.prompt_comment || '',
      prompt_score  : cfg.prompt_score   || '',
    },
  };
}

function getLessonStatus(unitId, period) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(getLessonSheetName(unitId, period));
  if (!sheet) return { students:[] };
  const data = sheet.getRange(HEADER_ROWS+1,1,MAX_STUDENTS,13).getValues();
  const units = getAllUnits();
  const unit  = units.find(u=>u.id==unitId);
  const fields = getEnabledFields_(unit||{});
  const revIdx = fields.findIndex(f=>f.key===REVIEW_FIELD_KEY);

  return { students: data.map((r,i) => ({
    num      : i+1,
    name     : r[1]||'',
    review   : revIdx>=0 ? r[CUSTOM_START-1+revIdx]||'' : '',
    rank     : r[8]||'',
    medal    : r[9]||'',
    medalColor: getMedalColor_(r[9]||''),
    submitted: r[11]===true,
    score    : r[12]||0,
  }))};
}

function getAggregateData(unitId) {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const agg = ss.getSheetByName(SHEET_AGG);
  if (!agg) return [];
  const units = getAllUnits();
  const data  = agg.getDataRange().getValues();
  return data.slice(1).filter(r => {
    if (!unitId) return true;
    const u = units.find(u=>u.id==unitId);
    return u && u.name===r[0];
  }).map(r => ({
    unitName:r[0], subject:r[1], period:r[2],
    num:r[3], name:r[4], date:r[5], review:r[6], rank:r[7], comment:r[8],
  }));
}

function generateUnitSummary(unitId) {
  const units = getAllUnits();
  const unit  = units.find(u=>u.id==unitId);
  if (!unit) return { ok:false, error:'単元が見つかりません' };
  const all = getAggregateData(unitId);
  if (!all.length) return { ok:false, error:'データがありません' };
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok:false, error:'APIキーが未設定です' };

  const reviews = all.map(r=>`・${r.name}(${r.period}時間目/${r.rank}): ${r.review}`).join('\n');
  const prompt  = `あなたは小学校の担任の先生です。「${unit.name}」（${unit.subject}）の全授業の児童ふりかえり一覧を読み、以下の5点について先生向け評価レポートを作成してください。
1. クラス全体の理解傾向
2. 自己調整学習の観点から優れていた児童と特徴
3. 支援が必要と思われる児童と傾向
4. 次の指導への提案
5. 単元全体を通じた児童の成長変化

ふりかえり一覧：\n${reviews}`;

  try {
    const res  = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method:'post', contentType:'application/json',
        payload: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] }),
        muteHttpExceptions:true }
    );
    const json = JSON.parse(res.getContentText());
    return { ok:true, summary:json.candidates[0].content.parts[0].text, unitName:unit.name };
  } catch(e) { return { ok:false, error:e.toString() }; }
}

// プロンプト・設定の保存
function saveGlobalSettings(medalTop, promptComment, promptScore) {
  writeGlobalConfig('medal_top',      medalTop);
  writeGlobalConfig('prompt_comment', promptComment);
  writeGlobalConfig('prompt_score',   promptScore);
  return { ok:true };
}