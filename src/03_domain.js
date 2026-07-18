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
  ensureSheetWithHeaders_(ss, SHEET_DB_LESSON_LIVE_STATE, LESSON_LIVE_STATE_HEADERS);
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

function getLessonLiveStateDbSheet_() {
  return ensureSheetWithHeaders_(getTenantSpreadsheet_(), SHEET_DB_LESSON_LIVE_STATE, LESSON_LIVE_STATE_HEADERS);
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
  const normalizedLessonId = String(lessonId || '').trim();
  const cached = readCachedTeacherCommentDrafts_(normalizedLessonId);
  if (cached) return cached;
  let sheet = null;
  try {
    sheet = getTenantSpreadsheet_().getSheetByName('TeacherCommentDrafts');
  } catch (err) {
    return [];
  }
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, TEACHER_COMMENT_DRAFT_HEADERS.length).getValues() : [];
  const drafts = rows.map(mapTeacherCommentDraftRow_);
  return cacheTeacherCommentDrafts_(normalizedLessonId, normalizedLessonId
    ? drafts.filter(item => String(item.lessonId || '') === normalizedLessonId)
    : drafts);
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
  bumpDomainCacheVersion_('assessments');
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
  bumpDomainCacheVersion_('assessments');
  return saved;
}

function upsertTeacherCommentDrafts_(items, actor, options) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const meta = options && typeof options === 'object' ? options : {};
  const sheet = getTeacherCommentDraftsDbSheet_();
  const draftRows = resolveTeacherCommentDraftRows_(sheet, list);
  const indexMap = draftRows.indexMap;
  const rowMap = draftRows.rowMap;

  const updates = [];
  const appends = [];
  const saved = [];
  const auditLogs = [];
  list.forEach(item => {
    const responseId = String(item.responseId || '').trim();
    if (!responseId) return;
    const existingIndex = Object.prototype.hasOwnProperty.call(indexMap, responseId) ? Number(indexMap[responseId] || 0) : 0;
    const existingRow = existingIndex > 0 ? rowMap[existingIndex] || null : null;
    const before = existingRow ? mapTeacherCommentDraftRow_(existingRow) : null;
    const nextLessonId = String(item.lessonId ?? before?.lessonId ?? '');
    const nextUnitId = String(item.unitId ?? before?.unitId ?? '');
    const nextStudentId = String(item.studentId ?? before?.studentId ?? '');
    const nextStudentNumber = String(item.studentNumber ?? before?.studentNumber ?? '');
    const nextDraftComment = String(item.draftComment ?? before?.draftComment ?? '');
    const nextDraftRank = String(item.draftRank ?? before?.draftRank ?? '');
    const nextDraftScore = Number(item.draftScore ?? before?.draftScore ?? 0);
    const nextStatus = String(item.status ?? before?.status ?? 'draft') || 'draft';
    const nextReturnedAt = String(item.returnedAt ?? before?.returnedAt ?? '');
    const isUnchanged = Boolean(
      before &&
      String(before.lessonId || '') === nextLessonId &&
      String(before.unitId || '') === nextUnitId &&
      String(before.studentId || '') === nextStudentId &&
      String(before.studentNumber || '') === nextStudentNumber &&
      String(before.draftComment || '') === nextDraftComment &&
      String(before.draftRank || '') === nextDraftRank &&
      Number(before.draftScore || 0) === nextDraftScore &&
      String(before.status || '') === nextStatus &&
      String(before.returnedAt || '') === nextReturnedAt
    );
    const next = {
      draftId: before?.draftId || makeId_('draft'),
      responseId,
      lessonId: nextLessonId,
      unitId: nextUnitId,
      studentId: nextStudentId,
      studentNumber: nextStudentNumber,
      draftComment: nextDraftComment,
      draftRank: nextDraftRank,
      draftScore: nextDraftScore,
      status: nextStatus,
      createdAt: before?.createdAt || nowIso_(),
      updatedAt: isUnchanged ? String(before?.updatedAt || nowIso_()) : nowIso_(),
      returnedAt: nextReturnedAt,
    };
    const values = [
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
    ];
    if (existingIndex > 0 && !isUnchanged) {
      updates.push({ rowNumber: existingIndex, values });
      rowMap[existingIndex] = values.slice();
      writeTeacherCommentDraftRowCache_(responseId, existingIndex);
    } else if (existingIndex <= 0) {
      appends.push(values);
    }
    if (meta.skipAuditLogs !== true) {
      auditLogs.push({
        targetType: 'teacherCommentDraft',
        targetId: responseId,
        action: before ? 'batchUpdate' : 'batchCreate',
        before,
        after: next,
        actor: actor || 'teacher-ai-draft',
      });
    }
    saved.push(next);
  });

  writeSheetRowBatches_(sheet, updates, TEACHER_COMMENT_DRAFT_HEADERS.length);
  if (appends.length) {
    const startRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(startRow, 1, appends.length, TEACHER_COMMENT_DRAFT_HEADERS.length).setValues(appends);
    appends.forEach((row, idx) => {
      writeTeacherCommentDraftRowCache_(row[1], startRow + idx);
    });
  }
  if (updates.length || appends.length) invalidateTeacherCommentDraftCaches_();
  if (auditLogs.length) writeAuditLogs_(auditLogs);
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
    const values = batch.map(item => {
      if (!Array.isArray(item.values)) return item.values;
      return Array.isArray(item.values[0]) ? item.values[0] : item.values;
    }).filter(Boolean);
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
  const cached = readCachedLessonRecordByUnitPeriod_(unitKey, periodKey);
  if (cached) return cached;
  const rows = listLessonRecords_();
  for (let i = 0; i < rows.length; i++) {
    const lesson = rows[i];
    if (String(lesson?.unitId || '') === unitKey && String(lesson?.period || '') === periodKey) {
      cacheLessonRecord_(lesson);
      return lesson;
    }
  }
  return null;
}

function getLessonRecordById_(lessonId) {
  const lessonKey = String(lessonId || '').trim();
  if (!lessonKey) return null;
  const cached = readCachedLessonRecordById_(lessonKey);
  if (cached) return cached;
  const rows = listLessonRecords_();
  for (let i = 0; i < rows.length; i++) {
    const lesson = rows[i];
    if (String(lesson?.lessonId || '') === lessonKey) {
      cacheLessonRecord_(lesson);
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

function getAllUnitsCacheKeys_() {
  return [
    'all_units_v1',
    'all_units_meta_v1',
    'all_units_master_contract_v1',
    'all_units_master_contract_meta_v1',
  ];
}

function getTeacherStartCandidatesSnapshotCacheKey_() {
  return `teacher_start_candidates_snapshot_v1:${readDomainCacheVersion_('units')}:${readDomainCacheVersion_('lessons')}`;
}

function getTeacherStartCandidatesSnapshotCacheKeys_() {
  return ['teacher_start_candidates_snapshot_v1'];
}

function invalidateUnitCaches_() {
  removeDomainCacheKeys_(getAllUnitsCacheKeys_());
  removeDomainCacheKeys_(getTeacherStartCandidatesSnapshotCacheKeys_());
  return bumpDomainCacheVersion_('units');
}

function getDomainCacheVersionKey_(scope) {
  return `domain_cache_version_v1:${String(scope || '').trim()}`;
}

function readDomainCacheVersion_(scope) {
  const raw = String(getScriptProperties_().getProperty(getDomainCacheVersionKey_(scope)) || '').trim();
  const num = Number(raw || 0);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function bumpDomainCacheVersion_(scope) {
  const props = getScriptProperties_();
  const key = getDomainCacheVersionKey_(scope);
  const next = readDomainCacheVersion_(scope) + 1;
  props.setProperty(key, String(next));
  return next;
}

function getLessonRecordByUnitPeriodCacheKey_(unitId, period) {
  return `lesson_record_unit_period_v1:${readDomainCacheVersion_('lessons')}:${String(unitId || '').trim()}:${String(period || '').trim()}`;
}

function getLessonRecordByIdCacheKey_(lessonId) {
  return `lesson_record_by_id_v1:${readDomainCacheVersion_('lessons')}:${String(lessonId || '').trim()}`;
}

function readCachedLessonRecordByUnitPeriod_(unitId, period) {
  if (!unitId || !period) return null;
  const cached = getCachedJson_(getLessonRecordByUnitPeriodCacheKey_(unitId, period));
  return cached && typeof cached === 'object' ? cached : null;
}

function readCachedLessonRecordById_(lessonId) {
  if (!lessonId) return null;
  const cached = getCachedJson_(getLessonRecordByIdCacheKey_(lessonId));
  return cached && typeof cached === 'object' ? cached : null;
}

function cacheLessonRecord_(lesson) {
  if (!lesson || typeof lesson !== 'object') return lesson || null;
  const ttlSeconds = 20;
  const lessonId = String(lesson.lessonId || '').trim();
  const unitId = String(lesson.unitId || '').trim();
  const period = String(lesson.period || '').trim();
  if (lessonId) putCachedJson_(getLessonRecordByIdCacheKey_(lessonId), lesson, ttlSeconds);
  if (unitId && period) putCachedJson_(getLessonRecordByUnitPeriodCacheKey_(unitId, period), lesson, ttlSeconds);
  return lesson;
}

function invalidateLessonRecordCaches_() {
  return bumpDomainCacheVersion_('lessons');
}

function getLessonResponsesCacheKey_(lessonId) {
  return `lesson_responses_v1:${readDomainCacheVersion_('responses')}:${String(lessonId || '').trim()}`;
}

function getAllResponsesCacheKey_() {
  return `all_responses_v1:${readDomainCacheVersion_('responses')}:${readDomainCacheVersion_('lessons')}`;
}

function getStudentResponsesCacheKey_(studentNumber) {
  return `student_responses_v1:${readDomainCacheVersion_('responses')}:${readDomainCacheVersion_('lessons')}:${String(studentNumber || '').trim()}`;
}

function getResponseByIdCacheKey_(responseId) {
  return `response_by_id_v1:${readDomainCacheVersion_('responses')}:${String(responseId || '').trim()}`;
}

function getLessonRuntimeSnapshotCacheKey_(unitId, period) {
  return `lesson_runtime_snapshot_v1:${readDomainCacheVersion_('responses')}:${readDomainCacheVersion_('students')}:${readDomainCacheVersion_('lessons')}:${String(unitId || '').trim()}:${String(period || '').trim()}`;
}

function getLessonLiveStateListCacheKey_(lessonId) {
  return `lesson_live_state_list_v1:${readDomainCacheVersion_('responses')}:${String(lessonId || '').trim()}`;
}

function getLessonLiveStateBackfillPropKey_(lessonId) {
  return `LESSON_LIVE_STATE_BACKFILLED_${String(lessonId || '').trim()}`;
}

function getLessonLiveStateRowCacheKey_(lessonId, studentId) {
  return `lesson_live_state_row_v1:${String(lessonId || '').trim()}:${String(studentId || '').trim()}`;
}

function getLessonLiveStateRowIndexKey_(lessonId) {
  return `lesson_live_state_rows_v1:${String(lessonId || '').trim()}`;
}

function readLessonLiveStateRowIndex_(lessonId) {
  const key = getLessonLiveStateRowIndexKey_(lessonId);
  const cached = getCachedJson_(key);
  if (!Array.isArray(cached)) return [];
  return cached.map(value => Number(value) || 0).filter(value => value >= 2);
}

function writeLessonLiveStateRowIndex_(lessonId, rowNumbers) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return [];
  const list = Array.from(new Set((Array.isArray(rowNumbers) ? rowNumbers : [])
    .map(value => Number(value) || 0)
    .filter(value => value >= 2)))
    .sort((a, b) => a - b);
  putCachedJson_(getLessonLiveStateRowIndexKey_(normalizedLessonId), list, 21600);
  return list;
}

function addLessonLiveStateRowIndex_(lessonId, rowNumber) {
  const normalizedLessonId = String(lessonId || '').trim();
  const normalizedRowNumber = Number(rowNumber || 0);
  if (!normalizedLessonId || !Number.isFinite(normalizedRowNumber) || normalizedRowNumber < 2) return [];
  const current = readLessonLiveStateRowIndex_(normalizedLessonId);
  if (current.includes(normalizedRowNumber)) return current;
  current.push(normalizedRowNumber);
  return writeLessonLiveStateRowIndex_(normalizedLessonId, current);
}

function readSheetRowsByRowNumbers_(sheet, rowNumbers, width) {
  const normalized = Array.from(new Set((Array.isArray(rowNumbers) ? rowNumbers : [])
    .map(value => Number(value) || 0)
    .filter(value => value >= 2)))
    .sort((a, b) => a - b);
  if (!normalized.length) return [];
  const batches = [];
  normalized.forEach(rowNumber => {
    const last = batches[batches.length - 1];
    if (last && last.start + last.count === rowNumber) {
      last.count += 1;
    } else {
      batches.push({ start: rowNumber, count: 1 });
    }
  });
  return batches.flatMap(batch => sheet.getRange(batch.start, 1, batch.count, width).getValues());
}

function mapLessonLiveStateRow_(row) {
  return {
    liveStateId: row[0] || '',
    lessonId: row[1] || '',
    unitId: row[2] || '',
    period: Number(row[3] || 0),
    studentId: row[4] || '',
    studentNumber: row[5] || '',
    studentName: row[6] || '',
    responseId: row[7] || '',
    answersJson: row[8] || '',
    answersMap: parseAnswersJson_(row[8]),
    reviewText: row[9] || '',
    submitted: row[10] === true,
    submittedAt: row[11] || '',
    score: Number(row[12] || 0),
    rank: row[13] || '',
    medal: row[14] || '',
    comment: row[15] || '',
    isRewrite: row[16] === true,
    updatedAt: row[17] || '',
    aiStatus: row[18] || '',
    aiQueuedAt: row[19] || '',
    aiProcessedAt: row[20] || '',
    aiError: row[21] || '',
    aiBatchId: row[22] || '',
    aiRetryCount: Number(row[23] || 0),
    aiStartedAt: row[24] || '',
    aiLatencyMs: Number(row[25] || 0),
    aiModelLatencyMs: Number(row[26] || 0),
    readSource: 'live_state',
  };
}

function buildLessonLiveStateRowValues_(responseRow, lesson) {
  const response = Array.isArray(responseRow) ? mapResponseRow_(responseRow) : responseRow;
  const item = response && typeof response === 'object' ? response : {};
  const resolvedLesson = lesson || getLessonRecordById_(item.lessonId);
  return [
    makeId_('live'),
    item.lessonId || '',
    item.unitId || resolvedLesson?.unitId || '',
    Number(resolvedLesson?.period || 0),
    item.studentId || '',
    item.studentNumber || '',
    sanitizeStudentName_(item.studentName),
    item.responseId || '',
    item.answersJson || JSON.stringify(item.answersMap || {}),
    item.reviewText || '',
    item.submitted === true,
    item.submittedAt || '',
    Number(item.score || 0),
    item.rank || '',
    item.medal || '',
    item.comment || '',
    item.isRewrite === true,
    item.updatedAt || nowIso_(),
    item.aiStatus || '',
    item.aiQueuedAt || '',
    item.aiProcessedAt || '',
    item.aiError || '',
    item.aiBatchId || '',
    Number(item.aiRetryCount || 0),
    item.aiStartedAt || '',
    Number(item.aiLatencyMs || 0),
    Number(item.aiModelLatencyMs || 0),
  ];
}

function readLessonLiveStateRowNumber_(sheet, lessonId, studentId) {
  const normalizedLessonId = String(lessonId || '').trim();
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedLessonId || !normalizedStudentId) return 0;
  const cachedRow = Number(getCachedJson_(getLessonLiveStateRowCacheKey_(normalizedLessonId, normalizedStudentId)) || 0);
  if (cachedRow >= 2) {
    const values = sheet.getRange(cachedRow, 1, 1, LESSON_LIVE_STATE_HEADERS.length).getValues()[0] || [];
    if (String(values[1] || '') === normalizedLessonId && String(values[4] || '') === normalizedStudentId) {
      return cachedRow;
    }
  }
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const rows = sheet.getRange(2, 1, lastRow - 1, LESSON_LIVE_STATE_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[1] || '') === normalizedLessonId && String(row[4] || '') === normalizedStudentId) {
      const rowNumber = i + 2;
      putCachedJson_(getLessonLiveStateRowCacheKey_(normalizedLessonId, normalizedStudentId), rowNumber, 21600);
      return rowNumber;
    }
  }
  return 0;
}

