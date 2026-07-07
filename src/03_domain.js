// ============================================================
//  単元管理
// ============================================================
function getUnitSheet() {
  return getTenantSpreadsheet_().getSheetByName(SHEET_UNITS);
}

function ensureDbSheets_() {
  const ss = getTenantSpreadsheet_();
  ensureSheetWithHeaders_(ss, SHEET_DB_STUDENTS, STUDENT_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_LESSONS, LESSON_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_RESPONSES, RESPONSE_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_HISTORY, HISTORY_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_AUDIT, AUDIT_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_ASSESS, ASSESS_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_DB_AI_EVENTS, AI_EVENT_HEADERS);
}

function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastColumn() < headers.length) {
    sheet.insertColumnsAfter(sheet.getLastColumn() || 1, headers.length - sheet.getLastColumn());
  }
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsUpdate = headers.some((header, idx) => current[idx] !== header);
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function getDbSheet_(name) {
  ensureDbSheets_();
  return getTenantSpreadsheet_().getSheetByName(name);
}

function getStudentsDbSheet_() {
  return getDbSheet_(SHEET_DB_STUDENTS);
}

function getLessonsDbSheet_() {
  return getDbSheet_(SHEET_DB_LESSONS);
}

function getResponsesDbSheet_() {
  return getDbSheet_(SHEET_DB_RESPONSES);
}

function getResponseHistoryDbSheet_() {
  return getDbSheet_(SHEET_DB_HISTORY);
}

function getAuditLogDbSheet_() {
  return getDbSheet_(SHEET_DB_AUDIT);
}

function getTeacherAssessmentsDbSheet_() {
  return getDbSheet_(SHEET_DB_ASSESS);
}

function getTeacherCommentDraftsDbSheet_() {
  return ensureSheetWithHeaders_(getTenantSpreadsheet_(), 'TeacherCommentDrafts', TEACHER_COMMENT_DRAFT_HEADERS);
}

function getAiEventLogDbSheet_() {
  return getDbSheet_(SHEET_DB_AI_EVENTS);
}

function makeId_(prefix) {
  return `${prefix}_${Utilities.getUuid()}`;
}

function nowIso_() {
  return new Date().toISOString();
}

function listTeacherAssessments_() {
  const sheet = getTeacherAssessmentsDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, ASSESS_HEADERS.length).getValues() : [];
  return rows.map(row => ({
    assessmentId: row[0] || '',
    unitId: row[1] || '',
    studentNumber: row[2] || '',
    knowledge: row[3] || '',
    thinking: row[4] || '',
    attitude: row[5] || '',
    memo: row[6] || '',
    updatedAt: row[7] || '',
  }));
}

function listTeacherCommentDrafts_(lessonId) {
  let sheet = null;
  try {
    sheet = getTenantSpreadsheet_().getSheetByName('TeacherCommentDrafts');
  } catch (err) {
    return [];
  }
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, TEACHER_COMMENT_DRAFT_HEADERS.length).getValues() : [];
  return rows
    .map(row => ({
      draftId: row[0] || '',
      responseId: row[1] || '',
      lessonId: row[2] || '',
      unitId: row[3] || '',
      studentId: row[4] || '',
      studentNumber: row[5] || '',
      draftComment: row[6] || '',
      draftRank: row[7] || '',
      draftScore: Number(row[8] || 0),
      status: row[9] || '',
      createdAt: row[10] || '',
      updatedAt: row[11] || '',
      returnedAt: row[12] || '',
    }))
    .filter(item => !lessonId || String(item.lessonId || '') === String(lessonId || ''));
}

function saveTeacherAssessment(unitId, studentNumber, patch) {
  const normalizedUnitId = String(unitId || '').trim();
  const normalizedStudentNumber = String(studentNumber || '').trim();
  if (!normalizedUnitId) throw new Error('単元を選択してください。');
  if (!normalizedStudentNumber) throw new Error('児童番号がありません。');

  const allowed = ['knowledge', 'thinking', 'attitude', 'memo'];
  const nextPatch = {};
  allowed.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(patch || {}, key)) {
      nextPatch[key] = String(patch[key] || '').trim();
    }
  });

  const sheet = getTeacherAssessmentsDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, ASSESS_HEADERS.length).getValues() : [];
  let existingIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || '') === normalizedUnitId && String(rows[i][2] || '') === normalizedStudentNumber) {
      existingIndex = i;
      break;
    }
  }

  const before = existingIndex >= 0 ? {
    assessmentId: rows[existingIndex][0] || '',
    unitId: rows[existingIndex][1] || '',
    studentNumber: rows[existingIndex][2] || '',
    knowledge: rows[existingIndex][3] || '',
    thinking: rows[existingIndex][4] || '',
    attitude: rows[existingIndex][5] || '',
    memo: rows[existingIndex][6] || '',
    updatedAt: rows[existingIndex][7] || '',
  } : null;

  const next = {
    assessmentId: before?.assessmentId || makeId_('assess'),
    unitId: normalizedUnitId,
    studentNumber: normalizedStudentNumber,
    knowledge: nextPatch.knowledge ?? before?.knowledge ?? '',
    thinking: nextPatch.thinking ?? before?.thinking ?? '',
    attitude: nextPatch.attitude ?? before?.attitude ?? '',
    memo: nextPatch.memo ?? before?.memo ?? '',
    updatedAt: nowIso_(),
  };

  const values = [[
    next.assessmentId,
    next.unitId,
    next.studentNumber,
    next.knowledge,
    next.thinking,
    next.attitude,
    next.memo,
    next.updatedAt,
  ]];
  if (existingIndex >= 0) {
    sheet.getRange(existingIndex + 2, 1, 1, ASSESS_HEADERS.length).setValues(values);
  } else {
    sheet.getRange(lastRow + 1, 1, 1, ASSESS_HEADERS.length).setValues(values);
  }

  writeAuditLog_({
    targetType: 'teacherAssessment',
    targetId: `${normalizedUnitId}:${normalizedStudentNumber}`,
    action: before ? 'update' : 'create',
    before,
    after: next,
    actor: 'teacher',
  });
  return { ok: true, assessment: next };
}

