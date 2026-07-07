const PORTABLE_MIGRATION_SOURCE_SPREADSHEET_ID = '1awdWJ9mmKsGm52o3ak-bZU-98qYm86Qgj44lMiuQjrw';
const PORTABLE_MIGRATION_TARGET_SPREADSHEET_ID = '1gm36zmtBBlbOYqO68PECO4RYJJ1HscjElUPCfDv5y9s';
const PORTABLE_MIGRATION_SHEETS = [
  SHEET_CFG,
  SHEET_SUBJECT,
  SHEET_UNITS,
  SHEET_AGG,
  SHEET_FIELD_PRESETS,
  '名簿',
  SHEET_DB_STUDENTS,
  SHEET_DB_LESSONS,
  SHEET_DB_RESPONSES,
  SHEET_DB_HISTORY,
  SHEET_DB_AUDIT,
  SHEET_DB_ASSESS,
  'TeacherCommentDrafts',
  SHEET_DB_AI_EVENTS,
];

function previewPortableDataMigration() {
  return previewSpreadsheetDataMigration_(
    PORTABLE_MIGRATION_SOURCE_SPREADSHEET_ID,
    PORTABLE_MIGRATION_TARGET_SPREADSHEET_ID
  );
}

function migratePortableDataFromCurrentGas() {
  return migrateSpreadsheetData_(
    PORTABLE_MIGRATION_SOURCE_SPREADSHEET_ID,
    PORTABLE_MIGRATION_TARGET_SPREADSHEET_ID
  );
}

function previewSpreadsheetDataMigration_(sourceSpreadsheetId, targetSpreadsheetId) {
  const source = SpreadsheetApp.openById(String(sourceSpreadsheetId || '').trim());
  const target = SpreadsheetApp.openById(String(targetSpreadsheetId || '').trim());
  const summary = buildSpreadsheetMigrationSummary_(source, target);
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

function migrateSpreadsheetData_(sourceSpreadsheetId, targetSpreadsheetId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const source = SpreadsheetApp.openById(String(sourceSpreadsheetId || '').trim());
    const target = SpreadsheetApp.openById(String(targetSpreadsheetId || '').trim());
    const summary = buildSpreadsheetMigrationSummary_(source, target);
    if (summary.legacyLessonSheetCount > 0 && summary.dbResponseRowCount === 0) {
      throw new Error('移行元に旧 授業_ シートが残っています。先に旧GAS側で DB 形式へ変換してから再実行してください。');
    }

    ensureMigrationTargetSheets_(target);

    const copiedSheets = [];
    const skippedSheets = [];
    PORTABLE_MIGRATION_SHEETS.forEach(name => {
      const sourceSheet = source.getSheetByName(name);
      if (!sourceSheet) {
        skippedSheets.push({ sheetName: name, reason: 'missing_in_source' });
        return;
      }
      backupTargetSheetForMigration_(target, name);
      const values = readWholeSheetValues_(sourceSheet);
      resetRowsSheet_(target, name, values);
      copiedSheets.push({
        sheetName: name,
        rows: values.length,
        columns: Math.max(...values.map(row => row.length), 0),
      });
    });

    const result = {
      ok: true,
      sourceSpreadsheetId: source.getId(),
      targetSpreadsheetId: target.getId(),
      copiedSheets,
      skippedSheets,
      legacyLessonSheetCount: summary.legacyLessonSheetCount,
      dbResponseRowCount: summary.dbResponseRowCount,
      migratedAt: nowIso_(),
    };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function buildSpreadsheetMigrationSummary_(source, target) {
  const sourceSheets = source.getSheets().map(sheet => sheet.getName());
  const targetSheets = target.getSheets().map(sheet => sheet.getName());
  const legacyLessonSheetCount = sourceSheets.filter(name => /^授業_(\d+)_(\d+)$/.test(name)).length;
  const responsesSheet = source.getSheetByName(SHEET_DB_RESPONSES);
  const dbResponseRowCount = responsesSheet ? Math.max(responsesSheet.getLastRow() - 1, 0) : 0;
  return {
    sourceSpreadsheetId: source.getId(),
    sourceSpreadsheetName: source.getName(),
    targetSpreadsheetId: target.getId(),
    targetSpreadsheetName: target.getName(),
    sourceSheets,
    targetSheets,
    legacyLessonSheetCount,
    dbResponseRowCount,
    willCopySheets: PORTABLE_MIGRATION_SHEETS.filter(name => sourceSheets.includes(name)),
    missingSourceSheets: PORTABLE_MIGRATION_SHEETS.filter(name => !sourceSheets.includes(name)),
  };
}

function ensureMigrationTargetSheets_(ss) {
  ensureSheetWithHeaders_(ss, SHEET_DB_STUDENTS, STUDENT_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_LESSONS, LESSON_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_RESPONSES, RESPONSE_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_HISTORY, HISTORY_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_AUDIT, AUDIT_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_ASSESS, ASSESS_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_AI_EVENTS, AI_EVENT_HEADERS);
  ensureSheetWithHeaders_(ss, 'TeacherCommentDrafts', TEACHER_COMMENT_DRAFT_HEADERS);
}

function readWholeSheetValues_(sheet) {
  const lastRow = Math.max(Number(sheet.getLastRow() || 0), 1);
  const lastColumn = Math.max(Number(sheet.getLastColumn() || 0), 1);
  return sheet.getRange(1, 1, lastRow, lastColumn).getValues();
}

function backupTargetSheetForMigration_(ss, sheetName) {
  const original = ss.getSheetByName(sheetName);
  if (!original) return null;
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const backupName = buildMigrationBackupSheetName_(sheetName, stamp);
  const copy = original.copyTo(ss).setName(backupName);
  copy.hideSheet();
  return backupName;
}

function buildMigrationBackupSheetName_(sheetName, stamp) {
  const prefix = `_backup_${stamp}_`;
  const maxLength = 99;
  const available = Math.max(maxLength - prefix.length, 1);
  return `${prefix}${String(sheetName || '').slice(0, available)}`;
}