function upsertLessonLiveStateFromResponseRowValues_(responseRow, lesson) {
  const row = buildLessonLiveStateRowValues_(responseRow, lesson);
  const lessonId = String(row[1] || '').trim();
  const studentId = String(row[4] || '').trim();
  if (!lessonId || !studentId) return null;
  const sheet = getLessonLiveStateDbSheet_();
  const rowNumber = readLessonLiveStateRowNumber_(sheet, lessonId, studentId);
  if (rowNumber >= 2) {
    const current = sheet.getRange(rowNumber, 1, 1, LESSON_LIVE_STATE_HEADERS.length).getValues()[0] || [];
    row[0] = current[0] || row[0];
    sheet.getRange(rowNumber, 1, 1, LESSON_LIVE_STATE_HEADERS.length).setValues([row]);
    putCachedJson_(getLessonLiveStateRowCacheKey_(lessonId, studentId), rowNumber, 21600);
    addLessonLiveStateRowIndex_(lessonId, rowNumber);
    return { rowNumber, liveStateId: row[0] };
  }
  const nextRowNumber = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(nextRowNumber, 1, 1, LESSON_LIVE_STATE_HEADERS.length).setValues([row]);
  putCachedJson_(getLessonLiveStateRowCacheKey_(lessonId, studentId), nextRowNumber, 21600);
  addLessonLiveStateRowIndex_(lessonId, nextRowNumber);
  return { rowNumber: nextRowNumber, liveStateId: row[0] };
}

function safeUpsertLessonLiveStateFromResponseRowValues_(responseRow, lesson) {
  try {
    return upsertLessonLiveStateFromResponseRowValues_(responseRow, lesson);
  } catch (err) {
    try {
      writeAuditLog_({
        targetType: 'lessonLiveState',
        targetId: Array.isArray(responseRow) ? String(responseRow[1] || '') : String(responseRow?.lessonId || ''),
        action: 'lesson_live_state_upsert_failed',
        before: null,
        after: { error: String(err && err.message ? err.message : err) },
        actor: 'system',
      });
    } catch (_auditErr) {}
    return null;
  }
}

function ensureLessonLiveStateBackfilled_(lesson) {
  const lessonId = String(lesson?.lessonId || '').trim();
  if (!lessonId) return [];
  const propKey = getLessonLiveStateBackfillPropKey_(lessonId);
  if (String(getScriptProperties_().getProperty(propKey) || '') === 'done') {
    return listLessonLiveStateRows_(lessonId);
  }
  const responses = listResponsesForLesson_(lessonId);
  responses.forEach(response => {
    safeUpsertLessonLiveStateFromResponseRowValues_(response, lesson);
  });
  const rows = responses.map(response => mapLessonLiveStateRow_(buildLessonLiveStateRowValues_(response, lesson)));
  putCachedJson_(getLessonLiveStateListCacheKey_(lessonId), rows, 20);
  getScriptProperties_().setProperty(propKey, 'done');
  return rows;
}

function listLessonLiveStateRows_(lessonId) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return [];
  const cached = getCachedJson_(getLessonLiveStateListCacheKey_(normalizedLessonId));
  if (Array.isArray(cached)) return cached;
  const sheet = getLessonLiveStateDbSheet_();
  const indexedRows = readSheetRowsByRowNumbers_(sheet, readLessonLiveStateRowIndex_(normalizedLessonId), LESSON_LIVE_STATE_HEADERS.length)
    .filter(row => String(row[1] || '') === normalizedLessonId);
  if (indexedRows.length) {
    const rows = indexedRows.map(mapLessonLiveStateRow_);
    return putCachedJson_(getLessonLiveStateListCacheKey_(normalizedLessonId), rows, 20);
  }
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const rawRows = sheet.getRange(2, 1, lastRow - 1, LESSON_LIVE_STATE_HEADERS.length).getValues();
  const rowNumbers = [];
  const rows = rawRows
    .map((row, idx) => ({ row, rowNumber: idx + 2 }))
    .filter(item => String(item.row[1] || '') === normalizedLessonId)
    .map(item => {
      rowNumbers.push(item.rowNumber);
      return mapLessonLiveStateRow_(item.row);
    });
  writeLessonLiveStateRowIndex_(normalizedLessonId, rowNumbers);
  return putCachedJson_(getLessonLiveStateListCacheKey_(normalizedLessonId), rows, 20);
}

function buildResponseMapByStudentNumber_(responses) {
  const map = {};
  (Array.isArray(responses) ? responses : []).forEach(response => {
    const key = String(response && response.studentNumber || '').trim();
    if (key) map[key] = response;
  });
  return map;
}

function getLessonRuntimeSnapshot_(unitId, period, options) {
  const opts = options || {};
  const normalizedUnitId = String(unitId || '').trim();
  const normalizedPeriod = Number(period || 0);
  if (!normalizedUnitId || normalizedPeriod <= 0) return null;
  const cacheKey = getLessonRuntimeSnapshotCacheKey_(normalizedUnitId, normalizedPeriod);
  if (opts.cache !== false) {
    const cached = getCachedJson_(cacheKey);
    if (cached && typeof cached === 'object') return cached;
  }
  const units = getAllUnits();
  const unit = units.find(item => String(item.id || '') === normalizedUnitId) || null;
  const lesson = opts.createLesson === false
    ? getLessonRecordByUnitPeriod_(normalizedUnitId, normalizedPeriod)
    : getOrCreateLesson_(normalizedUnitId, normalizedPeriod);
  const lessonConfig = { fields: lesson ? getLessonFields_(lesson, unit) : (unit && unit.fields || []) };
  const fields = getEnabledFields_(lessonConfig);
  const reviewField = getReviewField_(lessonConfig);
  const understandingField = getUnderstandingField_(lessonConfig);
  const responses = lesson ? listResponsesForLesson_(lesson.lessonId) : [];
  const responseReadMeta = lesson ? summarizeResponseReadForLesson_(lesson.lessonId, responses) : {
    scope: 'lesson',
    lessonId: '',
    preferMaster: true,
    masterCount: 0,
    mergedCount: 0,
    mode: 'master_only',
  };
  const roster = getRosterEntries_();
  const snapshot = {
    unit,
    lesson,
    period: normalizedPeriod,
    fields,
    reviewField,
    understandingField,
    roster,
    responses,
    responseMapByStudentNumber: buildResponseMapByStudentNumber_(responses),
    responseReadMeta,
    serverNow: nowIso_(),
  };
  return opts.cache === false ? snapshot : putCachedJson_(cacheKey, snapshot, 20);
}

function getLessonLiveStateSnapshot_(unitId, period, options) {
  const opts = options || {};
  const normalizedUnitId = String(unitId || '').trim();
  const normalizedPeriod = Number(period || 0);
  if (!normalizedUnitId || normalizedPeriod <= 0) return null;
  const units = Array.isArray(opts.units) ? opts.units : getAllUnits();
  const unit = units.find(item => String(item.id || '') === normalizedUnitId) || null;
  const lesson = opts.createLesson === true
    ? getOrCreateLesson_(normalizedUnitId, normalizedPeriod)
    : getLessonRecordByUnitPeriod_(normalizedUnitId, normalizedPeriod);
  if (!lesson) return null;
  const rows = listLessonLiveStateRows_(lesson.lessonId);
  const liveRows = opts.backfill === false ? rows : ensureLessonLiveStateBackfilled_(lesson);
  if (!liveRows.length && opts.requireRows !== false) return null;
  const lessonConfig = { fields: getLessonFields_(lesson, unit) };
  const fields = getEnabledFields_(lessonConfig);
  const roster = Array.isArray(opts.roster) ? opts.roster : getRosterEntries_();
  return {
    unit,
    lesson,
    period: normalizedPeriod,
    fields,
    reviewField: getReviewField_(lessonConfig),
    understandingField: getUnderstandingField_(lessonConfig),
    roster,
    responses: liveRows,
    responseMapByStudentNumber: buildResponseMapByStudentNumber_(liveRows),
    responseReadMeta: {
      scope: 'lesson_live_state',
      lessonId: String(lesson.lessonId || ''),
      preferMaster: false,
      masterCount: 0,
      mergedCount: liveRows.length,
      mode: 'live_state',
    },
    serverNow: nowIso_(),
  };
}

function readCachedLessonResponses_(lessonId) {
  if (!lessonId) return null;
  const cached = getCachedJson_(getLessonResponsesCacheKey_(lessonId));
  return Array.isArray(cached) ? cached : null;
}

function cacheLessonResponses_(lessonId, responses) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return Array.isArray(responses) ? responses : [];
  return putCachedJson_(getLessonResponsesCacheKey_(normalizedLessonId), Array.isArray(responses) ? responses : [], 20);
}

function cacheResponseById_(response) {
  const responseId = String(response && response.responseId || '').trim();
  if (!responseId) return response || null;
  return putCachedJson_(getResponseByIdCacheKey_(responseId), response, 20);
}

function writeResponseRowCaches_(rowValues, rowNumber) {
  const row = Array.isArray(rowValues) ? rowValues : [];
  const normalizedRowNumber = Number(rowNumber || 0);
  if (!row.length) return null;
  if (normalizedRowNumber >= 2) {
    writeResponseSheetRowNumberCache_(row[1], row[3], normalizedRowNumber);
    writeResponseIdSheetRowNumberCache_(row[0], normalizedRowNumber);
  }
  addLessonResponseRowIndex_(row[1], normalizedRowNumber);
  return normalizedRowNumber;
}