function upsertTeacherAssessments_(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const sheet = getTeacherAssessmentsDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, ASSESS_HEADERS.length).getValues() : [];
  const indexMap = {};
  rows.forEach((row, idx) => {
    indexMap[`${String(row[1] || '')}:${String(row[2] || '')}`] = idx;
  });

  const updates = [];
  const appends = [];
  const saved = [];
  const auditLogs = [];
  list.forEach(item => {
    const normalizedUnitId = String(item.unitId || '').trim();
    const normalizedStudentNumber = String(item.studentNumber || '').trim();
    if (!normalizedUnitId || !normalizedStudentNumber) return;
    const key = `${normalizedUnitId}:${normalizedStudentNumber}`;
    const existingIndex = Object.prototype.hasOwnProperty.call(indexMap, key) ? indexMap[key] : -1;
    const before = existingIndex >= 0 ? {
      assessmentId: rows[existingIndex][0] || '',
      unitId: rows[existingIndex][1] || '',
      studentNumber: rows[existingIndex][2] || '',
      knowledge: rows[existingIndex][3] || '',
      thinking: rows[existingIndex][4] || '',
      attitude: rows[existingIndex][5] || '',
      memo: rows[existingIndex][6] || '',
      updatedAt: rows[existingIndex][7] || '',
    } : null;
    const next = {
      assessmentId: before?.assessmentId || makeId_('assess'),
      unitId: normalizedUnitId,
      studentNumber: normalizedStudentNumber,
      knowledge: String(item.knowledge ?? before?.knowledge ?? ''),
      thinking: String(item.thinking ?? before?.thinking ?? ''),
      attitude: String(item.attitude ?? before?.attitude ?? ''),
      memo: String(item.memo ?? before?.memo ?? ''),
      updatedAt: nowIso_(),
    };
    const values = [[
      next.assessmentId,
      next.unitId,
      next.studentNumber,
      next.knowledge,
      next.thinking,
      next.attitude,
      next.memo,
      next.updatedAt,
    ]];
    if (existingIndex >= 0) {
      updates.push({ rowNumber: existingIndex + 2, values });
    } else {
      appends.push(values[0]);
    }
    auditLogs.push({
      targetType: 'teacherAssessment',
      targetId: `${normalizedUnitId}:${normalizedStudentNumber}`,
      action: before ? 'batchUpdate' : 'batchCreate',
      before,
      after: next,
      actor: 'teacher-ai',
    });
    saved.push(next);
  });

  writeSheetRowBatches_(sheet, updates, ASSESS_HEADERS.length);
  if (appends.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, ASSESS_HEADERS.length).setValues(appends);
  }
  writeAuditLogs_(auditLogs);
  return saved;
}

function upsertTeacherCommentDrafts_(items, actor) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const sheet = getTeacherCommentDraftsDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, TEACHER_COMMENT_DRAFT_HEADERS.length).getValues() : [];
  const indexMap = {};
  rows.forEach((row, idx) => {
    indexMap[String(row[1] || '')] = idx;
  });

  const updates = [];
  const appends = [];
  const saved = [];
  const auditLogs = [];
  list.forEach(item => {
    const responseId = String(item.responseId || '').trim();
    if (!responseId) return;
    const existingIndex = Object.prototype.hasOwnProperty.call(indexMap, responseId) ? indexMap[responseId] : -1;
    const before = existingIndex >= 0 ? {
      draftId: rows[existingIndex][0] || '',
      responseId: rows[existingIndex][1] || '',
      lessonId: rows[existingIndex][2] || '',
      unitId: rows[existingIndex][3] || '',
      studentId: rows[existingIndex][4] || '',
      studentNumber: rows[existingIndex][5] || '',
      draftComment: rows[existingIndex][6] || '',
      draftRank: rows[existingIndex][7] || '',
      draftScore: Number(rows[existingIndex][8] || 0),
      status: rows[existingIndex][9] || '',
      createdAt: rows[existingIndex][10] || '',
      updatedAt: rows[existingIndex][11] || '',
      returnedAt: rows[existingIndex][12] || '',
    } : null;
    const next = {
      draftId: before?.draftId || makeId_('draft'),
      responseId,
      lessonId: String(item.lessonId ?? before?.lessonId ?? ''),
      unitId: String(item.unitId ?? before?.unitId ?? ''),
      studentId: String(item.studentId ?? before?.studentId ?? ''),
      studentNumber: String(item.studentNumber ?? before?.studentNumber ?? ''),
      draftComment: String(item.draftComment ?? before?.draftComment ?? ''),
      draftRank: String(item.draftRank ?? before?.draftRank ?? ''),
      draftScore: Number(item.draftScore ?? before?.draftScore ?? 0),
      status: String(item.status ?? before?.status ?? 'draft') || 'draft',
      createdAt: before?.createdAt || nowIso_(),
      updatedAt: nowIso_(),
      returnedAt: String(item.returnedAt ?? before?.returnedAt ?? ''),
    };
    const values = [[
      next.draftId,
      next.responseId,
      next.lessonId,
      next.unitId,
      next.studentId,
      next.studentNumber,
      next.draftComment,
      next.draftRank,
      next.draftScore,
      next.status,
      next.createdAt,
      next.updatedAt,
      next.returnedAt,
    ]];
    if (existingIndex >= 0) {
      updates.push({ rowNumber: existingIndex + 2, values });
    } else {
      appends.push(values[0]);
    }
    auditLogs.push({
      targetType: 'teacherCommentDraft',
      targetId: responseId,
      action: before ? 'batchUpdate' : 'batchCreate',
      before,
      after: next,
      actor: actor || 'teacher-ai-draft',
    });
    saved.push(next);
  });

  writeSheetRowBatches_(sheet, updates, TEACHER_COMMENT_DRAFT_HEADERS.length);
  if (appends.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, TEACHER_COMMENT_DRAFT_HEADERS.length).setValues(appends);
  }
  writeAuditLogs_(auditLogs);
  return saved;
}

function writeSheetRowBatches_(sheet, updates, width) {
  const list = Array.isArray(updates) ? updates.slice() : [];
  if (!sheet || !list.length || !width) return;
  list.sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0));
  let batchStart = 0;
  while (batchStart < list.length) {
    let batchEnd = batchStart + 1;
    while (
      batchEnd < list.length &&
      Number(list[batchEnd].rowNumber || 0) === Number(list[batchEnd - 1].rowNumber || 0) + 1
    ) {
      batchEnd++;
    }
    const batch = list.slice(batchStart, batchEnd);
    const startRow = Number(batch[0].rowNumber || 0);
    const values = batch.map(item => Array.isArray(item.values) ? item.values[0] : item.values).filter(Boolean);
    if (startRow > 0 && values.length) {
      sheet.getRange(startRow, 1, values.length, width).setValues(values);
    }
    batchStart = batchEnd;
  }
}