function updateLessonResponseCacheForDtos_(lessonId, responses) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return [];
  const sorted = sortLessonResponsesForCache_(Array.isArray(responses) ? responses : []);
  cacheLessonResponses_(normalizedLessonId, sorted);
  sorted.forEach(response => cacheResponseById_(response));
  return sorted;
}

function updateLessonResponseCacheForRows_(rows) {
  const grouped = {};
  (Array.isArray(rows) ? rows : []).forEach(row => {
    if (!Array.isArray(row) || !row.length) return;
    const lessonId = String(row[1] || '').trim();
    if (!lessonId) return;
    if (!grouped[lessonId]) grouped[lessonId] = [];
    grouped[lessonId].push(mapResponseRow_(row));
  });
  Object.keys(grouped).forEach(lessonId => {
    const mergedByKey = {};
    const cached = readCachedLessonResponses_(lessonId);
    (Array.isArray(cached) ? cached : []).forEach(item => {
      const key = String(item?.responseId || '').trim() || `${String(item?.lessonId || '')}:${String(item?.studentId || '')}`;
      if (!key) return;
      mergedByKey[key] = item;
    });
    grouped[lessonId].forEach(item => {
      const key = String(item?.responseId || '').trim() || `${String(item?.lessonId || '')}:${String(item?.studentId || '')}`;
      if (!key) return;
      mergedByKey[key] = item;
    });
    updateLessonResponseCacheForDtos_(lessonId, Object.keys(mergedByKey).map(key => mergedByKey[key]));
  });
}

function getLessonResponseRowIndexKey_(lessonId) {
  return `response_lesson_rows_v1:${String(lessonId || '').trim()}`;
}

function readLessonResponseRowIndex_(lessonId) {
  const key = getLessonResponseRowIndexKey_(lessonId);
  if (key.endsWith(':')) return [];
  try {
    const raw = String(getScriptProperties_().getProperty(key) || '').trim();
    if (!raw) return [];
    return raw.split(',')
      .map(value => Number(String(value || '').trim()))
      .filter(value => Number.isFinite(value) && value >= 2);
  } catch (_err) {
    return [];
  }
}

function writeLessonResponseRowIndex_(lessonId, rowNumbers) {
  const key = getLessonResponseRowIndexKey_(lessonId);
  if (key.endsWith(':')) return [];
  const normalized = Array.from(new Set((Array.isArray(rowNumbers) ? rowNumbers : [])
    .map(value => Number(value || 0))
    .filter(value => Number.isFinite(value) && value >= 2)))
    .sort((a, b) => a - b);
  try {
    getScriptProperties_().setProperty(key, normalized.join(','));
  } catch (_err) {}
  return normalized;
}

function addLessonResponseRowIndex_(lessonId, rowNumber) {
  const normalizedLessonId = String(lessonId || '').trim();
  const normalizedRowNumber = Number(rowNumber || 0);
  if (!normalizedLessonId || !Number.isFinite(normalizedRowNumber) || normalizedRowNumber < 2) return [];
  const current = readLessonResponseRowIndex_(normalizedLessonId);
  if (current.includes(normalizedRowNumber)) return current;
  current.push(normalizedRowNumber);
  return writeLessonResponseRowIndex_(normalizedLessonId, current);
}

function readResponseRowsByRowNumbers_(sheet, rowNumbers) {
  const normalized = Array.from(new Set((Array.isArray(rowNumbers) ? rowNumbers : [])
    .map(value => Number(value || 0))
    .filter(value => Number.isFinite(value) && value >= 2)))
    .sort((a, b) => a - b);
  if (!sheet || !normalized.length) return [];
  const lastRow = sheet.getLastRow();
  const safeRows = normalized.filter(rowNumber => rowNumber <= lastRow);
  if (!safeRows.length) return [];
  const batches = [];
  let start = safeRows[0];
  let prev = safeRows[0];
  for (let i = 1; i < safeRows.length; i++) {
    const current = safeRows[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    batches.push({ start, count: prev - start + 1 });
    start = current;
    prev = current;
  }
  batches.push({ start, count: prev - start + 1 });
  const rows = [];
  batches.forEach(batch => {
    const values = sheet.getRange(batch.start, 1, batch.count, RESPONSE_HEADERS.length).getValues();
    values.forEach((row, idx) => {
      rows.push({
        rowNumber: batch.start + idx,
        values: row,
      });
    });
  });
  return rows;
}

function sortLessonResponsesForCache_(responses) {
  return (Array.isArray(responses) ? responses.slice() : []).sort((a, b) => {
    const numA = Number(a?.studentNumber || 0);
    const numB = Number(b?.studentNumber || 0);
    if (numA !== numB) return numA - numB;
    return String(a?.responseId || '').localeCompare(String(b?.responseId || ''));
  });
}

function mergeLessonResponseRowsIntoCache_(rows) {
  updateLessonResponseCacheForRows_(rows);
}

function refreshLessonResponseCachesForRows_(rows) {
  const lessonIdSet = {};
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const lessonId = String(Array.isArray(row) ? row[1] : row?.lessonId || '').trim();
    if (lessonId) lessonIdSet[lessonId] = true;
  });
  Object.keys(lessonIdSet).forEach(lessonId => {
    const tenantResponses = listTenantResponseRecordsForLesson_(lessonId);
    if (tenantResponses.length) {
      updateLessonResponseCacheForDtos_(lessonId, tenantResponses);
      return;
    }
    const fallback = listMasterResponseRecordsForLesson_(lessonId);
    updateLessonResponseCacheForDtos_(lessonId, fallback);
  });
}

function invalidateLessonResponseCaches_() {
  return bumpDomainCacheVersion_('responses');
}

function getStudentRowCacheKey_(studentNumber) {
  return `student_row_v1:${readDomainCacheVersion_('students')}:${String(studentNumber || '').trim()}`;
}

function readStudentRowCache_(studentNumber) {
  const key = getStudentRowCacheKey_(studentNumber);
  if (key.endsWith(':')) return 0;
  try {
    const raw = getDomainCache_().get(key);
    const rowNumber = Number(raw || 0);
    return Number.isFinite(rowNumber) && rowNumber >= 2 ? rowNumber : 0;
  } catch (_err) {
    return 0;
  }
}

function writeStudentRowCache_(studentNumber, rowNumber) {
  const key = getStudentRowCacheKey_(studentNumber);
  const normalizedRowNumber = Number(rowNumber || 0);
  if (key.endsWith(':') || !Number.isFinite(normalizedRowNumber) || normalizedRowNumber < 2) return;
  try {
    getDomainCache_().put(key, String(normalizedRowNumber), 6 * 60 * 60);
  } catch (_err) {}
}

function removeStudentRowCache_(studentNumber) {
  const key = getStudentRowCacheKey_(studentNumber);
  if (key.endsWith(':')) return;
  try {
    getDomainCache_().remove(key);
  } catch (_err) {}
}

function mapStudentDbRow_(row, fallbackName) {
  return {
    studentId: row[0] || '',
    number: row[1],
    name: sanitizeStudentName_(fallbackName) || sanitizeStudentName_(row[2]),
  };
}

function sanitizeStudentName_(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (/^(unknown|unkonwn|undefined|null|nan)$/i.test(text)) return '';
  return text;
}

function readCachedStudentRow_(studentNumber) {
  const rowNumber = readStudentRowCache_(studentNumber);
  if (!rowNumber) return null;
  const sheet = getStudentsDbSheet_();
  const lastRow = sheet.getLastRow();
  if (rowNumber > lastRow) {
    removeStudentRowCache_(studentNumber);
    return null;
  }
  const row = sheet.getRange(rowNumber, 1, 1, STUDENT_HEADERS.length).getValues()[0] || [];
  if (String(row[1] || '') === String(studentNumber || '') && row[3] !== false) {
    return { rowNumber, values: row };
  }
  removeStudentRowCache_(studentNumber);
  return null;
}

function invalidateStudentCaches_() {
  removeDomainCacheKeys_(['roster_entries_active_v1', 'roster_entries_all_v1', 'student_entry_options_v1', 'student_entry_options_v2', 'student_number_list_v1']);
  removeStudentEntryOptionsScriptCache_();
  return bumpDomainCacheVersion_('students');
}

function removeStudentEntryOptionsScriptCache_() {
  try {
    CacheService.getScriptCache().remove('student_entry_options_v2');
    CacheService.getScriptCache().remove('student_entry_summary_v1');
  } catch (_err) {}
}

function invalidateStudentEntryRuntimeCaches_() {
  removeStudentEntryOptionsScriptCache_();
  bumpDomainCacheVersion_('lessons');
  return true;
}

function getTeacherCommentDraftRowCacheKey_(responseId) {
  return `teacher_draft_row_v1:${readDomainCacheVersion_('teacher_comment_drafts')}:${String(responseId || '').trim()}`;
}

function getTeacherCommentDraftListCacheKey_(lessonId) {
  return `teacher_draft_list_v1:${readDomainCacheVersion_('teacher_comment_drafts')}:${String(lessonId || '').trim()}`;
}

function mapTeacherCommentDraftRow_(row) {
  return {
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
  };
}

function readTeacherCommentDraftRowCache_(responseId) {
  const key = getTeacherCommentDraftRowCacheKey_(responseId);
  if (key.endsWith(':')) return 0;
  try {
    const raw = getDomainCache_().get(key);
    const rowNumber = Number(raw || 0);
    return Number.isFinite(rowNumber) && rowNumber >= 2 ? rowNumber : 0;
  } catch (_err) {
    return 0;
  }
}

function writeTeacherCommentDraftRowCache_(responseId, rowNumber) {
  const key = getTeacherCommentDraftRowCacheKey_(responseId);
  const normalizedRowNumber = Number(rowNumber || 0);
  if (key.endsWith(':') || !Number.isFinite(normalizedRowNumber) || normalizedRowNumber < 2) return;
  try {
    getDomainCache_().put(key, String(normalizedRowNumber), 6 * 60 * 60);
  } catch (_err) {}
}

function removeTeacherCommentDraftRowCache_(responseId) {
  const key = getTeacherCommentDraftRowCacheKey_(responseId);
  if (key.endsWith(':')) return;
  try {
    getDomainCache_().remove(key);
  } catch (_err) {}
}