function parseAnswersJson_(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function parseFieldsJson_(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function normalizeFieldConfigArray_(fields) {
  return (Array.isArray(fields) ? fields : [])
    .filter(field => field && typeof field === 'object')
    .map(field => ({ ...field, enabled: field.enabled !== false }));
}

function getUnitById_(unitId) {
  return getAllUnits().find(unit => String(unit.id || '') === String(unitId || '')) || null;
}

function getLessonFields_(lesson, unit) {
  const lessonFields = normalizeFieldConfigArray_(lesson?.fields || []);
  if (lessonFields.length) return lessonFields;
  return normalizeFieldConfigArray_(unit?.fields || []);
}

function buildLessonRecord_(row, unit) {
  if (!row) return null;
  const lesson = {
    lessonId: row[0] || '',
    unitId: row[1] || '',
    period: row[2] || '',
    lessonDate: row[3] || '',
    status: row[4] || '',
    createdAt: row[5] || '',
    updatedAt: row[6] || '',
    fields: parseFieldsJson_(row[7]),
  };
  lesson.fields = getLessonFields_(lesson, unit);
  return lesson;
}

function listLessonRecords_() {
  const sheet = getLessonsDbSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const width = Math.max(Number(sheet.getLastColumn() || 0), LESSON_HEADERS.length);
  const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  return rows.map(row => buildLessonRecord_(row, getUnitById_(row[1]))).filter(Boolean);
}

function getLessonRecordByUnitPeriod_(unitId, period) {
  const unitKey = String(unitId || '');
  const periodKey = String(period || '');
  const rows = listLessonRecords_();
  for (let i = 0; i < rows.length; i++) {
    const lesson = rows[i];
    if (String(lesson?.unitId || '') === unitKey && String(lesson?.period || '') === periodKey) {
      return lesson;
    }
  }
  return null;
}

function getReviewField_(unit) {
  const fields = getEnabledFields_(unit || {});
  return fields.find(f => f.isReview === true)
    || fields.find(f => f.key === REVIEW_FIELD_KEY)
    || null;
}

function isUnderstandingFieldDef_(field) {
  const haystack = `${String(field?.key || '')} ${String(field?.label || '')} ${String(field?.type || '')}`.toLowerCase();
  return /理解|りかい|わか|自己評価|じこひょうか|達成|たっせい|self|score|check|eval/.test(haystack);
}

function getUnderstandingField_(unit) {
  const fields = getEnabledFields_(unit || {});
  return fields.find(field => isUnderstandingFieldDef_(field)) || null;
}

function getDomainCache_() {
  return CacheService.getScriptCache();
}

function getCachedJson_(key) {
  try {
    const cached = getDomainCache_().get(String(key || ''));
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
}

function putCachedJson_(key, value, ttlSeconds) {
  try {
    getDomainCache_().put(String(key || ''), JSON.stringify(value), ttlSeconds || 15);
  } catch (e) {}
  return value;
}

function removeDomainCacheKeys_(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  list.forEach(key => {
    try {
      getDomainCache_().remove(String(key || ''));
    } catch (e) {}
  });
}

function getRosterEntries_(includeInactive) {
  const cacheKey = includeInactive ? 'roster_entries_all_v1' : 'roster_entries_active_v1';
  const cached = getCachedJson_(cacheKey);
  if (Array.isArray(cached) && cached.length) return cached;
  const sheet = getStudentsDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, STUDENT_HEADERS.length).getValues() : [];
  const studentEntries = rows
    .map(row => ({
      studentId: row[0] || '',
      number: Number(row[1]) || 0,
      name: row[2] || '',
      active: row[3] !== false,
    }))
    .filter(entry => entry.number > 0)
    .sort((a, b) => a.number - b.number);
  const baseEntries = getLegacyRosterEntries_();
  const mergedByNumber = {};
  (baseEntries || []).forEach(entry => {
    if (!(entry && entry.number > 0)) return;
    mergedByNumber[String(entry.number)] = {
      studentId: entry.studentId || '',
      number: entry.number,
      name: entry.name || '',
      active: entry.active !== false,
    };
  });
  (studentEntries || []).forEach(entry => {
    if (!(entry && entry.number > 0)) return;
    const key = String(entry.number);
    const before = mergedByNumber[key] || { number: entry.number, name: '', active: true, studentId: '' };
    mergedByNumber[key] = {
      studentId: entry.studentId || before.studentId || '',
      number: entry.number,
      name: String(entry.name || '').trim() || before.name || '',
      active: entry.active !== false,
    };
  });
  const mergedEntries = Object.keys(mergedByNumber)
    .map(key => mergedByNumber[key])
    .filter(entry => entry.number > 0)
    .filter(entry => includeInactive ? true : entry.active)
    .sort((a, b) => a.number - b.number);
  return putCachedJson_(cacheKey, mergedEntries, 20);
}

function getLegacyRosterEntries_() {
  const roster = getTenantSpreadsheet_().getSheetByName('名簿');
  if (!roster) return buildDefaultRosterEntries_();
  const lastRow = Math.max(roster.getLastRow(), 1);
  const values = roster.getRange(1, 1, lastRow, 2).getValues();
  const entries = values
    .map((row, idx) => ({
      number: Number(row[0]) || idx + 1,
      name: row[1] || '',
      active: true,
    }))
    .filter(entry => entry.number || entry.name);
  if (entries.length) {
    return entries.sort((a, b) => a.number - b.number);
  }
  return buildDefaultRosterEntries_();
}

function buildDefaultRosterEntries_() {
  const entries = [];
  for (let i = 1; i <= MAX_STUDENTS; i++) {
    entries.push({
      number: i,
      name: '',
      active: true,
    });
  }
  return entries;
}

function saveRosterEntries(entries) {
  const sheet = getStudentsDbSheet_();
  const normalized = (entries || [])
    .map(entry => ({
      studentId: entry.studentId || makeId_('student'),
      number: Number(entry.number) || 0,
      name: String(entry.name || '').trim(),
      active: entry.active !== false,
    }))
    .filter(entry => entry.number > 0)
    .sort((a, b) => a.number - b.number);

  clearSheetBody_(sheet, STUDENT_HEADERS.length);
  if (normalized.length) {
    sheet.getRange(2, 1, normalized.length, STUDENT_HEADERS.length).setValues(normalized.map(entry => ([
      entry.studentId,
      entry.number,
      entry.name,
      entry.active,
      nowIso_(),
      nowIso_(),
    ])));
  }
  syncLegacyRosterSheet_(normalized.filter(entry => entry.active));
  removeDomainCacheKeys_(['roster_entries_active_v1', 'roster_entries_all_v1', 'student_entry_options_v1']);
  return { ok: true };
}

function clearSheetBody_(sheet, columnCount) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, columnCount).clearContent();
  }
}