function readTeacherCommentDraftRowsByRowNumbers_(sheet, rowNumbers) {
  const normalized = Array.from(new Set((Array.isArray(rowNumbers) ? rowNumbers : [])
    .map(value => Number(value || 0))
    .filter(value => Number.isFinite(value) && value >= 2)))
    .sort((a, b) => a - b);
  if (!sheet || !normalized.length) return [];
  const lastRow = sheet.getLastRow();
  const safeRows = normalized.filter(rowNumber => rowNumber <= lastRow);
  if (!safeRows.length) return [];
  const batches = [];
  let start = safeRows[0];
  let prev = safeRows[0];
  for (let i = 1; i < safeRows.length; i++) {
    const current = safeRows[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    batches.push({ start, count: prev - start + 1 });
    start = current;
    prev = current;
  }
  batches.push({ start, count: prev - start + 1 });
  const rows = [];
  batches.forEach(batch => {
    const values = sheet.getRange(batch.start, 1, batch.count, TEACHER_COMMENT_DRAFT_HEADERS.length).getValues();
    values.forEach((row, idx) => {
      rows.push({
        rowNumber: batch.start + idx,
        values: row,
      });
    });
  });
  return rows;
}

function readCachedTeacherCommentDrafts_(lessonId) {
  const cached = getCachedJson_(getTeacherCommentDraftListCacheKey_(lessonId));
  return Array.isArray(cached) ? cached : null;
}

function cacheTeacherCommentDrafts_(lessonId, drafts) {
  return putCachedJson_(getTeacherCommentDraftListCacheKey_(lessonId), Array.isArray(drafts) ? drafts : [], 20);
}

function invalidateTeacherCommentDraftCaches_() {
  return bumpDomainCacheVersion_('teacher_comment_drafts');
}

function resolveTeacherCommentDraftRows_(sheet, items) {
  const rowMap = {};
  const indexMap = {};
  const missingIds = [];
  const cachedRowNumberToIds = {};
  (Array.isArray(items) ? items : []).forEach(item => {
    const responseId = String(item?.responseId || '').trim();
    if (!responseId || Object.prototype.hasOwnProperty.call(indexMap, responseId)) return;
    const cachedRowNumber = readTeacherCommentDraftRowCache_(responseId);
    if (cachedRowNumber) {
      if (!cachedRowNumberToIds[cachedRowNumber]) cachedRowNumberToIds[cachedRowNumber] = [];
      cachedRowNumberToIds[cachedRowNumber].push(responseId);
      return;
    }
    missingIds.push(responseId);
  });
  const cachedRows = readTeacherCommentDraftRowsByRowNumbers_(sheet, Object.keys(cachedRowNumberToIds));
  cachedRows.forEach(entry => {
    const responseId = String(entry.values[1] || '').trim();
    const expectedIds = cachedRowNumberToIds[entry.rowNumber] || [];
    if (!responseId || expectedIds.indexOf(responseId) === -1) {
      expectedIds.forEach(id => removeTeacherCommentDraftRowCache_(id));
      return;
    }
    indexMap[responseId] = entry.rowNumber;
    rowMap[entry.rowNumber] = entry.values;
    writeTeacherCommentDraftRowCache_(responseId, entry.rowNumber);
  });
  Object.keys(cachedRowNumberToIds).forEach(rowNumberKey => {
    const expectedIds = cachedRowNumberToIds[rowNumberKey] || [];
    expectedIds.forEach(responseId => {
      if (!Object.prototype.hasOwnProperty.call(indexMap, responseId)) missingIds.push(responseId);
    });
  });
  if (missingIds.length) {
    const lastRow = sheet.getLastRow();
    const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, TEACHER_COMMENT_DRAFT_HEADERS.length).getValues() : [];
    rows.forEach((row, idx) => {
      const responseId = String(row[1] || '').trim();
      if (!responseId) return;
      const rowNumber = idx + 2;
      indexMap[responseId] = rowNumber;
      rowMap[rowNumber] = row;
      writeTeacherCommentDraftRowCache_(responseId, rowNumber);
    });
  }
  return { indexMap, rowMap };
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
  const baseEntries = readRosterSheetEntries_();
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

function readRosterSheetEntries_() {
  const roster = getTenantSpreadsheet_().getSheetByName('名簿');
  if (!roster) return [];
  const lastRow = Math.max(roster.getLastRow(), 1);
  const values = roster.getRange(1, 1, lastRow, 2).getValues();
  const entries = values
    .map(row => ({
      number: Number(row[0]) || 0,
      name: String(row[1] || '').trim(),
      active: true,
    }))
    .filter(entry => entry.number > 0 && entry.name);
  if (entries.length) {
    return entries.sort((a, b) => a.number - b.number);
  }
  return [];
}

function getStudentNumberList_() {
  const cached = getCachedJson_('student_number_list_v1');
  if (Array.isArray(cached) && cached.length) return cached;
  const rosterNumbers = getStudentSelectableEntries_()
    .map(entry => Number(entry && entry.number) || 0)
    .filter(number => number > 0);
  const numbers = Array.from(new Set(rosterNumbers)).sort((a, b) => a - b);
  if (numbers.length) return putCachedJson_('student_number_list_v1', numbers, 20);
  const studentsSheet = getStudentsDbSheet_();
  const lastRow = studentsSheet.getLastRow();
  const studentRows = lastRow > 1 ? studentsSheet.getRange(2, 2, lastRow - 1, 2).getValues() : [];
  const fallbackNumbers = Array.from(new Set(studentRows
    .filter(row => row[1] !== false)
    .map(row => Number(row[0]) || 0)
    .filter(number => number > 0)))
    .sort((a, b) => a - b);
  if (fallbackNumbers.length) return putCachedJson_('student_number_list_v1', fallbackNumbers, 20);
  return [];
}

function getStudentSelectableEntries_() {
  const seen = {};
  return getRosterEntries_()
    .filter(entry => entry && Number(entry.number) > 0)
    .filter(entry => String(entry.name || '').trim())
    .sort((a, b) => Number(a.number || 0) - Number(b.number || 0))
    .filter(entry => {
      const key = String(entry.number);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function buildDefaultRosterEntries_() {
  return [];
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
  writeRosterSheetEntries_(normalized.filter(entry => entry.active));
  syncRosterEntriesToMaster_(normalized, { updatedBy: 'legacy_saveRosterEntries' });
  invalidateStudentCaches_();
  return { ok: true };
}

function clearSheetBody_(sheet, columnCount) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, columnCount).clearContent();
  }
}

function writeRosterSheetEntries_(entries) {
  const ss = getTenantSpreadsheet_();
  let sheet = ss.getSheetByName('名簿');
  if (!sheet) sheet = ss.insertSheet('名簿');
  sheet.clearContents();
  if (!(entries || []).length) return;
  sheet.getRange(1, 1, entries.length, 2).setValues(entries.map(entry => [entry.number, entry.name || '']));
}

function getStudentEntryOptions(options) {
  const startedAt = Date.now();
  const timing = {};
  const opts = options && typeof options === 'object' ? options : {};
  const lightweight = opts.lightweight !== false;
  const includeShell = opts.shell !== false && opts.includeShell !== false;
  const cache = CacheService.getScriptCache();
  const cacheStartedAt = Date.now();
  const cached = cache.get('student_entry_options_v2');
  timing.cacheMs = Date.now() - cacheStartedAt;
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.students)) {
        const shellStartedAt = Date.now();
        const shell = includeShell ? getLiveTenantMaintenanceState() : {};
        timing.shellMs = Date.now() - shellStartedAt;
        timing.cacheHit = true;
        if (lightweight) {
          return attachStudentApiTiming_({
            students: parsed.students,
            shell,
          }, 'getStudentEntryOptions', startedAt, timing);
        }
        const snapshotStartedAt = Date.now();
        const classSnapshot = parsed.classSnapshot && typeof parsed.classSnapshot === 'object'
          ? parsed.classSnapshot
          : buildStudentEntryClassSnapshot_(parsed.students, getAiFeatureFlags_(), shell);
        timing.classSnapshotMs = Date.now() - snapshotStartedAt;
        if (classSnapshot && typeof classSnapshot === 'object') {
          classSnapshot.shell = shell;
        }
        return attachStudentApiTiming_({
          ...parsed,
          classSnapshot,
          shell,
        }, 'getStudentEntryOptions', startedAt, timing);
      }
    } catch (e) {}
  }
  timing.cacheHit = false;
  const rosterStartedAt = Date.now();
  const students = getStudentSelectableEntries_();
  timing.rosterMs = Date.now() - rosterStartedAt;
  const flagsStartedAt = Date.now();
  const featureFlags = getAiFeatureFlags_();
  timing.featureFlagsMs = Date.now() - flagsStartedAt;
  const shellStartedAt = Date.now();
  const shell = includeShell ? getLiveTenantMaintenanceState() : {};
  timing.shellMs = Date.now() - shellStartedAt;
  const payload = {
    students,
    shell,
  };
  if (!lightweight) {
    const snapshotStartedAt = Date.now();
    payload.classSnapshot = buildStudentEntryClassSnapshot_(students, featureFlags, shell);
    timing.classSnapshotMs = Date.now() - snapshotStartedAt;
  }
  cache.put('student_entry_options_v2', JSON.stringify(payload), 5);
  return attachStudentApiTiming_(payload, 'getStudentEntryOptions', startedAt, timing);
}

function getStudentEntrySummary(options) {
  const startedAt = Date.now();
  const timing = {};
  const opts = options && typeof options === 'object' ? options : {};
  const includeShell = opts.shell !== false && opts.includeShell !== false;
  const cache = CacheService.getScriptCache();
  const cacheStartedAt = Date.now();
  const cached = cache.get('student_entry_summary_v1');
  timing.cacheMs = Date.now() - cacheStartedAt;
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.numberList) && parsed.numberList.length) {
        const shellStartedAt = Date.now();
        const shell = includeShell ? getLiveTenantMaintenanceState() : {};
        timing.shellMs = Date.now() - shellStartedAt;
        timing.cacheHit = true;
        return attachStudentApiTiming_({
          numberList: parsed.numberList,
          maxNumber: Number(parsed.maxNumber || parsed.numberList[parsed.numberList.length - 1] || 0),
          shell,
        }, 'getStudentEntrySummary', startedAt, timing);
      }
    } catch (_err) {}
  }
  timing.cacheHit = false;
  const numberListStartedAt = Date.now();
  const numberList = getStudentNumberList_();
  timing.numberListMs = Date.now() - numberListStartedAt;
  const shellStartedAt = Date.now();
  const payload = {
    numberList,
    maxNumber: Number(numberList[numberList.length - 1] || 0),
    shell: includeShell ? getLiveTenantMaintenanceState() : {},
  };
  timing.shellMs = Date.now() - shellStartedAt;
  cache.put('student_entry_summary_v1', JSON.stringify({
    numberList: payload.numberList,
    maxNumber: payload.maxNumber,
  }), 5);
  return attachStudentApiTiming_(payload, 'getStudentEntrySummary', startedAt, timing);
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
  let student = opts?.student || getOrCreateStudent_(num, studentName);
  const answersMap = buildAnswersMap_(fields, customs || []);
  const reviewText = extractReviewText_(fields, answersMap);
  let existingResponse = getResponseRecord_(lesson.lessonId, student.studentId);
  if (!existingResponse) existingResponse = getResponseRecordByStudentNumber_(lesson.lessonId, num);
  let existing = existingResponse && existingResponse.responseId
    ? findResponseSheetRowEntryByResponseId_(existingResponse.responseId)
    : null;
  const existingStudentId = String(
    existingResponse?.studentId
    || ''
  ).trim();
  if (existingStudentId && existingStudentId !== String(student.studentId || '').trim()) {
    student = {
      studentId: existingStudentId,
      number: student.number,
      name: String(
        existingResponse?.studentName
        || studentName
        || student.name
        || ''
      ).trim(),
    };
    writeAuditLog_({
      targetType: 'response',
      targetId: String(existingResponse?.responseId || ''),
      action: 'response_student_id_relinked',
      before: {
        lessonId: lesson.lessonId,
        studentId: opts?.student?.studentId || '',
        studentNumber: num,
      },
      after: {
        lessonId: lesson.lessonId,
        studentId: existingStudentId,
        studentNumber: num,
      },
      actor: 'system',
    });
  }
  const existingValues = existing
    ? existing.values
    : (existingResponse ? buildResponseSheetRowValues_(existingResponse) : null);
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
  const persistTimings = opts?.persistTimings && typeof opts.persistTimings === 'object' ? opts.persistTimings : null;
  const responseWriteStartedAt = Date.now();
  const row = upsertResponse_({
    responseId: existingValues ? existingValues[0] : '',
    lessonId: lesson.lessonId,
    unitId,
    studentId: student.studentId,
    studentNumber: num,
    studentName: sanitizeStudentName_(studentName) || sanitizeStudentName_(student.name),
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
  }, existing, {
    skipMasterMirror: true,
    updateLessonLiveState: false,
    deferLocalCache: true,
    deferRowCaches: true,
  });
  if (persistTimings) persistTimings.responseWriteMs = Date.now() - responseWriteStartedAt;
  const liveStateStartedAt = Date.now();
  const liveStateResult = safeUpsertLessonLiveStateFromResponseRowValues_(row.values, lesson);
  if (persistTimings) {
    persistTimings.lessonLiveStateMs = Date.now() - liveStateStartedAt;
    persistTimings.lessonLiveStateUpdated = Boolean(liveStateResult);
  }
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
    responseRowValues: row.values,
    responseRowNumber: row.rowNumber,
    liveStateUpdated: Boolean(liveStateResult),
    reviewText,
    answersMap,
    historyEntry,
    isRewrite: wasRewrite,
  };
}