function syncLegacyRosterSheet_(entries) {
  const ss = getTenantSpreadsheet_();
  let sheet = ss.getSheetByName('名簿');
  if (!sheet) sheet = ss.insertSheet('名簿');
  sheet.clearContents();
  if (!(entries || []).length) return;
  sheet.getRange(1, 1, entries.length, 2).setValues(entries.map(entry => [entry.number, entry.name || '']));
}

function getStudentEntryOptions() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('student_entry_options_v1');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.students)) {
        const shell = getLiveTenantMaintenanceState();
        return {
          ...parsed,
          shell: {
            maintenanceMode: Boolean(shell.maintenanceMode),
            noticeBanner: shell.noticeBanner || {},
            checkedAt: shell.checkedAt || '',
          },
        };
      }
    } catch (e) {}
  }
  const payload = {
    students: getRosterEntries_(),
    shell: getLiveTenantMaintenanceState(),
  };
  cache.put('student_entry_options_v1', JSON.stringify(payload), 30);
  return payload;
}

function getStudentCount_() {
  return getRosterEntries_().length;
}

function getLessonRowCount_(sheet) {
  const rosterCount = getStudentCount_();
  return Math.max(rosterCount, Math.max(sheet.getLastRow() - HEADER_ROWS, 0));
}

function buildAnswersMap_(fields, customs) {
  const map = {};
  (fields || []).forEach((field, idx) => {
    map[field.key] = customs && customs[idx] !== undefined ? customs[idx] : '';
  });
  return map;
}

function extractReviewText_(fields, answersMap) {
  const reviewField = getReviewField_({ fields });
  if (reviewField) {
    const direct = String(answersMap[reviewField.key] || '').trim();
    if (direct) return direct;
  }

  // Existing units can have field order drift between sheet columns and unit config.
  // Fall back to the last non-empty free-text style field so submissions do not fail closed.
  const fallbackField = [...(fields || [])]
    .reverse()
    .find(field => ['review', 'text'].includes(field.type) && String(answersMap[field.key] || '').trim());
  return fallbackField ? String(answersMap[fallbackField.key] || '').trim() : '';
}

function saveResponseSnapshotToDb_(unitId, period, num, studentName, fields, customs, opts) {
  const lesson = opts?.lesson || getOrCreateLesson_(unitId, period);
  const student = opts?.student || getOrCreateStudent_(num, studentName);
  const answersMap = buildAnswersMap_(fields, customs || []);
  const reviewText = extractReviewText_(fields, answersMap);
  const responseData = opts?.responseData || getResponseSheetData_();
  const existing = findResponseRow_(lesson.lessonId, student.studentId, responseData);
  const existingValues = existing ? existing.values : null;
  const isSubmitting = opts?.submitted === true;
  const shouldQueueStudentAi = isSubmitting
    && opts?.queueStudentAi === true
    && isStudentAiEnabled_();
  const submitted = isSubmitting || (existingValues ? existingValues[8] === true : false);
  const aiStatus = isSubmitting ? (shouldQueueStudentAi ? 'pending' : '') : (existingValues ? String(existingValues[16] || '') : '');
  const aiQueuedAt = isSubmitting ? (shouldQueueStudentAi ? nowIso_() : '') : (existingValues ? existingValues[17] || '' : '');
  const aiProcessedAt = isSubmitting ? '' : (existingValues ? existingValues[18] || '' : '');
  const aiError = isSubmitting ? '' : (existingValues ? existingValues[19] || '' : '');
  const aiBatchId = isSubmitting ? '' : (existingValues ? existingValues[20] || '' : '');
  const aiRetryCount = isSubmitting ? 0 : (existingValues ? Number(existingValues[21] || 0) : 0);
  const aiStartedAt = isSubmitting ? '' : (existingValues ? existingValues[22] || '' : '');
  const aiLatencyMs = isSubmitting ? 0 : (existingValues ? Number(existingValues[23] || 0) : 0);
  const aiModelLatencyMs = isSubmitting ? 0 : (existingValues ? Number(existingValues[24] || 0) : 0);
  const score = isSubmitting ? 0 : (existingValues ? existingValues[10] : 0);
  const rank = isSubmitting ? '' : (existingValues ? existingValues[11] : '');
  const medal = isSubmitting ? '' : (existingValues ? existingValues[12] : '');
  const comment = isSubmitting ? '' : (existingValues ? existingValues[13] : '');
  const hadPreviousReview = existingValues ? String(existingValues[7] || '') : '';
  const wasRewrite = opts?.isRewrite === true
    || (isSubmitting
      ? (hadPreviousReview !== '' && hadPreviousReview !== reviewText)
      : (existingValues ? existingValues[14] === true : false));
  const row = upsertResponse_({
    responseId: existingValues ? existingValues[0] : '',
    lessonId: lesson.lessonId,
    unitId,
    studentId: student.studentId,
    studentNumber: num,
    studentName: studentName || student.name || '',
    answersMap,
    reviewText,
    submitted,
    submittedAt: isSubmitting ? nowIso_() : (existingValues ? existingValues[9] : ''),
    score,
    rank,
    medal,
    comment,
    isRewrite: wasRewrite,
    aiStatus,
    aiQueuedAt,
    aiProcessedAt,
    aiError,
    aiBatchId,
    aiRetryCount,
    aiStartedAt,
    aiLatencyMs,
    aiModelLatencyMs,
  }, existing);
  let historyEntry = null;
  if (isSubmitting) {
    historyEntry = {
      responseId: row.responseId,
      lessonId: lesson.lessonId,
      studentId: student.studentId,
      answersMap,
      reviewText,
      score,
      rank,
      medal,
      comment,
      editType: wasRewrite ? 'rewrite' : 'submit',
    };
    if (opts?.deferHistory !== true) {
      appendResponseHistory_(historyEntry);
    }
  }
  return {
    lesson,
    student,
    responseId: row.responseId,
    reviewText,
    answersMap,
    historyEntry,
    isRewrite: wasRewrite,
  };
}

function updateResponseAiResult_(lessonId, studentId, result) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_AI_RESULT_MS)) {
    throw new Error('AI結果の保存が混み合っています。少し後にもう一度確認してください。');
  }
  try {
    const existing = findResponseRow_(lessonId, studentId, getResponseSheetData_());
    if (!existing) return;
    const row = existing.values.slice();
    row[10] = result.score ?? row[10];
    row[11] = result.rank ?? row[11];
    row[12] = result.medal ?? row[12];
    row[13] = result.comment ?? row[13];
    row[15] = nowIso_();
    row[16] = result.aiStatus ?? row[16];
    row[17] = result.aiQueuedAt ?? row[17];
    row[18] = result.aiProcessedAt ?? row[18];
    row[19] = result.aiError ?? row[19];
    row[20] = result.aiBatchId ?? row[20];
    row[21] = Number(result.aiRetryCount ?? row[21] ?? 0);
    row[22] = result.aiStartedAt ?? row[22];
    row[23] = Number(result.aiLatencyMs ?? row[23] ?? 0);
    row[24] = Number(result.aiModelLatencyMs ?? row[24] ?? 0);
    getResponsesDbSheet_().getRange(existing.rowNumber, 1, 1, row.length).setValues([row]);
  } finally {
    lock.releaseLock();
  }
}