function isMasterResponseMirrorEnabled_() {
  const raw = String(getScriptProperties_().getProperty(MASTER_RESPONSE_MIRROR_PROP) || '').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

function isMasterResponsePreferredReadEnabled_() {
  return true;
}

function mapMasterRecordToResponse_(record) {
  if (!record || String(record.recordType || '') !== MASTER_RESPONSE_RECORD_TYPE) return null;
  const payload = parseAnswersJson_(record.payloadJson);
  if (!payload || typeof payload !== 'object') return null;
  return {
    readSource: 'master',
    responseId: String(payload.responseId || ''),
    lessonId: String(payload.lessonId || record.lessonId || ''),
    unitId: String(payload.unitId || ''),
    studentId: String(payload.studentId || record.studentId || ''),
    studentNumber: String(payload.studentNumber || record.studentNo || ''),
    studentName: sanitizeStudentName_(payload.studentName),
    answersJson: JSON.stringify(payload.answersMap || {}),
    answersMap: payload.answersMap && typeof payload.answersMap === 'object' ? payload.answersMap : {},
    reviewText: String(payload.reviewText || ''),
    submitted: payload.submitted === true,
    submittedAt: String(payload.submittedAt || ''),
    score: Number(payload.score || 0),
    rank: String(payload.rank || ''),
    medal: String(payload.medal || ''),
    comment: String(payload.comment || ''),
    isRewrite: payload.isRewrite === true,
    updatedAt: String(payload.updatedAt || record.updatedAt || record.createdAt || ''),
    aiStatus: String(payload.aiStatus || ''),
    aiQueuedAt: String(payload.aiQueuedAt || ''),
    aiProcessedAt: String(payload.aiProcessedAt || ''),
    aiError: String(payload.aiError || ''),
    aiBatchId: String(payload.aiBatchId || ''),
    aiRetryCount: Number(payload.aiRetryCount || 0),
    aiStartedAt: String(payload.aiStartedAt || ''),
    aiLatencyMs: Number(payload.aiLatencyMs || 0),
    aiModelLatencyMs: Number(payload.aiModelLatencyMs || 0),
  };
}

function compareResponseUpdatedAtDesc_(left, right) {
  const leftKey = String(left?.updatedAt || left?.aiProcessedAt || left?.submittedAt || '');
  const rightKey = String(right?.updatedAt || right?.aiProcessedAt || right?.submittedAt || '');
  if (leftKey === rightKey) {
    return String(right?.responseId || '').localeCompare(String(left?.responseId || ''));
  }
  return leftKey < rightKey ? 1 : -1;
}

function makeMasterResponseClientSubmitId_(response) {
  const responseId = String(response?.responseId || '').trim();
  if (!responseId) return '';
  return `${responseId}:${String(response?.updatedAt || nowIso_()).trim()}`;
}

function buildMasterResponseMirrorPayload_(response, source) {
  const mapped = response && typeof response === 'object' ? response : {};
  return {
    recordId: '',
    recordType: MASTER_RESPONSE_RECORD_TYPE,
    classId: '',
    lessonId: mapped.lessonId || '',
    studentId: mapped.studentId || '',
    studentNo: mapped.studentNumber || '',
    clientSubmitId: makeMasterResponseClientSubmitId_(mapped),
    payload: {
      responseId: mapped.responseId || '',
      lessonId: mapped.lessonId || '',
      unitId: mapped.unitId || '',
      studentId: mapped.studentId || '',
      studentNumber: mapped.studentNumber || '',
      studentName: sanitizeStudentName_(mapped.studentName),
      answersMap: mapped.answersMap || {},
      reviewText: mapped.reviewText || '',
      submitted: mapped.submitted === true,
      submittedAt: mapped.submittedAt || '',
      score: Number(mapped.score || 0),
      rank: mapped.rank || '',
      medal: mapped.medal || '',
      comment: mapped.comment || '',
      isRewrite: mapped.isRewrite === true,
      updatedAt: mapped.updatedAt || nowIso_(),
      aiStatus: mapped.aiStatus || '',
      aiQueuedAt: mapped.aiQueuedAt || '',
      aiProcessedAt: mapped.aiProcessedAt || '',
      aiError: mapped.aiError || '',
      aiBatchId: mapped.aiBatchId || '',
      aiRetryCount: Number(mapped.aiRetryCount || 0),
      aiStartedAt: mapped.aiStartedAt || '',
      aiLatencyMs: Number(mapped.aiLatencyMs || 0),
      aiModelLatencyMs: Number(mapped.aiModelLatencyMs || 0),
    },
    source: String(source || 'legacy_response_dual_write'),
    deleted: false,
  };
}

function buildMasterResponseDeletePayload_(response, source) {
  const payload = buildMasterResponseMirrorPayload_(response, source);
  payload.deleted = true;
  return payload;
}

function listMasterResponseRecordsForLessonViaContract_(lessonId) {
  const snapshot = getMasterGasApiRecordSnapshot_(MASTER_GAS_API_APP_ID, {
    recordType: MASTER_RESPONSE_RECORD_TYPE,
    lessonId: String(lessonId || '').trim(),
    includeDeleted: true,
    limit: MASTER_GAS_API_MAX_LIMIT,
  });
  return Array.isArray(snapshot && snapshot.items) ? snapshot.items : [];
}

function listMasterResponseRecordsForStudentNumberViaContract_(studentNumber) {
  const snapshot = getMasterGasApiRecordSnapshot_(MASTER_GAS_API_APP_ID, {
    recordType: MASTER_RESPONSE_RECORD_TYPE,
    studentNo: String(studentNumber || '').trim(),
    includeDeleted: true,
    limit: MASTER_GAS_API_MAX_LIMIT,
  });
  return Array.isArray(snapshot && snapshot.items) ? snapshot.items : [];
}

function listMasterResponseRecordsForStudentNumberLessonViaContract_(studentNumber, lessonId) {
  const snapshot = getMasterGasApiRecordSnapshot_(MASTER_GAS_API_APP_ID, {
    recordType: MASTER_RESPONSE_RECORD_TYPE,
    studentNo: String(studentNumber || '').trim(),
    lessonId: String(lessonId || '').trim(),
    includeDeleted: true,
    limit: MASTER_GAS_API_MAX_LIMIT,
  });
  return Array.isArray(snapshot && snapshot.items) ? snapshot.items : [];
}

function listMasterResponseRecordsForAllViaContract_() {
  const snapshot = getMasterGasApiRecordSnapshot_(MASTER_GAS_API_APP_ID, {
    recordType: MASTER_RESPONSE_RECORD_TYPE,
    includeDeleted: true,
    limit: MASTER_GAS_API_MAX_LIMIT,
  });
  return Array.isArray(snapshot && snapshot.items) ? snapshot.items : [];
}

function collectLatestMasterResponsesByLesson_(items, lessonId) {
  const normalizedLessonId = String(lessonId || '').trim();
  const latestByKey = {};
  (Array.isArray(items) ? items : []).forEach(item => {
    const mapped = mapMasterRecordToResponse_(item);
    if (!mapped) return;
    const currentLessonId = String(mapped.lessonId || '').trim();
    if (!currentLessonId) return;
    if (normalizedLessonId && currentLessonId !== normalizedLessonId) return;
    const studentNumberKey = String(mapped.studentNumber || '').trim();
    const studentIdKey = String(mapped.studentId || '').trim();
    const studentKey = studentNumberKey ? `num:${studentNumberKey}` : (studentIdKey ? `id:${studentIdKey}` : '');
    if (!studentKey) return;
    const compositeKey = `${currentLessonId}::${studentKey}`;
    const current = latestByKey[compositeKey];
    if (!current || compareResponseUpdatedAtDesc_(mapped, current.response) < 0) {
      latestByKey[compositeKey] = {
        response: mapped,
        deleted: item.deleted === true,
      };
    }
  });
  const grouped = {};
  Object.keys(latestByKey).forEach(key => {
    const entry = latestByKey[key];
    if (!entry || entry.deleted === true || !entry.response) return;
    const currentLessonId = String(entry.response.lessonId || '').trim();
    if (!currentLessonId) return;
    if (!grouped[currentLessonId]) grouped[currentLessonId] = [];
    grouped[currentLessonId].push(entry.response);
  });
  Object.keys(grouped).forEach(currentLessonId => {
    grouped[currentLessonId] = sortLessonResponsesForCache_(grouped[currentLessonId]);
  });
  return grouped;
}

function listMasterResponseRecordsForLesson_(lessonId) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return [];
  let items = [];
  try {
    items = listMasterResponseRecordsForLessonViaContract_(normalizedLessonId);
  } catch (_err) {
    items = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.RECORDS, MASTER_GAS_API_HEADERS.Records)
      .map(mapMasterGasApiRecordRow_)
      .filter(item => item.appId === MASTER_GAS_API_APP_ID)
      .filter(item => item.recordType === MASTER_RESPONSE_RECORD_TYPE)
      .filter(item => item.lessonId === normalizedLessonId);
  }
  const grouped = collectLatestMasterResponsesByLesson_(items, normalizedLessonId);
  return grouped[normalizedLessonId] || [];
}

function listMasterResponseRecordsForStudentNumber_(studentNumber) {
  const normalizedStudentNumber = String(studentNumber || '').trim();
  if (!normalizedStudentNumber) return [];
  let items = [];
  try {
    items = listMasterResponseRecordsForStudentNumberViaContract_(normalizedStudentNumber);
  } catch (_err) {
    items = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.RECORDS, MASTER_GAS_API_HEADERS.Records)
      .map(mapMasterGasApiRecordRow_)
      .filter(item => item.appId === MASTER_GAS_API_APP_ID)
      .filter(item => item.recordType === MASTER_RESPONSE_RECORD_TYPE)
      .filter(item => String(item.studentNo || '').trim() === normalizedStudentNumber);
  }
  const grouped = collectLatestMasterResponsesByLesson_(items);
  return sortLessonResponsesForCache_(
    Object.keys(grouped).reduce((list, currentLessonId) => list.concat(grouped[currentLessonId] || []), [])
  );
}

function listMasterResponseRecordsForStudentNumberLesson_(studentNumber, lessonId) {
  const normalizedStudentNumber = String(studentNumber || '').trim();
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedStudentNumber || !normalizedLessonId) return [];
  let items = [];
  try {
    items = listMasterResponseRecordsForStudentNumberLessonViaContract_(normalizedStudentNumber, normalizedLessonId);
  } catch (_err) {
    items = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.RECORDS, MASTER_GAS_API_HEADERS.Records)
      .map(mapMasterGasApiRecordRow_)
      .filter(item => item.appId === MASTER_GAS_API_APP_ID)
      .filter(item => item.recordType === MASTER_RESPONSE_RECORD_TYPE)
      .filter(item => item.lessonId === normalizedLessonId)
      .filter(item => String(item.studentNo || '').trim() === normalizedStudentNumber);
  }
  const grouped = collectLatestMasterResponsesByLesson_(items, normalizedLessonId);
  return grouped[normalizedLessonId] || [];
}

function listMasterResponseRecordsForAll_() {
  let items = [];
  try {
    items = listMasterResponseRecordsForAllViaContract_();
  } catch (_err) {
    items = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.RECORDS, MASTER_GAS_API_HEADERS.Records)
      .map(mapMasterGasApiRecordRow_)
      .filter(item => item.appId === MASTER_GAS_API_APP_ID)
      .filter(item => item.recordType === MASTER_RESPONSE_RECORD_TYPE);
  }
  const grouped = collectLatestMasterResponsesByLesson_(items);
  return sortLessonResponsesForCache_(
    Object.keys(grouped).reduce((list, currentLessonId) => list.concat(grouped[currentLessonId] || []), [])
  );
}

function summarizeResponseReadForLesson_(lessonId, responses) {
  const normalizedLessonId = String(lessonId || '').trim();
  const mergedResponses = Array.isArray(responses) ? responses : [];
  let masterUsed = false;
  let masterCount = 0;
  mergedResponses.forEach(item => {
    if (String(item?.readSource || '') === 'master') {
      masterUsed = true;
      masterCount++;
    }
  });
  return {
    scope: 'lesson',
    lessonId: normalizedLessonId,
    preferMaster: false,
    masterCount,
    mergedCount: mergedResponses.length,
    mode: masterUsed ? 'tenant_with_master_fallback' : 'tenant_primary',
    source: masterUsed ? 'master_fallback' : 'tenant_responses',
    masterUsed,
  };
}

function summarizeResponseReadForAll_(responses) {
  const list = Array.isArray(responses) ? responses : listAllResponses_();
  let masterTaggedCount = 0;
  list.forEach(item => {
    if (String(item?.readSource || '') !== 'master') return;
    masterTaggedCount++;
  });
  return {
    scope: 'all',
    preferMaster: masterTaggedCount > 0,
    totalCount: list.length,
    estimatedMasterOnlyCount: masterTaggedCount,
    mode: masterTaggedCount > 0 ? 'mixed' : 'tenant_primary',
    source: masterTaggedCount > 0 ? 'mixed' : 'tenant_responses',
    masterUsed: masterTaggedCount > 0,
  };
}

function mirrorResponseRowToMaster_(row, source) {
  if (!isMasterResponseMirrorEnabled_() || !Array.isArray(row) || !row.length) return null;
  ensureMasterGasApiSheets_();
  const mapped = mapResponseRow_(row);
  const body = { appId: MASTER_GAS_API_APP_ID };
  const payload = buildMasterResponseMirrorPayload_(mapped, source);
  const mirrorRow = buildMasterGasApiRecordRow_(payload, body);
  return appendMasterGasApiRow_(getMasterGasApiSheetByName_(MASTER_GAS_API_SHEETS.RECORDS), mirrorRow);
}

function mirrorResponseRowsToMaster_(rows, source, action, actor) {
  if (!isMasterResponseMirrorEnabled_()) return { mirrored: 0, failed: 0 };
  const list = Array.isArray(rows) ? rows.filter(row => Array.isArray(row) && row.length) : [];
  if (!list.length) return { mirrored: 0, failed: 0 };
  const recordsSheet = getMasterGasApiSheetByName_(MASTER_GAS_API_SHEETS.RECORDS);
  const body = { appId: MASTER_GAS_API_APP_ID };
  const mirrorRows = [];
  const auditLogs = [];
  list.forEach(row => {
    try {
      const mapped = mapResponseRow_(row);
      const payload = buildMasterResponseMirrorPayload_(mapped, source);
      mirrorRows.push(buildMasterGasApiRecordRow_(payload, body));
    } catch (err) {
      auditLogs.push({
        targetType: 'response',
        targetId: String(row[0] || ''),
        action: action || 'master_mirror_failed_batch',
        before: null,
        after: { error: String(err && err.message ? err.message : err) },
        actor: actor || 'system',
      });
    }
  });
  let mirrored = 0;
  if (mirrorRows.length) {
    try {
      appendMasterGasApiRows_(recordsSheet, mirrorRows);
      mirrored = mirrorRows.length;
    } catch (err) {
      list.forEach(row => {
        auditLogs.push({
          targetType: 'response',
          targetId: String(row[0] || ''),
          action: action || 'master_mirror_failed_batch',
          before: null,
          after: { error: String(err && err.message ? err.message : err) },
          actor: actor || 'system',
        });
      });
    }
  }
  if (auditLogs.length) writeAuditLogs_(auditLogs);
  return { mirrored, failed: auditLogs.length };
}