function getResponseRecord_(lessonId, studentId) {
  const existing = findResponseRow_(lessonId, studentId);
  if (!existing) return null;
  return mapResponseRow_(existing.values);
}

function listResponsesForLesson_(lessonId) {
  return getResponseSheetData_().rows
    .filter(row => String(row[1] || '') === String(lessonId))
    .map(mapResponseRow_);
}

function mapResponseRow_(row) {
  return {
    responseId: row[0] || '',
    lessonId: row[1] || '',
    unitId: row[2] || '',
    studentId: row[3] || '',
    studentNumber: row[4] || '',
    studentName: row[5] || '',
    answersJson: row[6] || '',
    answersMap: parseAnswersJson_(row[6]),
    reviewText: row[7] || '',
    submitted: row[8] === true,
    submittedAt: row[9] || '',
    score: row[10] || 0,
    rank: row[11] || '',
    medal: row[12] || '',
    comment: row[13] || '',
    isRewrite: row[14] === true,
    updatedAt: row[15] || '',
    aiStatus: row[16] || '',
    aiQueuedAt: row[17] || '',
    aiProcessedAt: row[18] || '',
    aiError: row[19] || '',
    aiBatchId: row[20] || '',
    aiRetryCount: Number(row[21] || 0),
    aiStartedAt: row[22] || '',
    aiLatencyMs: Number(row[23] || 0),
    aiModelLatencyMs: Number(row[24] || 0),
  };
}

function isAiLoadTestResponse_(response) {
  if (!response) return false;
  return String(response.reviewText || '').includes(AI_LOAD_TEST_PREFIX)
    || String(response.studentName || '').includes(AI_LOAD_TEST_PREFIX)
    || String(response.studentId || '').startsWith(AI_LOAD_TEST_LESSON_PREFIX)
    || String(response.lessonId || '').startsWith(AI_LOAD_TEST_LESSON_PREFIX);
}

function mapAnswersToCustoms_(fields, answersMap) {
  return (fields || []).map(field => answersMap[field.key] || '');
}

function parseIsoMs_(value) {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? ts : null;
}

function calcAiElapsedMs_(startedAt, endedAt) {
  const startMs = parseIsoMs_(startedAt);
  const endMs = parseIsoMs_(endedAt) || Date.now();
  if (!startMs) return 0;
  return Math.max(0, endMs - startMs);
}

function formatDurationShort_(ms) {
  const num = Number(ms || 0);
  if (!Number.isFinite(num) || num <= 0) return '';
  if (num < 1000) return `${num}ms`;
  return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}s`;
}

function getPreviousReviewFromDb_(unitId, period, studentNumber, unit) {
  if (period <= 1) return '';
  const previousLesson = getLessonsDbSheet_()
    .getDataRange()
    .getValues()
    .slice(1)
    .find(row => String(row[1] || '') === String(unitId) && String(row[2] || '') === String(period - 1));
  if (!previousLesson) return '';
  const student = getOrCreateStudent_(studentNumber, '');
  const response = getResponseRecord_(previousLesson[0], student.studentId);
  if (response && response.reviewText) return response.reviewText;
  return '';
}

function getOrCreateStudent_(number, name) {
  const sheet = getStudentsDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, STUDENT_HEADERS.length).getValues() : [];
  const normalizedNumber = String(number || '');
  const normalizedName = String(name || '');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[1] || '') === normalizedNumber && row[3] !== false) {
      if (normalizedName && row[2] !== normalizedName) {
        sheet.getRange(i + 2, 3).setValue(normalizedName);
        sheet.getRange(i + 2, 6).setValue(nowIso_());
      }
      return {
        studentId: row[0],
        number: row[1],
        name: normalizedName || row[2] || '',
      };
    }
  }

  const student = {
    studentId: makeId_('student'),
    number: Number(number) || number,
    name: normalizedName,
    active: true,
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
  };
  sheet.appendRow([
    student.studentId,
    student.number,
    student.name,
    student.active,
    student.createdAt,
    student.updatedAt,
  ]);
  return student;
}

function getOrCreateLesson_(unitId, period, lessonDate) {
  const sheet = getLessonsDbSheet_();
  const unit = getUnitById_(unitId);
  const existing = getLessonRecordByUnitPeriod_(unitId, period);
  if (existing) return existing;

  const fields = normalizeFieldConfigArray_(unit?.fields || []);
  const lesson = {
    lessonId: makeId_('lesson'),
    unitId,
    period,
    lessonDate: lessonDate || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd'),
    status: 'active',
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
    fields,
  };
  sheet.appendRow([
    lesson.lessonId,
    lesson.unitId,
    lesson.period,
    lesson.lessonDate,
    lesson.status,
    lesson.createdAt,
    lesson.updatedAt,
    JSON.stringify(fields),
  ]);
  return lesson;
}

function getResponseSheetData_() {
  const sheet = getResponsesDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, RESPONSE_HEADERS.length).getValues()
    : [];
  return { sheet, rows, lastRow };
}

function findResponseRow_(lessonId, studentId, responseData) {
  const rows = (responseData && responseData.rows) || [];
  const sourceRows = responseData ? rows : getResponseSheetData_().rows;
  for (let i = 0; i < sourceRows.length; i++) {
    const row = sourceRows[i];
    if (String(row[1] || '') === String(lessonId) && String(row[3] || '') === String(studentId)) {
      return { rowNumber: i + 2, values: row };
    }
  }
  return null;
}

function findResponseRowByResponseId_(responseId, responseData) {
  const targetId = String(responseId || '').trim();
  if (!targetId) return null;
  const rows = (responseData && responseData.rows) || [];
  const sourceRows = responseData ? rows : getResponseSheetData_().rows;
  for (let i = 0; i < sourceRows.length; i++) {
    const row = sourceRows[i];
    if (String(row[0] || '').trim() === targetId) {
      return { rowNumber: i + 2, values: row };
    }
  }
  return null;
}

function upsertResponse_(params, existing) {
  const sheet = getResponsesDbSheet_();
  const row = [
    params.responseId || makeId_('response'),
    params.lessonId || '',
    params.unitId || '',
    params.studentId || '',
    params.studentNumber || '',
    params.studentName || '',
    JSON.stringify(params.answersMap || {}),
    params.reviewText || '',
    params.submitted === true,
    params.submittedAt || '',
    params.score || 0,
    params.rank || '',
    params.medal || '',
    params.comment || '',
    params.isRewrite === true,
    nowIso_(),
    params.aiStatus || '',
    params.aiQueuedAt || '',
    params.aiProcessedAt || '',
    params.aiError || '',
    params.aiBatchId || '',
    Number(params.aiRetryCount || 0),
    params.aiStartedAt || '',
    Number(params.aiLatencyMs || 0),
    Number(params.aiModelLatencyMs || 0),
  ];
  if (existing) {
    row[0] = existing.values[0] || row[0];
    sheet.getRange(existing.rowNumber, 1, 1, row.length).setValues([row]);
    return { rowNumber: existing.rowNumber, responseId: row[0] };
  }
  sheet.appendRow(row);
  return { rowNumber: sheet.getLastRow(), responseId: row[0] };
}

function appendResponseHistory_(params) {
  const sheet = getResponseHistoryDbSheet_();
  sheet.appendRow([
    makeId_('history'),
    params.responseId || '',
    params.lessonId || '',
    params.studentId || '',
    JSON.stringify(params.answersMap || {}),
    params.reviewText || '',
    params.score || 0,
    params.rank || '',
    params.medal || '',
    params.comment || '',
    params.editedBy || '',
    nowIso_(),
    params.editType || 'system',
  ]);
}

function writeAuditLog_(params) {
  writeAuditLogs_([params]);
}

function writeAuditLogs_(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return;
  const sheet = getAuditLogDbSheet_();
  const rows = list.map(params => [
    makeId_('audit'),
    params.targetType || '',
    params.targetId || '',
    params.action || '',
    JSON.stringify(params.before || null),
    JSON.stringify(params.after || null),
    params.actor || '',
    nowIso_(),
  ]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, AUDIT_HEADERS.length).setValues(rows);
}

function buildAiEventRow_(params) {
  return [
    makeId_('aievent'),
    params.responseId || '',
    params.lessonId || '',
    params.unitId || '',
    params.studentId || '',
    params.studentNumber || '',
    params.studentName || '',
    params.batchId || '',
    params.eventType || '',
    params.aiStatus || '',
    String(params.detail || '').slice(0, 500),
    params.timestamp || nowIso_(),
    Number(params.latencyMs || 0),
    Number(params.modelLatencyMs || 0),
    Number(params.retryCount || 0),
  ];
}

function writeAiEventLogs_(events) {
  const rows = (events || []).filter(Boolean).map(buildAiEventRow_);
  if (!rows.length) return;
  const sheet = getAiEventLogDbSheet_();
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, AI_EVENT_HEADERS.length).setValues(rows);
  maybePurgeOldAiLogs_();
}

function maybePurgeOldAiLogs_() {
  const props = getScriptProperties_();
  const nowMs = Date.now();
  const lastPurgedAtMs = Number(props.getProperty(AI_LOG_PURGE_AT_KEY) || 0);
  if (lastPurgedAtMs && (nowMs - lastPurgedAtMs) < AI_LOG_PURGE_INTERVAL_MS) return;
  purgeAiLogsOlderThanDays_(AI_LOG_RETENTION_DAYS);
  props.setProperty(AI_LOG_PURGE_AT_KEY, String(nowMs));
}

function purgeAiLogsOlderThanDays_(days) {
  const retentionDays = Math.max(1, Number(days || AI_LOG_RETENTION_DAYS) || AI_LOG_RETENTION_DAYS);
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const sheet = getAiEventLogDbSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { deleted: 0, remaining: 0, days: retentionDays };
  const rows = sheet.getRange(2, 1, lastRow - 1, AI_EVENT_HEADERS.length).getValues();
  const keptRows = [];
  let deleted = 0;
  rows.forEach(row => {
    const rawTimestamp = row[11];
    const timestampMs = rawTimestamp ? new Date(rawTimestamp).getTime() : NaN;
    if (!Number.isFinite(timestampMs) || timestampMs >= cutoffMs) {
      keptRows.push(row);
      return;
    }
    deleted++;
  });
  sheet.clearContents();
  sheet.getRange(1, 1, 1, AI_EVENT_HEADERS.length).setValues([AI_EVENT_HEADERS]);
  if (keptRows.length) {
    sheet.getRange(2, 1, keptRows.length, AI_EVENT_HEADERS.length).setValues(keptRows);
  }
  return { deleted, remaining: keptRows.length, days: retentionDays };
}

function buildAiItemEvents_(items, eventType, options) {
  const timestamp = options?.timestamp || nowIso_();
  return (items || []).map(item => ({
    responseId: item.responseId || '',
    lessonId: item.lessonId || '',
    unitId: item.unitId || '',
    studentId: item.studentId || '',
    studentNumber: item.studentNumber || '',
    studentName: item.studentName || '',
    batchId: options?.batchId || item.aiBatchId || '',
    eventType,
    aiStatus: options?.aiStatus || item.aiStatus || '',
    detail: options?.detail || '',
    timestamp,
    latencyMs: Number(options?.latencyMs || 0),
    modelLatencyMs: Number(options?.modelLatencyMs || 0),
    retryCount: Number(options?.retryCount ?? item.aiRetryCount ?? 0),
  }));
}

function writeAiEventsForUpdates_(updates) {
  const events = [];
  (updates || []).forEach(update => {
    const status = String(update.aiStatus || '');
    if (status === 'done') {
      events.push({
        responseId: update.responseId || '',
        lessonId: update.lessonId || '',
        unitId: update.unitId || '',
        studentId: update.studentId || '',
        studentNumber: update.studentNumber || '',
        studentName: update.studentName || '',
        batchId: update.aiBatchId || '',
        eventType: 'completed',
        aiStatus: status,
        detail: String(update.comment || '').slice(0, 160),
        timestamp: update.aiProcessedAt || nowIso_(),
        latencyMs: Number(update.aiLatencyMs || 0),
        modelLatencyMs: Number(update.aiModelLatencyMs || 0),
        retryCount: Number(update.aiRetryCount || 0),
      });
      return;
    }
    if (status === 'pending') {
      events.push({
        responseId: update.responseId || '',
        lessonId: update.lessonId || '',
        unitId: update.unitId || '',
        studentId: update.studentId || '',
        studentNumber: update.studentNumber || '',
        studentName: update.studentName || '',
        batchId: update.aiBatchId || '',
        eventType: 'retry_scheduled',
        aiStatus: status,
        detail: update.aiError || '',
        timestamp: update.aiProcessedAt || nowIso_(),
        latencyMs: Number(update.aiLatencyMs || 0),
        modelLatencyMs: Number(update.aiModelLatencyMs || 0),
        retryCount: Number(update.aiRetryCount || 0),
      });
      return;
    }
    if (status === 'error') {
      events.push({
        responseId: update.responseId || '',
        lessonId: update.lessonId || '',
        unitId: update.unitId || '',
        studentId: update.studentId || '',
        studentNumber: update.studentNumber || '',
        studentName: update.studentName || '',
        batchId: update.aiBatchId || '',
        eventType: 'failed',
        aiStatus: status,
        detail: update.aiError || '',
        timestamp: update.aiProcessedAt || nowIso_(),
        latencyMs: Number(update.aiLatencyMs || 0),
        modelLatencyMs: Number(update.aiModelLatencyMs || 0),
        retryCount: Number(update.aiRetryCount || 0),
      });
    }
  });
  writeAiEventLogs_(events);
}

function migrateLessonSheetsToDb_() {
  ensureDbSheets_();
  const ss = getTenantSpreadsheet_();
  const lessonSheets = ss.getSheets().filter(sheet => /^授業_(\d+)_(\d+)$/.test(sheet.getName()));
  const units = getAllUnits();
  let migratedLessons = 0;
  let migratedResponses = 0;

  lessonSheets.forEach(sheet => {
    const match = sheet.getName().match(/^授業_(\d+)_(\d+)$/);
    if (!match) return;
    const unitId = Number(match[1]);
    const period = Number(match[2]);
    const unit = units.find(u => Number(u.id) === unitId);
    if (!unit) return;

    const lesson = getOrCreateLesson_(unitId, period);
    const rowCount = Math.max(sheet.getLastRow() - HEADER_ROWS, 0);
    if (rowCount <= 0) return;

    const rows = sheet.getRange(HEADER_ROWS + 1, 1, rowCount, 13).getValues();
    const fields = getEnabledFields_(unit);

    rows.forEach(row => {
      const number = row[0];
      const studentName = row[1] || '';
      if (!number && !studentName) return;

      const customs = [row[2] || '', row[3] || '', row[4] || '', row[5] || '', row[6] || ''];
      const answersMap = buildAnswersMap_(fields, customs);
      const reviewText = extractReviewText_(fields, answersMap);
      const hasPayload = customs.some(Boolean) || row[7] || row[8] || row[9] || row[11] === true || row[12];
      if (!hasPayload) return;

      const student = getOrCreateStudent_(number, studentName);
      const existing = findResponseRow_(lesson.lessonId, student.studentId);
      upsertResponse_({
        responseId: existing ? existing.values[0] : '',
        lessonId: lesson.lessonId,
        unitId,
        studentId: student.studentId,
        studentNumber: number,
        studentName: studentName || student.name || '',
        answersMap,
        reviewText,
        submitted: row[11] === true,
        submittedAt: row[11] === true ? nowIso_() : '',
        score: row[12] || 0,
        rank: row[8] || '',
        medal: row[9] || '',
        comment: row[7] || '',
        isRewrite: false,
        aiStatus: row[7] || row[8] || row[9] || row[12] ? 'done' : '',
        aiQueuedAt: '',
        aiProcessedAt: row[7] || row[8] || row[9] || row[12] ? nowIso_() : '',
        aiError: '',
        aiBatchId: '',
      });
      migratedResponses++;
    });

    migratedLessons++;
  });

  return {
    ok: true,
    migratedLessons,
    migratedResponses,
  };
}

function getAllUnits() {
  const cached = getCachedJson_('all_units_v1');
  if (Array.isArray(cached)) return cached;
  const s = getUnitSheet();
  if (!s) return [];
  const data = s.getDataRange().getValues();
  const units = data.slice(1)
    .filter(r => r[0] && r[6] !== '削除')
    .map(r => {
      let fields = [];
      try { fields = JSON.parse(r[5] || '[]'); } catch(e) {}
      const createdDate = r[4] ? new Date(r[4]) : null;
      const createdAtValue = createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.getTime() : 0;
      return {
        id        : r[0],
        name      : r[1],
        subject   : r[2],
        maxPeriod : r[3] || 10,
        createdAt : createdAtValue ? Utilities.formatDate(createdDate,'Asia/Tokyo','yyyy/MM/dd') : '',
        createdAtValue,
        fields,   // 項目定義の配列
      };
    });
  return putCachedJson_('all_units_v1', units, 20);
}

function getLessonRecordById_(lessonId) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return null;
  return listLessonRecords_().find(lesson => String(lesson.lessonId || '') === normalizedLessonId) || null;
}

function addUnit(name, subject, maxPeriod) {
  return saveUnit({
    name,
    subject,
    maxPeriod,
  });
}

function updateUnit(id, name, subject, maxPeriod, fields) {
  return saveUnit({
    id,
    name,
    subject,
    maxPeriod,
    fields,
  });
}

function saveUnit(params) {
  const payload = params || {};
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const requestToken = String(payload.requestToken || '').trim();
    if (requestToken) {
      const cached = getSavedUnitRequestResult_(requestToken);
      if (cached) return cached;
    }
    const s = getUnitSheet();
    const data = s.getDataRange().getValues();
    const normalizedId = String(payload.id || '').trim();
    const normalizedName = String(payload.name || '').trim();
    const normalizedSubject = String(payload.subject || '').trim();
    const numericMax = Number(payload.maxPeriod);
    if (!normalizedName) throw new Error('単元名を入力してください。');
    if (normalizedSubject && SUBJECTS.indexOf(normalizedSubject) === -1) {
      throw new Error('教科の値が不正です。');
    }
    if (!Number.isFinite(numericMax) || numericMax < 0 || numericMax > 99 || Math.floor(numericMax) !== numericMax) {
      throw new Error('最大時間数は 0〜99 の整数で入力してください。');
    }
    const safeFieldsSource = Array.isArray(payload.fields)
      ? payload.fields
      : getSubjectDefaultFields(normalizedSubject).map(field => ({ ...field, enabled: field.enabled !== false }));
    const safeFields = safeFieldsSource.map(field => ({ ...field, enabled: field && field.enabled !== false }));
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '') === normalizedId) {
        rowIndex = i;
        break;
      }
    }
    let unitId = normalizedId;
    let createdAt = new Date();
    if (rowIndex >= 0) {
      createdAt = data[rowIndex][4] || createdAt;
      s.getRange(rowIndex + 1, 2).setValue(normalizedName);
      s.getRange(rowIndex + 1, 3).setValue(normalizedSubject);
      s.getRange(rowIndex + 1, 4).setValue(numericMax);
      s.getRange(rowIndex + 1, 6).setValue(JSON.stringify(safeFields));
      s.getRange(rowIndex + 1, 7).setValue('');
    } else {
      const activeIds = data.slice(1)
        .filter(row => row[0] && row[6] !== '削除')
        .map(row => Number(row[0]) || 0);
      unitId = String(activeIds.length ? Math.max.apply(null, activeIds) + 1 : 1);
      s.appendRow([unitId, normalizedName, normalizedSubject, numericMax, createdAt, JSON.stringify(safeFields), '']);
    }
    removeDomainCacheKeys_('all_units_v1');
    const result = {
      ok: true,
      id: unitId,
      unit: {
        id: unitId,
        name: normalizedName,
        subject: normalizedSubject,
        maxPeriod: numericMax,
        createdAt: Utilities.formatDate(new Date(createdAt), 'Asia/Tokyo', 'yyyy/MM/dd'),
        createdAtValue: Number(new Date(createdAt).getTime()) || 0,
        fields: safeFields,
      },
    };
    if (requestToken) putSavedUnitRequestResult_(requestToken, result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function getSavedUnitRequestResult_(requestToken) {
  const token = String(requestToken || '').trim();
  if (!token) return null;
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(`unit_save_${token}`);
    return raw ? JSON.parse(raw) : null;
  } catch (_err) {
    return null;
  }
}

function putSavedUnitRequestResult_(requestToken, result) {
  const token = String(requestToken || '').trim();
  if (!token) return;
  try {
    CacheService.getScriptCache().put(`unit_save_${token}`, JSON.stringify(result || {}), 300);
  } catch (_err) {}
}

function updateUnitFields(id, fields) {
  const s    = getUnitSheet();
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      s.getRange(i+1,6).setValue(JSON.stringify(fields));
      removeDomainCacheKeys_('all_units_v1');
      return { ok: true };
    }
  }
  return { ok: false };
}

function deleteUnit(id) {
  const s    = getUnitSheet();
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      s.getRange(i+1,7).setValue('削除');
      removeDomainCacheKeys_('all_units_v1');
      return { ok: true };
    }
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
  const timelineFieldKey = String(cfg.active_timeline_field || '');
  const units  = getAllUnits();
  const unit   = units.find(u => u.id == unitId) || null;
  const lesson = unit && period > 0 ? getLessonRecordByUnitPeriod_(unitId, period) : null;
  const fields = getLessonFields_(lesson, unit);
  return { unitId, period, unit, units, lesson, fields, timelineFieldKey };
}

function teacherStartLesson(unitId, period) {
  writeGlobalConfigBatch({
    active_unit: unitId,
    active_period: period,
    active_timeline_field: '',
  });
  const lesson = getOrCreateLesson_(unitId, period);
  return {
    ok: true,
    lesson,
    active: getActiveSetting(),
    unitProgress: getTeacherUnitProgress_(),
    status: getLessonStatus(unitId, period),
  };
}

function teacherEndLesson() {
  writeGlobalConfigBatch({
    active_period: 0,
    active_timeline_field: '',
  });
  return { ok: true };
}

function setActiveTimelineField(fieldKey) {
  writeGlobalConfig('active_timeline_field', String(fieldKey || ''));
  return { ok: true };
}

function teacherAwardMedals(unitId, period) {
  const lesson = getOrCreateLesson_(unitId, period);
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    recalcLessonMedalsFromDb_(lesson.lessonId);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function getLessonFieldConfig(unitId, period) {
  const unit = getUnitById_(unitId);
  if (!unit) throw new Error('単元が見つかりません。');
  const lesson = getOrCreateLesson_(unitId, period);
  return {
    ok: true,
    unit: {
      id: unit.id,
      name: unit.name,
      subject: unit.subject,
      maxPeriod: unit.maxPeriod,
      createdAt: unit.createdAt,
    },
    lesson: {
      lessonId: lesson.lessonId,
      unitId: lesson.unitId,
      period: lesson.period,
      lessonDate: lesson.lessonDate,
      status: lesson.status,
    },
    fields: getLessonFields_(lesson, unit),
  };
}

function saveLessonFieldConfig(unitId, period, fields) {
  const normalizedUnitId = String(unitId || '').trim();
  const normalizedPeriod = parseInt(period, 10) || 0;
  if (!normalizedUnitId || normalizedPeriod <= 0) throw new Error('時間の情報が不正です。');
  const unit = getUnitById_(normalizedUnitId);
  if (!unit) throw new Error('単元が見つかりません。');
  const nextFields = normalizeFieldConfigArray_(fields);
  if (!nextFields.length) throw new Error('項目を1つ以上設定してください。');

  const sheet = getLessonsDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, LESSON_HEADERS.length).getValues() : [];
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || '') === normalizedUnitId && String(rows[i][2] || '') === String(normalizedPeriod)) {
      const updatedAt = nowIso_();
      sheet.getRange(i + 2, 7).setValue(updatedAt);
      sheet.getRange(i + 2, 8).setValue(JSON.stringify(nextFields));
      const lesson = buildLessonRecord_([
        rows[i][0],
        rows[i][1],
        rows[i][2],
        rows[i][3],
        rows[i][4],
        rows[i][5],
        updatedAt,
        JSON.stringify(nextFields),
      ], unit);
      return { ok: true, unit, lesson, fields: lesson.fields };
    }
  }

  getOrCreateLesson_(normalizedUnitId, normalizedPeriod);
  return saveLessonFieldConfig(normalizedUnitId, normalizedPeriod, nextFields);
}

// ============================================================
//  授業シート管理
// ============================================================
function getLessonSheetName(unitId, period) {
  return `授業_${unitId}_${period}`;
}

function getOrCreateLessonSheet(unitId, period) {
  return null;
}

function getLessonRowByStudentNumber_(sheet, studentNumber) {
  const rowCount = Math.max(sheet.getLastRow() - HEADER_ROWS, 0);
  if (rowCount <= 0) return HEADER_ROWS + Number(studentNumber || 0);
  const numbers = sheet.getRange(HEADER_ROWS + 1, BASE_COL.NUM, rowCount, 1).getValues();
  for (let i = 0; i < numbers.length; i++) {
    if (String(numbers[i][0] || '') === String(studentNumber || '')) {
      return HEADER_ROWS + 1 + i;
    }
  }
  return HEADER_ROWS + Number(studentNumber || 0);
}