function deleteResponseRowFromMaster_(response, source) {
  if (!isMasterResponseMirrorEnabled_() || !response) return null;
  ensureMasterGasApiSheets_();
  const mapped = Array.isArray(response) ? mapResponseRow_(response) : response;
  const body = { appId: MASTER_GAS_API_APP_ID };
  const payload = buildMasterResponseDeletePayload_(mapped, source);
  const mirrorRow = buildMasterGasApiRecordRow_(payload, body);
  return appendMasterGasApiRow_(getMasterGasApiSheetByName_(MASTER_GAS_API_SHEETS.RECORDS), mirrorRow);
}

function deleteResponseRowsFromMaster_(responses, source, action, actor) {
  if (!isMasterResponseMirrorEnabled_()) return { deleted: 0, failed: 0 };
  const list = Array.isArray(responses) ? responses.filter(Boolean) : [];
  if (!list.length) return { deleted: 0, failed: 0 };
  const auditLogs = [];
  let deleted = 0;
  list.forEach(response => {
    const responseId = String(Array.isArray(response) ? response[0] : response?.responseId || '').trim();
    try {
      deleteResponseRowFromMaster_(response, source);
      deleted++;
    } catch (err) {
      auditLogs.push({
        targetType: 'response',
        targetId: responseId,
        action: action || 'master_response_delete_failed_batch',
        before: null,
        after: { error: String(err && err.message ? err.message : err) },
        actor: actor || 'system',
      });
    }
  });
  if (deleted) invalidateLessonResponseCaches_();
  if (auditLogs.length) writeAuditLogs_(auditLogs);
  return { deleted, failed: auditLogs.length };
}

function updateResponseAiResult_(lessonId, studentId, result) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_AI_RESULT_MS)) {
    throw new Error('AI結果の保存が混み合っています。少し後にもう一度確認してください。');
  }
  try {
    const existingResponse = getResponseRecord_(lessonId, studentId);
    if (!existingResponse) return;
    const updatedAt = nowIso_();
    const next = Object.assign({}, existingResponse, {
      score: result.score ?? existingResponse.score,
      rank: result.rank ?? existingResponse.rank,
      medal: result.medal ?? existingResponse.medal,
      comment: result.comment ?? existingResponse.comment,
      updatedAt,
      aiStatus: result.aiStatus ?? existingResponse.aiStatus,
      aiQueuedAt: result.aiQueuedAt ?? existingResponse.aiQueuedAt,
      aiProcessedAt: result.aiProcessedAt ?? existingResponse.aiProcessedAt,
      aiError: result.aiError ?? existingResponse.aiError,
      aiBatchId: result.aiBatchId ?? existingResponse.aiBatchId,
      aiRetryCount: Number(result.aiRetryCount ?? existingResponse.aiRetryCount ?? 0),
      aiStartedAt: result.aiStartedAt ?? existingResponse.aiStartedAt,
      aiLatencyMs: Number(result.aiLatencyMs ?? existingResponse.aiLatencyMs ?? 0),
      aiModelLatencyMs: Number(result.aiModelLatencyMs ?? existingResponse.aiModelLatencyMs ?? 0),
    });
    const responseSheetRowValues = buildResponseSheetRowValues_(next);
    mirrorResponseRowsWithAudit_([responseSheetRowValues], 'response_ai_result_update', 'master_mirror_failed_ai_result', 'system');
    const existingRowEntry = next.responseId ? findResponseSheetRowEntryByResponseId_(next.responseId) : null;
    if (existingRowEntry) {
      upsertResponseSheetRowValues_(responseSheetRowValues, existingRowEntry);
    }
  } finally {
    lock.releaseLock();
  }
}

function getResponseRecord_(lessonId, studentId) {
  const responses = listResponsesForLesson_(lessonId);
  return responses.find(item => String(item.studentId || '') === String(studentId || '')) || null;
}

function getResponseRecordByStudentNumber_(lessonId, studentNumber) {
  const normalizedLessonId = String(lessonId || '').trim();
  const normalizedStudentNumber = String(studentNumber || '').trim();
  if (!normalizedLessonId || !normalizedStudentNumber) return null;
  const cached = readCachedLessonResponses_(normalizedLessonId);
  if (Array.isArray(cached)) {
    return cached.find(item => String(item.studentNumber || '').trim() === normalizedStudentNumber) || null;
  }
  const tenantResponses = listTenantResponseRecordsForLesson_(normalizedLessonId);
  const tenantMatch = tenantResponses.find(item => String(item.studentNumber || '').trim() === normalizedStudentNumber) || null;
  if (tenantMatch) {
    cacheResponseById_(tenantMatch);
    return tenantMatch;
  }
  const responses = listMasterResponseRecordsForStudentNumberLesson_(normalizedStudentNumber, normalizedLessonId);
  responses.forEach(response => cacheResponseById_(response));
  return responses.find(item => String(item.studentNumber || '').trim() === normalizedStudentNumber) || null;
}

function getResponseRecordByResponseId_(responseId) {
  const normalizedResponseId = String(responseId || '').trim();
  if (!normalizedResponseId) return null;
  const cached = getCachedJson_(getResponseByIdCacheKey_(normalizedResponseId));
  if (cached && String(cached.responseId || '').trim() === normalizedResponseId) return cached;
  const responses = listAllResponses_();
  const found = responses.find(item => String(item.responseId || '').trim() === normalizedResponseId) || null;
  return found ? cacheResponseById_(found) : null;
}

function listResponsesForLesson_(lessonId) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return [];
  const cached = readCachedLessonResponses_(normalizedLessonId);
  if (cached) return cached;
  const tenantResponses = listTenantResponseRecordsForLesson_(normalizedLessonId);
  if (tenantResponses.length) {
    return updateLessonResponseCacheForDtos_(normalizedLessonId, tenantResponses);
  }
  return updateLessonResponseCacheForDtos_(normalizedLessonId, listMasterResponseRecordsForLesson_(normalizedLessonId));
}

function listResponsesForStudent_(studentNumber, lessonIds) {
  const normalizedStudentNumber = String(studentNumber || '').trim();
  if (!normalizedStudentNumber) return [];
  const lessonIdList = Array.isArray(lessonIds)
    ? lessonIds.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const lessonIdSet = {};
  lessonIdList.forEach(lessonId => {
    lessonIdSet[lessonId] = true;
  });
  const cacheKey = getStudentResponsesCacheKey_(normalizedStudentNumber);
  const cached = getCachedJson_(cacheKey);
  if (Array.isArray(cached)) {
    return lessonIdList.length
      ? cached.filter(item => lessonIdSet[String(item && item.lessonId || '').trim()] === true)
      : cached;
  }
  const responses = listMasterResponseRecordsForStudentNumber_(normalizedStudentNumber);
  responses.forEach(response => cacheResponseById_(response));
  return putCachedJson_(cacheKey, responses, 20)
    .filter(item => !lessonIdList.length || lessonIdSet[String(item && item.lessonId || '').trim()] === true);
}

function listAllResponses_() {
  const cached = getCachedJson_(getAllResponsesCacheKey_());
  if (Array.isArray(cached)) return cached;
  const lessonIdSet = {};
  listLessonRecords_().forEach(lesson => {
    const lessonId = String(lesson?.lessonId || '').trim();
    if (lessonId) lessonIdSet[lessonId] = true;
  });
  const knownLessonIds = Object.keys(lessonIdSet);
  const allResponses = listMasterResponseRecordsForAll_().filter(response => {
    const lessonId = String(response?.lessonId || '').trim();
    if (!knownLessonIds.length) return true;
    return lessonIdSet[lessonId] === true;
  });
  const grouped = {};
  allResponses.forEach(response => {
    const lessonId = String(response?.lessonId || '').trim();
    if (!lessonId) return;
    if (!grouped[lessonId]) grouped[lessonId] = [];
    grouped[lessonId].push(response);
  });
  Object.keys(grouped).forEach(lessonId => {
    cacheLessonResponses_(lessonId, grouped[lessonId]);
  });
  allResponses.forEach(response => cacheResponseById_(response));
  return putCachedJson_(getAllResponsesCacheKey_(), sortLessonResponsesForCache_(allResponses), 20);
}

function mapResponseRow_(row) {
  return {
    readSource: 'legacy',
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
  const previousLesson = getLessonRecordByUnitPeriod_(unitId, period - 1);
  if (!previousLesson) return '';
  const response = getResponseRecordByStudentNumber_(previousLesson.lessonId, studentNumber);
  if (response && response.reviewText) return response.reviewText;
  return '';
}

function getPreviousStudentLearningContextFromDb_(unitId, period, studentNumber, unit) {
  if (period <= 1) return { prevReview: '', previousNextGoal: '' };
  const previousLesson = getLessonRecordByUnitPeriod_(unitId, period - 1);
  if (!previousLesson) return { prevReview: '', previousNextGoal: '' };
  const response = getResponseRecordByStudentNumber_(previousLesson.lessonId, studentNumber);
  if (!response) return { prevReview: '', previousNextGoal: '' };
  return {
    prevReview: String(response.reviewText || ''),
    previousNextGoal: extractPreviousNextGoal_(response, previousLesson, unit),
  };
}

function extractPreviousNextGoal_(response, previousLesson, unit) {
  const answersMap = response && response.answersMap && typeof response.answersMap === 'object'
    ? response.answersMap
    : {};
  if (!Object.keys(answersMap).length) return '';
  const fields = getLessonFields_(previousLesson, unit);
  const field = (fields || []).find(item => isNextGoalField_(item));
  if (field && field.key) {
    return String(answersMap[field.key] || '').trim();
  }
  const fallbackKey = Object.keys(answersMap).find(key => /next.*(goal|target)|tsugi|next_goal|nextGoal/i.test(String(key || '')));
  return fallbackKey ? String(answersMap[fallbackKey] || '').trim() : '';
}

function isNextGoalField_(field) {
  if (!field) return false;
  const key = String(field.key || '').trim();
  const label = String(field.label || '').trim();
  const text = `${key} ${label}`.toLowerCase();
  if (/next.*(goal|target)|next_goal|nextGoal|tsugi/.test(text)) return true;
  return /次|つぎ/.test(label) && /めあて|目標|ゴール|goal|target/i.test(label);
}

function getOrCreateStudent_(number, name) {
  const sheet = getStudentsDbSheet_();
  const normalizedNumber = String(number || '');
  const normalizedName = sanitizeStudentName_(name);
  const cached = readCachedStudentRow_(normalizedNumber);
  if (cached) {
    if (normalizedName && cached.values[2] !== normalizedName) {
      const updatedAt = nowIso_();
      sheet.getRange(cached.rowNumber, 3).setValue(normalizedName);
      sheet.getRange(cached.rowNumber, 6).setValue(updatedAt);
      cached.values[2] = normalizedName;
      cached.values[5] = updatedAt;
      removeDomainCacheKeys_(['roster_entries_active_v1', 'roster_entries_all_v1', 'student_entry_options_v1', 'student_entry_options_v2', 'student_number_list_v1']);
      removeStudentEntryOptionsScriptCache_();
    }
    return mapStudentDbRow_(cached.values, normalizedName);
  }

  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, STUDENT_HEADERS.length).getValues() : [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[1] || '') === normalizedNumber && row[3] !== false) {
      if (normalizedName && row[2] !== normalizedName) {
        const updatedAt = nowIso_();
        sheet.getRange(i + 2, 3).setValue(normalizedName);
        sheet.getRange(i + 2, 6).setValue(updatedAt);
        row[2] = normalizedName;
        row[5] = updatedAt;
        removeDomainCacheKeys_(['roster_entries_active_v1', 'roster_entries_all_v1', 'student_entry_options_v1', 'student_entry_options_v2', 'student_number_list_v1']);
        removeStudentEntryOptionsScriptCache_();
      }
      writeStudentRowCache_(normalizedNumber, i + 2);
      return mapStudentDbRow_(row, normalizedName);
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
  const rowNumber = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(rowNumber, 1, 1, STUDENT_HEADERS.length).setValues([[
    student.studentId,
    student.number,
    student.name,
    student.active,
    student.createdAt,
    student.updatedAt,
  ]]);
  invalidateStudentCaches_();
  writeStudentRowCache_(normalizedNumber, rowNumber);
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
  invalidateLessonRecordCaches_();
  return cacheLessonRecord_(lesson);
}

function getResponseSheetData_() {
  const sheet = getResponsesDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, RESPONSE_HEADERS.length).getValues()
    : [];
  return { sheet, rows, lastRow };
}

function listTenantResponseRecordsForLesson_(lessonId) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return [];
  const sheet = getResponsesDbSheet_();
  const indexedRows = readResponseRowsByRowNumbers_(sheet, readLessonResponseRowIndex_(normalizedLessonId))
    .filter(entry => String(entry?.values?.[1] || '') === normalizedLessonId);
  if (indexedRows.length) {
    return sortLessonResponsesForCache_(indexedRows.map(entry => mapResponseRow_(entry.values)));
  }
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, RESPONSE_HEADERS.length).getValues();
  const rowNumbers = [];
  const responses = rows
    .map((row, idx) => ({ row, rowNumber: idx + 2 }))
    .filter(entry => String(entry.row[1] || '') === normalizedLessonId)
    .map(entry => {
      rowNumbers.push(entry.rowNumber);
      return mapResponseRow_(entry.row);
    });
  writeLessonResponseRowIndex_(normalizedLessonId, rowNumbers);
  return sortLessonResponsesForCache_(responses);
}

function getResponseSheetRowNumberCacheKey_(lessonId, studentId) {
  return `response_row_v1:${String(lessonId || '').trim()}:${String(studentId || '').trim()}`;
}

function getResponseIdSheetRowNumberCacheKey_(responseId) {
  return `response_id_row_v1:${String(responseId || '').trim()}`;
}

function getResponseSheetRowNumberCache_() {
  return CacheService.getScriptCache();
}

function readResponseSheetRowNumberCache_(lessonId, studentId) {
  const key = getResponseSheetRowNumberCacheKey_(lessonId, studentId);
  if (!key.endsWith('::')) {
    try {
      const raw = getResponseSheetRowNumberCache_().get(key);
      const rowNumber = Number(raw || 0);
      return Number.isFinite(rowNumber) && rowNumber >= 2 ? rowNumber : 0;
    } catch (_err) {
      return 0;
    }
  }
  return 0;
}

function writeResponseSheetRowNumberCache_(lessonId, studentId, rowNumber) {
  const key = getResponseSheetRowNumberCacheKey_(lessonId, studentId);
  const normalizedRowNumber = Number(rowNumber || 0);
  if (key.endsWith('::') || !Number.isFinite(normalizedRowNumber) || normalizedRowNumber < 2) return;
  try {
    getResponseSheetRowNumberCache_().put(key, String(normalizedRowNumber), 6 * 60 * 60);
  } catch (_err) {}
}

function readResponseIdSheetRowNumberCache_(responseId) {
  const key = getResponseIdSheetRowNumberCacheKey_(responseId);
  if (key.endsWith(':')) return 0;
  try {
    const raw = getResponseSheetRowNumberCache_().get(key);
    const rowNumber = Number(raw || 0);
    return Number.isFinite(rowNumber) && rowNumber >= 2 ? rowNumber : 0;
  } catch (_err) {
    return 0;
  }
}

function writeResponseIdSheetRowNumberCache_(responseId, rowNumber) {
  const key = getResponseIdSheetRowNumberCacheKey_(responseId);
  const normalizedRowNumber = Number(rowNumber || 0);
  if (key.endsWith(':') || !Number.isFinite(normalizedRowNumber) || normalizedRowNumber < 2) return;
  try {
    getResponseSheetRowNumberCache_().put(key, String(normalizedRowNumber), 6 * 60 * 60);
  } catch (_err) {}
}

function removeResponseSheetRowNumberCache_(lessonId, studentId) {
  const key = getResponseSheetRowNumberCacheKey_(lessonId, studentId);
  if (key.endsWith('::')) return;
  try {
    getResponseSheetRowNumberCache_().remove(key);
  } catch (_err) {}
}

function removeResponseIdSheetRowNumberCache_(responseId) {
  const key = getResponseIdSheetRowNumberCacheKey_(responseId);
  if (key.endsWith(':')) return;
  try {
    getResponseSheetRowNumberCache_().remove(key);
  } catch (_err) {}
}

function readCachedResponseSheetRowEntry_(lessonId, studentId) {
  const rowNumber = readResponseSheetRowNumberCache_(lessonId, studentId);
  if (!rowNumber) return null;
  const sheet = getResponsesDbSheet_();
  const lastRow = sheet.getLastRow();
  if (rowNumber > lastRow) {
    removeResponseSheetRowNumberCache_(lessonId, studentId);
    return null;
  }
  const values = sheet.getRange(rowNumber, 1, 1, RESPONSE_HEADERS.length).getValues()[0] || [];
  if (String(values[1] || '') === String(lessonId) && String(values[3] || '') === String(studentId)) {
    writeResponseIdSheetRowNumberCache_(values[0], rowNumber);
    addLessonResponseRowIndex_(values[1], rowNumber);
    return { rowNumber, values };
  }
  removeResponseSheetRowNumberCache_(lessonId, studentId);
  return null;
}

function readCachedResponseSheetRowEntryByResponseId_(responseId) {
  const rowNumber = readResponseIdSheetRowNumberCache_(responseId);
  if (!rowNumber) return null;
  const sheet = getResponsesDbSheet_();
  const lastRow = sheet.getLastRow();
  if (rowNumber > lastRow) {
    removeResponseIdSheetRowNumberCache_(responseId);
    return null;
  }
  const values = sheet.getRange(rowNumber, 1, 1, RESPONSE_HEADERS.length).getValues()[0] || [];
  if (String(values[0] || '').trim() === String(responseId || '').trim()) {
    writeResponseSheetRowNumberCache_(values[1], values[3], rowNumber);
    addLessonResponseRowIndex_(values[1], rowNumber);
    return { rowNumber, values };
  }
  removeResponseIdSheetRowNumberCache_(responseId);
  return null;
}

function findResponseSheetRowEntryByResponseId_(responseId, responseData) {
  const targetId = String(responseId || '').trim();
  if (!targetId) return null;
  if (!responseData) {
    const cached = readCachedResponseSheetRowEntryByResponseId_(targetId);
    if (cached) return cached;
  }
  const rows = (responseData && responseData.rows) || [];
  const sourceRows = responseData ? rows : getResponseSheetData_().rows;
  for (let i = 0; i < sourceRows.length; i++) {
    const row = sourceRows[i];
    if (String(row[0] || '').trim() === targetId) {
      const foundRowEntry = { rowNumber: i + 2, values: row };
      writeResponseIdSheetRowNumberCache_(targetId, foundRowEntry.rowNumber);
      writeResponseSheetRowNumberCache_(row[1], row[3], foundRowEntry.rowNumber);
      addLessonResponseRowIndex_(row[1], foundRowEntry.rowNumber);
      return foundRowEntry;
    }
  }
  if (!responseData) removeResponseIdSheetRowNumberCache_(targetId);
  return null;
}

function buildResponseSheetRowValues_(response) {
  const item = response && typeof response === 'object' ? response : {};
  return [
    item.responseId || makeId_('response'),
    item.lessonId || '',
    item.unitId || '',
    item.studentId || '',
    item.studentNumber || '',
    item.studentName || '',
    JSON.stringify(item.answersMap || {}),
    item.reviewText || '',
    item.submitted === true,
    item.submittedAt || '',
    Number(item.score || 0),
    item.rank || '',
    item.medal || '',
    item.comment || '',
    item.isRewrite === true,
    item.updatedAt || nowIso_(),
    item.aiStatus || '',
    item.aiQueuedAt || '',
    item.aiProcessedAt || '',
    item.aiError || '',
    item.aiBatchId || '',
    Number(item.aiRetryCount || 0),
    item.aiStartedAt || '',
    Number(item.aiLatencyMs || 0),
    Number(item.aiModelLatencyMs || 0),
  ];
}

function cacheResponseRows_(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter(row => Array.isArray(row) && row.length);
  if (!list.length) return 0;
  invalidateLessonResponseCaches_();
  updateLessonResponseCacheForRows_(list);
  return list.length;
}

function mirrorResponseRowsWithAudit_(rows, source, action, actor) {
  const list = (Array.isArray(rows) ? rows : []).filter(row => Array.isArray(row) && row.length);
  if (!list.length) return { mirrored: 0, failed: 0 };
  return mirrorResponseRowsToMaster_(list, source, action, actor);
}

function writeResponseSheetRowEntryUpdates_(updates, mirrorSource, mirrorAction, actor, options) {
  const list = Array.isArray(updates) ? updates.filter(item => item && item.rowNumber && Array.isArray(item.values)) : [];
  if (!list.length) return 0;
  const meta = options && typeof options === 'object' ? options : {};
  const sheet = getResponsesDbSheet_();
  writeSheetRowBatches_(sheet, list, RESPONSE_HEADERS.length);
  list.forEach(item => {
    addLessonResponseRowIndex_(item.values[1], item.rowNumber);
    if (meta.deferRowCaches !== true) {
      writeResponseRowCaches_(item.values, item.rowNumber);
    }
    if (meta.updateLessonLiveState !== false) {
      safeUpsertLessonLiveStateFromResponseRowValues_(item.values);
    }
  });
  if (meta.skipResponseCacheRefresh === true) {
    if (meta.invalidateResponseCaches === true) invalidateLessonResponseCaches_();
  } else {
    invalidateLessonResponseCaches_();
    if (meta.deferLocalCache !== true) {
      updateLessonResponseCacheForRows_(list.map(item => item.values).filter(Boolean));
    }
  }
  if (mirrorSource) {
    mirrorResponseRowsToMaster_(
      list.map(item => item.values),
      mirrorSource,
      mirrorAction || 'master_mirror_failed_response_row_update',
      actor || 'system'
    );
  }
  return list.length;
}

function writeResponseRowUpdates_(updates, mirrorSource, mirrorAction, actor, options) {
  return writeResponseSheetRowEntryUpdates_(updates, mirrorSource, mirrorAction, actor, options);
}

function upsertResponseSheetRowValues_(rowValues, existingRowEntry) {
  const meta = arguments.length > 2 && arguments[2] && typeof arguments[2] === 'object'
    ? arguments[2]
    : {};
  const safeRowValues = Array.isArray(rowValues) ? rowValues.slice() : [];
  if (!safeRowValues.length) return { rowNumber: 0, responseId: '' };
  const resolvedExistingRowEntry = existingRowEntry || findResponseSheetRowEntryByResponseId_(safeRowValues[0]);
  if (resolvedExistingRowEntry) {
    safeRowValues[0] = resolvedExistingRowEntry.values[0] || safeRowValues[0];
    writeResponseSheetRowEntryUpdates_([{
      rowNumber: resolvedExistingRowEntry.rowNumber,
      values: safeRowValues,
    }], null, null, null, meta);
    addLessonResponseRowIndex_(safeRowValues[1], resolvedExistingRowEntry.rowNumber);
    return { rowNumber: resolvedExistingRowEntry.rowNumber, responseId: safeRowValues[0], values: safeRowValues };
  }
  const sheet = getResponsesDbSheet_();
  const rowNumber = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(rowNumber, 1, 1, safeRowValues.length).setValues([safeRowValues]);
  addLessonResponseRowIndex_(safeRowValues[1], rowNumber);
  if (meta.deferRowCaches !== true) {
    writeResponseRowCaches_(safeRowValues, rowNumber);
  }
  if (meta.updateLessonLiveState !== false) {
    safeUpsertLessonLiveStateFromResponseRowValues_(safeRowValues);
  }
  invalidateLessonResponseCaches_();
  if (meta.deferLocalCache !== true) {
    updateLessonResponseCacheForRows_([safeRowValues]);
  }
  return { rowNumber, responseId: safeRowValues[0], values: safeRowValues };
}

function upsertResponse_(params, existing) {
  const meta = arguments.length > 2 && arguments[2] && typeof arguments[2] === 'object'
    ? arguments[2]
    : {};
  const responseSheetRowValues = buildResponseSheetRowValues_(Object.assign({}, params, {
    updatedAt: nowIso_(),
  }));
  if (existing && existing.values) {
    responseSheetRowValues[0] = existing.values[0] || responseSheetRowValues[0];
  }
  if (meta.skipMasterMirror !== true) {
    mirrorResponseRowsWithAudit_(
      [responseSheetRowValues],
      existing ? 'response_upsert' : 'response_insert',
      existing ? 'master_mirror_failed_upsert' : 'master_mirror_failed_insert',
      'system'
    );
  }
  return upsertResponseSheetRowValues_(responseSheetRowValues, existing || null, meta);
}

function appendResponseHistory_(params) {
  const sheet = getResponseHistoryDbSheet_();
  const row = [
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
  ];
  const rowNumber = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
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
      const existing = getResponseRecord_(lesson.lessonId, student.studentId);
      upsertResponse_({
        responseId: existing ? existing.responseId : '',
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

function getAllUnits(options) {
  return getAllUnitsSnapshot_(options).units;
}

function getAllUnitsSnapshot_(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const useMasterContract = opts.useMasterContract === true;
  const cacheKey = useMasterContract ? 'all_units_master_contract_v1' : 'all_units_v1';
  const metaCacheKey = useMasterContract ? 'all_units_master_contract_meta_v1' : 'all_units_meta_v1';
  const cached = getCachedJson_(cacheKey);
  if (Array.isArray(cached)) {
    const cachedMeta = getCachedJson_(metaCacheKey) || {
      scope: 'all_units',
      cached: true,
      preferMaster: true,
      mode: 'cache',
      masterCount: cached.length,
      mergedCount: cached.length,
      masterReadPath: useMasterContract ? 'GET_MASTER' : 'internal',
    };
    setLastUnitsReadMeta_(cachedMeta);
    return {
      units: cached,
      meta: cachedMeta,
    };
  }
  const units = useMasterContract ? listMasterUnitRecordsViaContract_() : listMasterUnitRecords_();
  const meta = summarizeUnitReadForAll_(units, {
    useMasterContract,
  });
  setLastUnitsReadMeta_(meta);
  putCachedJson_(metaCacheKey, meta, 20);
  return {
    units: putCachedJson_(cacheKey, units, 20),
    meta,
  };
}

function buildTeacherStartCandidateUnitSummary_(unit, progress) {
  const source = unit && typeof unit === 'object' ? unit : {};
  const unitId = String(source.id || '').trim();
  const summaryProgress = progress && typeof progress === 'object' ? progress : {};
  const lastStartedPeriod = Math.max(
    0,
    Number(summaryProgress.lastStartedPeriod || 0),
    Number(summaryProgress.lastActivityPeriod || 0),
    Number(summaryProgress.maxPeriod || 0)
  );
  const configuredMax = Math.max(0, Number(source.maxPeriod || 0));
  const maxPeriod = configuredMax || 10;
  const suggestedNextPeriod = Math.max(1, Math.min(
    maxPeriod === 0 ? 20 : maxPeriod,
    lastStartedPeriod > 0 ? lastStartedPeriod + 1 : 1
  ));
  return {
    id: unitId,
    name: String(source.name || '').trim(),
    subject: String(source.subject || '').trim(),
    maxPeriod,
    createdAt: String(source.createdAt || '').trim(),
    createdAtValue: Number(source.createdAtValue || 0),
    lastStartedPeriod,
    lastStartedAt: String(summaryProgress.lastStartedAt || summaryProgress.latestActivityAt || '').trim(),
    lastActivityPeriod: Math.max(0, Number(summaryProgress.lastActivityPeriod || lastStartedPeriod)),
    lastActivityAt: String(summaryProgress.latestActivityAt || summaryProgress.lastStartedAt || '').trim(),
    suggestedNextPeriod,
    suggestedPeriod: suggestedNextPeriod,
  };
}

function buildTeacherStartCandidatesSnapshotPayload_(units, unitProgress) {
  const progressMap = unitProgress && typeof unitProgress === 'object' ? unitProgress : {};
  const list = (Array.isArray(units) ? units : [])
    .map(unit => buildTeacherStartCandidateUnitSummary_(unit, progressMap[String(unit && unit.id || '')] || {}))
    .filter(unit => unit.id);
  return {
    savedAt: nowIso_(),
    units: list,
    unitProgress: progressMap,
  };
}

function getTeacherStartCandidatesSnapshot_(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const cacheKey = getTeacherStartCandidatesSnapshotCacheKey_();
  if (!opts.forceRefresh) {
    const cached = getCachedJson_(cacheKey);
    if (cached && Array.isArray(cached.units) && cached.units.length) return cached;
    const genericCached = getCachedJson_('teacher_start_candidates_snapshot_v1');
    if (genericCached && Array.isArray(genericCached.units) && genericCached.units.length) {
      putCachedJson_(cacheKey, genericCached, 21600);
      return genericCached;
    }
  }
  const unitSnapshot = getAllUnitsSnapshot_({ useMasterContract: true });
  const units = Array.isArray(unitSnapshot && unitSnapshot.units) ? unitSnapshot.units : [];
  const unitProgress = getTeacherUnitProgress_({ forceRefresh: false });
  const payload = buildTeacherStartCandidatesSnapshotPayload_(units, unitProgress);
  putCachedJson_('teacher_start_candidates_snapshot_v1', payload, 21600);
  putCachedJson_(cacheKey, payload, 21600);
  return payload;
}

let lastUnitsReadMeta_ = null;

function setLastUnitsReadMeta_(meta) {
  lastUnitsReadMeta_ = meta && typeof meta === 'object' ? meta : null;
  return lastUnitsReadMeta_;
}

function getLastUnitsReadMeta_() {
  return lastUnitsReadMeta_ && typeof lastUnitsReadMeta_ === 'object'
    ? lastUnitsReadMeta_
    : null;
}

function normalizeUnitRecord_(source, raw) {
  const unit = raw && typeof raw === 'object' ? raw : {};
  const createdAtRaw = String(unit.createdAt || '').trim();
  const createdDate = createdAtRaw ? new Date(createdAtRaw) : null;
  const createdAtValue = createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.getTime() : 0;
  return {
    readSource: String(source || 'legacy'),
    id: String(unit.id || '').trim(),
    name: String(unit.name || '').trim(),
    subject: String(unit.subject || '').trim(),
    maxPeriod: Number(unit.maxPeriod) || 10,
    createdAt: createdAtValue ? Utilities.formatDate(createdDate, 'Asia/Tokyo', 'yyyy/MM/dd') : createdAtRaw,
    createdAtValue,
    fields: Array.isArray(unit.fields) ? unit.fields : [],
  };
}

function readUnitSheetRecords_() {
  const s = getUnitSheet();
  if (!s) return [];
  const data = s.getDataRange().getValues();
  return data.slice(1)
    .filter(r => r[0] && r[6] !== '削除')
    .map(r => {
      let fields = [];
      try { fields = JSON.parse(r[5] || '[]'); } catch(e) {}
      const createdDate = r[4] ? new Date(r[4]) : null;
      const createdAt = createdDate && !Number.isNaN(createdDate.getTime())
        ? Utilities.formatDate(createdDate, 'Asia/Tokyo', 'yyyy/MM/dd')
        : '';
      return normalizeUnitRecord_('legacy', {
        id: r[0],
        name: r[1],
        subject: r[2],
        maxPeriod: r[3] || 10,
        createdAt,
        fields,
      });
    });
}

function listMasterUnitRecords_() {
  return listMasterGasApiMasterItems_(MASTER_GAS_API_APP_ID, { masterType: 'unit' })
    .map(item => {
      const payload = parseAnswersJson_(item.payloadJson);
      if (!(payload && typeof payload === 'object')) return null;
      return normalizeUnitRecord_('master', payload);
    })
    .filter(item => item && item.id);
}

function listMasterUnitRecordsViaContract_() {
  const snapshot = getMasterGasApiMasterSnapshot_(MASTER_GAS_API_APP_ID, { masterType: 'unit' });
  const items = Array.isArray(snapshot && snapshot.items) ? snapshot.items : [];
  return items
    .map(item => {
      const payload = parseAnswersJson_(item && item.payloadJson);
      if (!(payload && typeof payload === 'object')) return null;
      return normalizeUnitRecord_('master', payload);
    })
    .filter(item => item && item.id);
}

function summarizeUnitReadForAll_(units, options) {
  const unitList = Array.isArray(units) ? units : [];
  const opts = options && typeof options === 'object' ? options : {};
  const useMasterContract = opts.useMasterContract === true;
  return {
    scope: 'all_units',
    cached: false,
    preferMaster: true,
    masterCount: unitList.length,
    mergedCount: unitList.length,
    mode: 'master_only',
    masterReadPath: useMasterContract ? 'GET_MASTER' : 'internal',
  };
}

function getLessonRecordById_(lessonId) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return null;
  const cached = readCachedLessonRecordById_(normalizedLessonId);
  if (cached) return cached;
  const lesson = listLessonRecords_().find(item => String(item.lessonId || '') === normalizedLessonId) || null;
  return lesson ? cacheLessonRecord_(lesson) : null;
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
    const units = getAllUnits();
    const existingUnit = normalizedId
      ? units.find(unit => String(unit?.id || '').trim() === normalizedId) || null
      : null;
    const activeIds = units
      .map(unit => Number(unit && unit.id || 0) || 0)
      .filter(id => id > 0);
    const unitId = existingUnit
      ? String(existingUnit.id || '').trim()
      : String(activeIds.length ? Math.max.apply(null, activeIds) + 1 : 1);
    const createdAt = existingUnit && existingUnit.createdAt
      ? String(existingUnit.createdAt || '').trim()
      : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
    invalidateUnitCaches_();
    const result = {
      ok: true,
      id: unitId,
      unit: {
        id: unitId,
        name: normalizedName,
        subject: normalizedSubject,
        maxPeriod: numericMax,
        createdAt,
        createdAtValue: Number(new Date(createdAt).getTime()) || 0,
        fields: safeFields,
      },
    };
    syncUnitToMaster_(result.unit, { updatedBy: 'master_saveUnit', noLock: true });
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
  const unit = getUnitById_(id);
  if (!unit) return { ok: false };
  const nextFields = normalizeFieldConfigArray_(fields);
  syncUnitToMaster_({
    id: unit.id,
    name: unit.name,
    subject: unit.subject,
    maxPeriod: unit.maxPeriod,
    createdAt: unit.createdAt,
    fields: nextFields,
  }, { updatedBy: 'master_updateUnitFields' });
  invalidateUnitCaches_();
  return { ok: true };
}

function deleteUnit(id) {
  const unit = getUnitById_(id);
  if (!unit) return { ok: false };
  syncDeletedUnitToMaster_(id, { updatedBy: 'master_deleteUnit' });
  invalidateUnitCaches_();
  return { ok: true };
}

// ============================================================
//  アクティブ授業
// ============================================================
function getActiveSetting(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const includeUnit = opts.includeUnit !== false;
  const includeLesson = opts.includeLesson !== false;
  const cfg    = readGlobalConfig();
  const unitId = parseInt(cfg.active_unit) || 0;
  const period = parseInt(cfg.active_period) || 0;
  const timelineFieldKey = String(cfg.active_timeline_field || '');
  const activeRevision = parseInt(cfg.active_revision, 10) || 0;
  const providedUnits = Array.isArray(opts.units) ? opts.units : null;
  const units  = includeUnit ? (providedUnits || getAllUnits()) : [];
  const unit   = includeUnit ? (units.find(u => u.id == unitId) || null) : null;
  const lesson = includeLesson && unit && period > 0 ? getLessonRecordByUnitPeriod_(unitId, period) : null;
  const fields = includeUnit || includeLesson ? getLessonFields_(lesson, unit) : [];
  return { unitId, period, unit, units, lesson, fields, timelineFieldKey, activeRevision };
}

function getNextActiveRevision_() {
  const cfg = readGlobalConfig();
  const current = parseInt(cfg.active_revision, 10) || 0;
  return current + 1;
}

function teacherStartLesson(unitId, period) {
  const lesson = getOrCreateLesson_(unitId, period);
  const currentActive = getActiveSetting({ includeUnit: false, includeLesson: true });
  const alreadyActive = String(currentActive.unitId || '') === String(unitId || '')
    && Number(currentActive.period || 0) === Number(period || 0)
    && String(currentActive.lesson?.lessonId || '') === String(lesson.lessonId || '');
  const nextActiveRevision = alreadyActive
    ? Number(currentActive.activeRevision || 0)
    : getNextActiveRevision_();
  writeGlobalConfigBatch({
    active_unit: unitId,
    active_period: period,
    active_timeline_field: '',
    active_revision: String(nextActiveRevision),
  });
  invalidateStudentEntryRuntimeCaches_();
  removeDomainCacheKeys_(['teacher_unit_progress_v1']);
  const startCandidatesSnapshot = getTeacherStartCandidatesSnapshot_({ forceRefresh: true });
  const nextStartCandidate = Array.isArray(startCandidatesSnapshot && startCandidatesSnapshot.units)
    ? startCandidatesSnapshot.units.find(item => String(item && item.id || '') === String(unitId || '')) || null
    : null;
  return {
    ok: true,
    lesson,
    active: getActiveSetting({ includeUnit: false, includeLesson: false }),
    startCandidatesSnapshot,
    nextStartCandidate,
  };
}

function teacherEndLesson() {
  const nextActiveRevision = getNextActiveRevision_();
  writeGlobalConfigBatch({
    active_period: 0,
    active_timeline_field: '',
    active_revision: String(nextActiveRevision),
  });
  invalidateStudentEntryRuntimeCaches_();
  return { ok: true, activeRevision: nextActiveRevision };
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
      invalidateLessonRecordCaches_();
      cacheLessonRecord_(lesson);
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









