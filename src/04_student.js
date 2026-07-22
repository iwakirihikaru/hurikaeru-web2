// ============================================================
//  児童向け API
// ============================================================
// studentSessionToken is not identity/authentication.
// It only binds the in-progress student session so the selected number cannot
// be swapped mid-lesson from the client after entry.
const STUDENT_SESSION_TOKEN_TTL_SEC = 2 * 60 * 60;
const STUDENT_SESSION_TOKEN_CACHE_PREFIX = 'student_session_v1:';

function getStudentSessionTokenCache_() {
  return CacheService.getScriptCache();
}

function buildStudentSessionTokenCacheKey_(token) {
  return `${STUDENT_SESSION_TOKEN_CACHE_PREFIX}${String(token || '').trim()}`;
}

function bytesToHex_(bytes) {
  return (bytes || []).map(byte => {
    const normalized = ((Number(byte) || 0) + 256) % 256;
    return normalized.toString(16).padStart(2, '0');
  }).join('');
}

function buildStudentSessionTenantKey_() {
  const rawTenantId = String(getTenantId_() || 'default').trim() || 'default';
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawTenantId);
  return bytesToHex_(digest).slice(0, 32);
}

function buildStudentSessionRecord_(studentNumber, lessonId, activeRevision) {
  const nowMs = Date.now();
  return {
    tenantKey: buildStudentSessionTenantKey_(),
    studentNumber: String(studentNumber || '').trim(),
    lessonId: String(lessonId || '').trim(),
    activeRevision: Number(activeRevision || 0),
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + (STUDENT_SESSION_TOKEN_TTL_SEC * 1000)).toISOString(),
  };
}

function issueStudentSessionToken_(studentNumber, lessonId, activeRevision) {
  const normalizedStudentNumber = String(studentNumber || '').trim();
  const normalizedLessonId = String(lessonId || '').trim();
  const normalizedActiveRevision = Number(activeRevision || 0);
  if (!normalizedStudentNumber || !normalizedLessonId || normalizedActiveRevision <= 0) return '';
  const token = makeId_('student_session');
  try {
    getStudentSessionTokenCache_().put(
      buildStudentSessionTokenCacheKey_(token),
      JSON.stringify(buildStudentSessionRecord_(normalizedStudentNumber, normalizedLessonId, normalizedActiveRevision)),
      STUDENT_SESSION_TOKEN_TTL_SEC
    );
  } catch (_err) {
    return '';
  }
  return token;
}

function readStudentSessionToken_(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;
  try {
    const raw = getStudentSessionTokenCache_().get(buildStudentSessionTokenCacheKey_(normalizedToken));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_err) {
    return null;
  }
}

function resolveActiveStudentSessionContext_(units) {
  const resolvedUnits = Array.isArray(units) ? units : getAllUnits();
  const active = buildLightweightActiveContext_(resolvedUnits);
  const activeLesson = active?.unitId && Number(active?.period || 0) > 0
    ? getLessonRecordByUnitPeriod_(active.unitId, active.period)
    : null;
  return {
    units: resolvedUnits,
    active,
    lesson: activeLesson,
    lessonId: String(activeLesson?.lessonId || '').trim(),
    activeRevision: Number(active?.activeRevision || 0),
  };
}

function resolveExpectedStudentSessionContextForLesson_(lesson, units, activeContext) {
  const resolvedActiveContext = activeContext && typeof activeContext === 'object'
    ? activeContext
    : resolveActiveStudentSessionContext_(units);
  const resolvedLessonId = String(lesson?.lessonId || '').trim();
  return {
    lessonId: resolvedLessonId,
    activeRevision: resolvedLessonId && resolvedLessonId === String(resolvedActiveContext.lessonId || '').trim()
      ? Number(resolvedActiveContext.activeRevision || 0)
      : 0,
  };
}

function assertStudentSessionTokenMatches_(token, studentNumber, expectedContext, options) {
  const normalizedToken = String(token || '').trim();
  const normalizedStudentNumber = String(studentNumber || '').trim();
  const context = expectedContext && typeof expectedContext === 'object' ? expectedContext : {};
  const opts = options && typeof options === 'object' ? options : {};
  if (!normalizedToken) {
    if (opts.allowMissing === true) return null;
    throw new Error('student_session_required');
  }
  const session = readStudentSessionToken_(normalizedToken);
  if (!session) {
    throw new Error('student_session_mismatch');
  }
  const expiresAtMs = Date.parse(String(session.expiresAt || ''));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error('student_session_expired');
  }
  if (String(session.tenantKey || '').trim() !== buildStudentSessionTenantKey_()
    || String(session.studentNumber || '').trim() !== normalizedStudentNumber
    || String(session.lessonId || '').trim() !== String(context.lessonId || '').trim()
    || Number(session.activeRevision || 0) !== Number(context.activeRevision || 0)) {
    throw new Error('student_session_mismatch');
  }
  return session;
}

function buildLightweightActiveContext_(units) {
  const cfg = readGlobalConfig();
  const normalizedUnitId = String(parseInt(cfg.active_unit, 10) || 0);
  const normalizedPeriod = parseInt(cfg.active_period, 10) || 0;
  const providedUnits = Array.isArray(units) ? units : [];
  const unit = providedUnits.find(item => String(item?.id || '') === normalizedUnitId) || null;
  return {
    unitId: normalizedUnitId,
    period: normalizedPeriod,
    unit,
    timelineFieldKey: String(cfg.active_timeline_field || '').trim(),
    activeRevision: parseInt(cfg.active_revision, 10) || 0,
  };
}

// studentInit:
// 入口選択後の最初の1画面を成立させる最小データを返す。
// 背景取得専用データや履歴系はここに寄せない。
function studentInit(num, periodOverride) {
  beginExecutionMemoScope_();
  try {
  const startedAt = Date.now();
  const timing = {};
  let t0 = Date.now();
  const active = getActiveSetting();
  const activeRevision = Number(active && active.activeRevision || 0);
  timing.activeMs = Date.now() - t0;
  const period = active.period > 0 ? active.period
               : (parseInt(periodOverride) > 0 ? parseInt(periodOverride) : 0);
  t0 = Date.now();
  const students = getStudentSelectableEntries_();
  timing.rosterMs = Date.now() - t0;
  timing.rosterCount = Array.isArray(students) ? students.length : 0;
  t0 = Date.now();
  const featureFlags = getAiFeatureFlags_();
  timing.featureFlagsMs = Date.now() - t0;
  t0 = Date.now();
  const shell = getLiveTenantMaintenanceState();
  timing.shellMs = Date.now() - t0;

  if (!active.unit || period === 0) {
    return attachStudentApiTiming_({
      needPeriodSelect: true,
      unit  : active.unit,
      units : active.units,
      period: 0,
      activeRevision,
      presets: getPresets(),
      students,
      studentAiEnabled: featureFlags.studentAiEnabled,
      studentAiAutoSubmitEnabled: featureFlags.studentAiAutoSubmitEnabled,
      shell,
    }, 'studentInit', startedAt, timing);
  }

  t0 = Date.now();
  const rosterStudent = students.find(student => String(student.number) === String(num));
  const studentName = rosterStudent?.name || '';
  const lesson = getOrCreateLesson_(active.unit.id, period);
  const enabledFields = getEnabledFields_({ fields: getLessonFields_(lesson, active.unit) });
  timing.lessonFieldsMs = Date.now() - t0;
  timing.fieldCount = Array.isArray(enabledFields) ? enabledFields.length : 0;
  t0 = Date.now();
  const state = buildStudentState_(active.unit, period, num, studentName, enabledFields, { includePrevReview: false });
  timing.stateMs = Date.now() - t0;

  return attachStudentApiTiming_(Object.assign({}, state, {
    needPeriodSelect: false,
    lessonId: String(lesson.lessonId || ''),
    activeRevision,
    studentSessionToken: issueStudentSessionToken_(num, lesson.lessonId, activeRevision),
    unit: active.unit,
    period,
    teacherSetPeriod: active.period > 0,
    teacherTimelineFieldKey: active.timelineFieldKey || '',
    studentAiEnabled: featureFlags.studentAiEnabled,
    studentAiAutoSubmitEnabled: featureFlags.studentAiAutoSubmitEnabled,
    shell,
  }), 'studentInit', startedAt, timing);
  } finally {
    endExecutionMemoScope_();
  }
}

function buildStudentEntryClassSnapshot_(students, featureFlags, shell) {
  const active = getActiveSetting();
  const unit = active && active.unit ? active.unit : null;
  const period = Number(active && active.period || 0);
  const activeRevision = Number(active && active.activeRevision || 0);
  if (!unit || period <= 0) return null;
  const lesson = getOrCreateLesson_(unit.id, period);
  if (!lesson || !lesson.lessonId) return null;

  const snapshot = getLessonLiveStateSnapshot_(unit.id, period, { createLesson: false })
    || getLessonRuntimeSnapshot_(unit.id, period, { createLesson: false })
    || {};
  const enabledFields = Array.isArray(snapshot.fields) && snapshot.fields.length
    ? snapshot.fields
    : getEnabledFields_({ fields: active.fields || unit.fields || [] });
  const responseMap = snapshot.responseMapByStudentNumber || {};

  const roster = Array.isArray(students) ? students : (snapshot.roster || getRosterEntries_());
  const rows = roster.map(student => buildStudentSnapshotTimelineRow_(student, enabledFields, responseMap));
  const statesByNumber = {};
  rows.forEach(row => {
    statesByNumber[String(row.num)] = buildStudentSnapshotState_(row, enabledFields, featureFlags, shell, lesson.lessonId, activeRevision);
  });

  return {
    lessonId: String(lesson.lessonId || ''),
    activeRevision,
    unit: {
      id: unit.id || '',
      subject: unit.subject || '',
      name: unit.name || '',
      maxPeriod: Number(unit.maxPeriod || 0),
    },
    period,
    teacherSetPeriod: true,
    teacherTimelineFieldKey: String(active.timelineFieldKey || '').trim(),
    fields: enabledFields,
    studentAiEnabled: Boolean(featureFlags && featureFlags.studentAiEnabled),
    studentAiAutoSubmitEnabled: Boolean(featureFlags && featureFlags.studentAiAutoSubmitEnabled),
    shell: shell || getLiveTenantMaintenanceState(),
    fetchedAt: nowIso_(),
    responseReadMeta: snapshot.responseReadMeta || null,
    statesByNumber,
    timeline: {
      rows,
      teacherTimelineFieldKey: String(active.timelineFieldKey || '').trim(),
      studentAiEnabled: Boolean(featureFlags && featureFlags.studentAiEnabled),
      studentAiAutoSubmitEnabled: Boolean(featureFlags && featureFlags.studentAiAutoSubmitEnabled),
      shell: shell || getLiveTenantMaintenanceState(),
      responseReadMeta: snapshot.responseReadMeta || null,
      serverNow: snapshot.serverNow || nowIso_(),
    },
  };
}

function buildStudentSnapshotTimelineRow_(student, fields, responseMap) {
  const number = student && student.number != null ? student.number : '';
  const response = responseMap[String(number)] || null;
  const rosterName = sanitizeStudentName_(student?.name);
  const responseName = sanitizeStudentName_(response?.studentName);
  return {
    num: number,
    name: rosterName || responseName,
    customs: response ? mapAnswersToCustoms_(fields, response.answersMap) : Array(fields.length).fill(''),
    comment: response?.comment || '',
    rank: response?.rank || '',
    medal: response?.medal || '',
    medalColor: getMedalColor_(response?.medal || ''),
    submitted: response?.submitted === true,
    score: Number(response?.score || 0),
    aiStatus: response?.aiStatus || '',
    aiQueuedAt: response?.aiQueuedAt || '',
    aiProcessedAt: response?.aiProcessedAt || '',
    aiError: response?.aiError || '',
    aiStartedAt: response?.aiStartedAt || '',
    aiLatencyMs: Number(response?.aiLatencyMs || 0),
    aiModelLatencyMs: Number(response?.aiModelLatencyMs || 0),
    responseUpdatedAt: response?.updatedAt || '',
  };
}

function buildStudentSnapshotState_(row, fields, featureFlags, shell, lessonId, activeRevision) {
  return {
    lessonId: String(lessonId || ''),
    activeRevision: Number(activeRevision || 0),
    fields,
    num: row.num,
    name: row.name || '',
    customs: Array.isArray(row.customs) ? row.customs : Array(fields.length).fill(''),
    comment: row.comment || '',
    rank: row.rank || '',
    medal: row.medal || '',
    medalColor: row.medalColor || '',
    submitted: row.submitted === true,
    aiStatus: row.aiStatus || '',
    prevReview: '',
    studentAiEnabled: Boolean(featureFlags && featureFlags.studentAiEnabled),
    studentAiAutoSubmitEnabled: Boolean(featureFlags && featureFlags.studentAiAutoSubmitEnabled),
    shell: shell || getLiveTenantMaintenanceState(),
  };
}

// studentLoadState:
// current lesson に対する児童本人の最新 state 再取得専用。
// 入口情報や名簿一覧は返さない前提で保つ。
function studentLoadState(unitId, period, num, studentSessionToken) {
  beginExecutionMemoScope_();
  try {
  const startedAt = Date.now();
  const timing = {};
  const normalizedPeriod = parseInt(period, 10) || 0;
  let t0 = Date.now();
  const units = getAllUnits();
  const unit = units.find(item => String(item.id) === String(unitId)) || null;
  timing.unitsMs = Date.now() - t0;
  t0 = Date.now();
  const lesson = getOrCreateLesson_(unitId, normalizedPeriod);
  const activeContext = resolveActiveStudentSessionContext_(units);
  const expectedContext = resolveExpectedStudentSessionContextForLesson_(lesson, units, activeContext);
  assertStudentSessionTokenMatches_(studentSessionToken, num, expectedContext);
  const enabledFields = getEnabledFields_({ fields: getLessonFields_(lesson, unit) });
  timing.lessonFieldsMs = Date.now() - t0;
  t0 = Date.now();
  const roster = getRosterEntries_();
  const rosterStudent = roster.find(student => String(student.number) === String(num));
  const studentName = rosterStudent?.name || '';
  timing.rosterMs = Date.now() - t0;
  t0 = Date.now();
  const payload = buildStudentState_(unit, normalizedPeriod, num, studentName, enabledFields, {
    includePrevReview: false,
    activeRevision: expectedContext.activeRevision,
    featureFlags: getAiFeatureFlags_(),
    shell: getLiveTenantMaintenanceState(),
  });
  timing.stateMs = Date.now() - t0;
  return attachStudentApiTiming_(payload, 'studentLoadState', startedAt, timing);
  } finally {
    endExecutionMemoScope_();
  }
}

function getEnabledFields_(unit) {
  return (unit.fields || []).filter(f => f.enabled !== false);
}

function buildTimelineRowDto_(student, fields, responseMap) {
  const number = student && student.number != null ? student.number : '';
  const response = responseMap[String(number)] || null;
  return {
    num: number,
    name: sanitizeStudentName_(response?.studentName) || sanitizeStudentName_(student?.name),
    customs: response ? mapAnswersToCustoms_(fields, response.answersMap) : Array(fields.length).fill(''),
    medal: response?.medal || '',
    medalColor: getMedalColor_(response?.medal || ''),
    submitted: response?.submitted === true,
    responseUpdatedAt: response?.updatedAt || '',
  };
}

function buildTimelinePrivateState_(studentNumber, fields, responseMap, lessonId, activeRevision) {
  const normalizedStudentNumber = String(studentNumber || '').trim();
  if (!normalizedStudentNumber) return null;
  const response = responseMap[normalizedStudentNumber] || null;
  return {
    lessonId: String(lessonId || ''),
    activeRevision: Number(activeRevision || 0),
    num: normalizedStudentNumber,
    name: sanitizeStudentName_(response?.studentName),
    customs: response ? mapAnswersToCustoms_(fields, response.answersMap) : Array(fields.length).fill(''),
    comment: response?.comment || '',
    rank: response?.rank || '',
    medal: response?.medal || '',
    medalColor: getMedalColor_(response?.medal || ''),
    submitted: response?.submitted === true,
    score: Number(response?.score || 0),
    aiStatus: response?.aiStatus || '',
    aiProcessedAt: response?.aiProcessedAt || '',
    responseUpdatedAt: response?.updatedAt || '',
  };
}

function buildTimelineSnapshotPayload_(snapshot, active, teacherTimelineFieldKey, shell, studentNumber, featureFlags) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const fields = Array.isArray(safeSnapshot.fields) ? safeSnapshot.fields : [];
  const roster = Array.isArray(safeSnapshot.roster) ? safeSnapshot.roster : [];
  const responseMap = safeSnapshot.responseMapByStudentNumber || {};
  const resolvedFeatureFlags = featureFlags && typeof featureFlags === 'object'
    ? featureFlags
    : {
        studentAiEnabled: isStudentAiEnabled_(),
        studentAiAutoSubmitEnabled: isStudentAiAutoSubmitEnabled_(),
      };
  const rows = roster.map(student => buildTimelineRowDto_(student, fields, responseMap));
  const lessonId = String(safeSnapshot.lesson?.lessonId || '');
  const activeLessonId = String(active?.lesson?.lessonId || '');
  const resolvedActiveRevision = activeLessonId && activeLessonId === lessonId ? Number(active?.activeRevision || 0) : 0;
  return {
    rows,
    myState: buildTimelinePrivateState_(studentNumber, fields, responseMap, lessonId, resolvedActiveRevision),
    serverNow: safeSnapshot.serverNow || nowIso_(),
    responseReadMeta: safeSnapshot.responseReadMeta || null,
    teacherTimelineFieldKey: teacherTimelineFieldKey || '',
    fields: fields.map(field => ({ key: field.key || '', label: field.label || '' })),
    studentAiEnabled: Boolean(resolvedFeatureFlags.studentAiEnabled),
    studentAiAutoSubmitEnabled: Boolean(resolvedFeatureFlags.studentAiAutoSubmitEnabled),
    lessonId,
    activeRevision: resolvedActiveRevision,
    active: {
      unitId: active && active.unitId ? String(active.unitId) : '',
      period: Number(active && active.period || 0),
      lessonId: activeLessonId,
      activeRevision: Number(active?.activeRevision || 0),
    },
    performanceMeta: safeSnapshot.performanceMeta || null,
    shell: shell || getLiveTenantMaintenanceState(),
  };
}

function getTimeline(unitId, period) {
  const startedAt = Date.now();
  const timing = {};
  let t0 = Date.now();
  const active = getActiveSetting();
  timing.activeMs = Date.now() - t0;
  t0 = Date.now();
  const snapshot = getLessonLiveStateSnapshot_(unitId, period)
    || getLessonRuntimeSnapshot_(unitId, period)
    || {};
  timing.snapshotMs = Date.now() - t0;
  t0 = Date.now();
  const payload = buildTimelineSnapshotPayload_(
    snapshot,
    active,
    active.timelineFieldKey || '',
    getLiveTenantMaintenanceState(),
    ''
  );
  timing.rowCount = Array.isArray(payload.rows) ? payload.rows.length : 0;
  timing.payloadBuildMs = Date.now() - t0;
  return attachStudentApiTiming_(payload, 'getTimeline', startedAt, timing);
}

function getTimelineSnapshot(lessonId, activeRevision, studentNumber, studentSessionToken) {
  beginExecutionMemoScope_();
  try {
  const startedAt = Date.now();
  const timing = {};
  const normalizedLessonId = String(lessonId || '').trim();
  const normalizedRevision = Number(activeRevision || 0);
  const normalizedStudentNumber = String(studentNumber || '').trim();
  const sessionValidationStartedAt = Date.now();
  let t0 = sessionValidationStartedAt;
  const activeConfig = readGlobalConfig();
  timing.sessionValidationConfigMs = Date.now() - t0;
  const activeUnitId = String(parseInt(activeConfig.active_unit, 10) || 0);
  const activePeriod = parseInt(activeConfig.active_period, 10) || 0;
  const activeRevisionNumber = parseInt(activeConfig.active_revision, 10) || 0;
  const activeTimelineFieldKey = String(activeConfig.active_timeline_field || '').trim();
  t0 = Date.now();
  const activeLesson = activeUnitId && activePeriod > 0
    ? getLessonRecordByUnitPeriod_(activeUnitId, activePeriod)
    : null;
  timing.sessionValidationActiveLessonMs = Date.now() - t0;
  const activeLessonId = String(activeLesson?.lessonId || '').trim();
  t0 = Date.now();
  assertStudentSessionTokenMatches_(studentSessionToken, normalizedStudentNumber, {
    lessonId: activeLessonId,
    activeRevision: activeRevisionNumber,
  }, { allowMissing: !normalizedStudentNumber });
  timing.sessionValidationTokenAssertMs = Date.now() - t0;
  timing.sessionValidationMs = Date.now() - sessionValidationStartedAt;
  t0 = Date.now();
  timing.configReadMs = Date.now() - t0;
  t0 = Date.now();
  const shell = getLiveTenantMaintenanceState();
  timing.shellMs = Date.now() - t0;
  t0 = Date.now();
  const featureFlags = {
    studentAiEnabled: isStudentAiEnabled_(),
    studentAiAutoSubmitEnabled: isStudentAiAutoSubmitEnabled_(),
  };
  timing.featureFlagsMs = Date.now() - t0;
  if (!normalizedLessonId || !activeLessonId || normalizedLessonId !== activeLessonId || normalizedRevision !== activeRevisionNumber) {
    t0 = Date.now();
    const payload = {
      rows: [],
      myState: null,
      fields: [],
      lessonId: normalizedLessonId,
      activeRevision: normalizedRevision,
      active: {
        unitId: activeUnitId,
        period: Number(activePeriod || 0),
        lessonId: activeLessonId,
        activeRevision: activeRevisionNumber,
      },
      teacherTimelineFieldKey: activeTimelineFieldKey,
      studentAiEnabled: Boolean(featureFlags.studentAiEnabled),
      studentAiAutoSubmitEnabled: Boolean(featureFlags.studentAiAutoSubmitEnabled),
      shell,
      serverNow: nowIso_(),
      responseReadMeta: null,
    };
    timing.lessonLookupMs = 0;
    timing.snapshotMs = 0;
    timing.rowCount = 0;
    timing.payloadBuildMs = Date.now() - t0;
    return attachStudentApiTiming_({
      ...payload,
    }, 'getTimelineSnapshot', startedAt, timing);
  }
  t0 = Date.now();
  const lesson = getLessonRecordById_(normalizedLessonId);
  timing.lessonLookupMs = Date.now() - t0;
  if (!lesson
    || String(lesson.lessonId || '').trim() !== activeLessonId
    || String(lesson.unitId || '').trim() !== activeUnitId
    || Number(lesson.period || 0) !== Number(activePeriod || 0)) {
    t0 = Date.now();
    const payload = {
      rows: [],
      myState: null,
      fields: [],
      lessonId: normalizedLessonId,
      activeRevision: normalizedRevision,
      active: {
        unitId: activeUnitId,
        period: Number(activePeriod || 0),
        lessonId: activeLessonId,
        activeRevision: activeRevisionNumber,
      },
      teacherTimelineFieldKey: activeTimelineFieldKey,
      studentAiEnabled: Boolean(featureFlags.studentAiEnabled),
      studentAiAutoSubmitEnabled: Boolean(featureFlags.studentAiAutoSubmitEnabled),
      shell,
      serverNow: nowIso_(),
      responseReadMeta: null,
    };
    timing.snapshotMs = 0;
    timing.rowCount = 0;
    timing.payloadBuildMs = Date.now() - t0;
    return attachStudentApiTiming_({
      ...payload,
    }, 'getTimelineSnapshot', startedAt, timing);
  }
  t0 = Date.now();
  let snapshot = getLessonLiveStateSnapshot_(lesson.unitId, lesson.period, {
    createLesson: false,
    lesson,
    units: [],
    requireRows: false,
  });
  if (snapshot
    && snapshot.performanceMeta
    && snapshot.performanceMeta.liveStateSnapshot
    && typeof snapshot.performanceMeta.liveStateSnapshot === 'object') {
    snapshot.performanceMeta.liveStateSnapshot.fallbackPath = 'live_state';
  }
  if (!snapshot) {
    snapshot = getLessonRuntimeSnapshot_(lesson.unitId, lesson.period, {
      createLesson: false,
      lesson,
      units: [],
    });
    if (snapshot) {
      snapshot.performanceMeta = buildTimelineSnapshotFallbackPerformanceMeta_('runtime_snapshot');
    }
  }
  if (!snapshot) {
    const fallbackUnit = Array.isArray(lesson.fields) && lesson.fields.length
      ? null
      : (getAllUnits().find(item => String(item.id || '') === String(lesson.unitId || '')) || null);
    snapshot = {
      lesson,
      unit: fallbackUnit,
      period: Number(lesson.period || 0),
      fields: getEnabledFields_({ fields: getLessonFields_(lesson, fallbackUnit) }),
      roster: getRosterEntries_(),
      responseMapByStudentNumber: {},
      responseReadMeta: null,
      performanceMeta: buildTimelineSnapshotFallbackPerformanceMeta_('empty_snapshot'),
      serverNow: nowIso_(),
    };
  }
  timing.snapshotMs = Date.now() - t0;
  t0 = Date.now();
  const payload = buildTimelineSnapshotPayload_(
    snapshot,
    {
      unitId: activeUnitId,
      period: activePeriod,
      activeRevision: activeRevisionNumber,
      timelineFieldKey: activeTimelineFieldKey,
      lesson: activeLesson,
    },
    activeTimelineFieldKey,
    shell,
    normalizedStudentNumber,
    featureFlags
  );
  logTimelineSnapshotDiagnostics_(snapshot);
  timing.rowCount = Array.isArray(payload.rows) ? payload.rows.length : 0;
  timing.payloadBuildMs = Date.now() - t0;
  return attachStudentApiTiming_(payload, 'getTimelineSnapshot', startedAt, timing);
  } finally {
    endExecutionMemoScope_();
  }
}

function getStudentPreviousReview(unitId, period, num, studentSessionToken) {
  beginExecutionMemoScope_();
  try {
  const startedAt = Date.now();
  const timing = {};
  const normalizedUnitId = String(unitId || '').trim();
  const normalizedPeriod = parseInt(period, 10) || 0;
  const normalizedNum = String(num || '').trim();
  if (!normalizedUnitId || normalizedPeriod <= 1 || !normalizedNum) {
    return attachStudentApiTiming_({ prevReview: '', previousNextGoal: '' }, 'getStudentPreviousReview', startedAt, timing);
  }
  let t0 = Date.now();
  const units = getAllUnits();
  const unit = units.find(item => String(item.id) === normalizedUnitId) || null;
  const lesson = getOrCreateLesson_(normalizedUnitId, normalizedPeriod);
  const activeContext = resolveActiveStudentSessionContext_(units);
  assertStudentSessionTokenMatches_(
    studentSessionToken,
    normalizedNum,
    resolveExpectedStudentSessionContextForLesson_(lesson, units, activeContext)
  );
  timing.unitsMs = Date.now() - t0;
  t0 = Date.now();
  const payload = getPreviousStudentLearningContextFromDb_(normalizedUnitId, normalizedPeriod, normalizedNum, unit);
  timing.previousContextMs = Date.now() - t0;
  return attachStudentApiTiming_(payload, 'getStudentPreviousReview', startedAt, timing);
  } finally {
    endExecutionMemoScope_();
  }
}

function attachStudentApiTiming_(payload, apiName, startedAt, timing) {
  const wrapperStartedAt = Date.now();
  const result = payload && typeof payload === 'object' ? payload : {};
  const meta = timing && typeof timing === 'object' ? timing : {};
  meta.api = String(apiName || '');
  try {
    const stringifyStartedAt = Date.now();
    const json = JSON.stringify(result);
    meta.jsonStringifyMs = Date.now() - stringifyStartedAt;
    meta.payloadBytes = json.length;
  } catch (_err) {
    meta.jsonStringifyMs = 0;
    meta.payloadBytes = 0;
  }
  meta.wrapperMs = Math.max(0, Date.now() - wrapperStartedAt - Number(meta.jsonStringifyMs || 0));
  meta.totalMs = Date.now() - Number(startedAt || Date.now());
  const accountedMs = [
    'sessionValidationMs',
    'configReadMs',
    'lessonLookupMs',
    'shellMs',
    'featureFlagsMs',
    'snapshotMs',
    'payloadBuildMs',
    'jsonStringifyMs',
    'wrapperMs',
  ].reduce((sum, key) => sum + Math.max(0, Number(meta[key] || 0)), 0);
  meta.unaccountedMs = Math.max(0, meta.totalMs - accountedMs);
  result.timing = meta;
  return result;
}

function buildTimelineSnapshotFallbackPerformanceMeta_(fallbackPath) {
  const liveStateSnapshot = {
    fallbackPath: String(fallbackPath || 'none'),
    backfillPath: 'none',
    backfillCount: 0,
    cacheHit: false,
    cacheMiss: true,
    masterApiCalls: 0,
  };
  if (isTimelineSnapshotDiagnosticsEnabled_()) {
    const diagnostics = getExecutionDiagnostics_();
    liveStateSnapshot.ensureDbSheetsCalls = Number(diagnostics.ensureDbSheetsCalls || 0);
    liveStateSnapshot.ensureSheetWithHeadersCalls = Number(diagnostics.ensureSheetWithHeadersCalls || 0);
    liveStateSnapshot.spreadsheetApiApproxCalls = Number(diagnostics.spreadsheetApiApproxCalls || 0);
  }
  return {
    liveStateSnapshot,
  };
}

function logTimelineSnapshotDiagnostics_(snapshot) {
  if (!isTimelineSnapshotDiagnosticsEnabled_()) return;
  const liveStateMetrics = snapshot
    && snapshot.performanceMeta
    && snapshot.performanceMeta.liveStateSnapshot
    && typeof snapshot.performanceMeta.liveStateSnapshot === 'object'
    ? snapshot.performanceMeta.liveStateSnapshot
    : null;
  if (!liveStateMetrics) return;
  const executionDiagnostics = getExecutionDiagnostics_();
  try {
    console.log('[timeline_snapshot_diag] ' + JSON.stringify({
      liveStateHit: liveStateMetrics.cacheHit === true,
      runtimeFallback: liveStateMetrics.fallbackPath === 'runtime_snapshot',
      finalFallback: liveStateMetrics.fallbackPath === 'empty_snapshot',
      backfill: {
        path: String(liveStateMetrics.backfillPath || 'none'),
        count: Number(liveStateMetrics.backfillCount || 0),
      },
      ensureDbSheetsCalls: Number(executionDiagnostics.ensureDbSheetsCalls || 0),
      ensureSheetWithHeadersCalls: Number(executionDiagnostics.ensureSheetWithHeadersCalls || 0),
      spreadsheetApiApproxCalls: Number(executionDiagnostics.spreadsheetApiApproxCalls || 0),
      masterApiCalls: Number(liveStateMetrics.masterApiCalls || 0),
    }));
  } catch (_err) {}
}

function getStudentPastRecords(num, unitId, limit, studentSessionToken) {
  const normalizedNum = String(num || '').trim();
  const activeContext = resolveActiveStudentSessionContext_();
  assertStudentSessionTokenMatches_(studentSessionToken, normalizedNum, {
    lessonId: activeContext.lessonId,
    activeRevision: activeContext.activeRevision,
  });
  if (!normalizedNum) {
    return { ok: false, groups: [], error: '番号がありません。' };
  }
  const normalizedLimit = Math.max(3, Math.min(12, Number(limit || 6) || 6));
  const currentUnitId = String(unitId || '').trim();
  const currentUnit = getAllUnits().find(unit => String(unit.id) === currentUnitId) || null;
  const portfolio = getStudentPortfolioData(normalizedNum, '');
  const allRows = (portfolio.rows || []).slice().sort(compareStudentPastRecordRowsDesc_);
  const groups = buildStudentPastRecordGroups_(allRows, currentUnit, normalizedLimit);
  return {
    ok: true,
    build: APP_BUILD,
    studentNumber: normalizedNum,
    studentName: portfolio.studentName || '',
    currentUnitId,
    groups,
  };
}

function buildStudentPastRecordGroups_(rows, currentUnit, limit) {
  const groups = [];
  const currentUnitRows = rows
    .filter(row => isCurrentUnitPastRecord_(row, currentUnit))
    .slice(0, limit);
  if (currentUnitRows.length) {
    groups.push(makeStudentPastRecordGroup_('unit', 'この単元', currentUnitRows));
  }

  const subjectOrder = [];
  const subjectMap = {};
  rows.forEach(row => {
    const subject = String(row?.subject || '').trim();
    if (!subject) return;
    if (!subjectMap[subject]) {
      subjectMap[subject] = [];
      subjectOrder.push(subject);
    }
    if (subjectMap[subject].length < limit) {
      subjectMap[subject].push(row);
    }
  });
  subjectOrder.forEach(subject => {
    const list = subjectMap[subject] || [];
    if (!list.length) return;
    groups.push(makeStudentPastRecordGroup_(`subject:${subject}`, subject, list));
  });
  return groups;
}

function makeStudentPastRecordGroup_(key, label, rows) {
  return {
    key,
    label,
    rows: (rows || []).map(mapStudentPastRecordRow_),
  };
}

function mapStudentPastRecordRow_(row) {
  const review = String(row?.review || '');
  const reviewField = getStudentPastRecordReviewField_(row);
  return {
    unitId: row?.unitId || '',
    unitName: row?.unitName || '',
    subject: row?.subject || '',
    period: row?.period || '',
    date: row?.date || '',
    review,
    rank: row?.rank || '',
    score: Number(row?.score || 0),
    medal: row?.medal || '',
    comment: row?.comment || '',
    chips: collectStudentPastRecordChips_(row),
    reviewLength: stripStudentPastRecordHintLines_(review, reviewField).length,
  };
}

function isCurrentUnitPastRecord_(row, currentUnit) {
  if (!currentUnit || !row) return false;
  if (String(row.unitId || '') === String(currentUnit.id || '')) return true;
  return String(row.subject || '') === String(currentUnit.subject || '')
    && String(row.unitName || '') === String(currentUnit.name || '');
}

function compareStudentPastRecordRowsDesc_(a, b) {
  const dateDiff = getStudentPastRecordDateKey_(b) - getStudentPastRecordDateKey_(a);
  if (dateDiff) return dateDiff;
  const periodDiff = Number(b?.period || 0) - Number(a?.period || 0);
  if (periodDiff) return periodDiff;
  const subjectCmp = String(a?.subject || '').localeCompare(String(b?.subject || ''));
  if (subjectCmp) return subjectCmp;
  return String(a?.unitName || '').localeCompare(String(b?.unitName || ''));
}

function getStudentPastRecordDateKey_(row) {
  const raw = String(row?.date || '').replace(/[^\d]/g, '');
  return Number(raw || 0);
}

function collectStudentPastRecordChips_(row) {
  const reviewField = getStudentPastRecordReviewField_(row);
  const labels = getStudentPastRecordHintLabels_(reviewField);
  if (!labels.length) return [];
  const reviewText = String(row?.review || '');
  return labels.filter(label => label && reviewText.indexOf(label) >= 0).slice(0, 6);
}

function getStudentPastRecordReviewField_(row) {
  return (row?.fields || []).find(field => String(field?.type || '') === 'review') || null;
}

function getStudentPastRecordHintLabels_(field) {
  return String(field?.hints || '')
    .split(',')
    .map(text => String(text || '').trim())
    .filter(Boolean);
}

function stripStudentPastRecordHintLines_(text, field) {
  const labels = getStudentPastRecordHintLabels_(field);
  if (!labels.length) return String(text || '').trim();
  let stripped = String(text || '');
  labels.forEach(label => {
    if (!label) return;
    stripped = stripped.split(label).join('');
  });
  return stripped.replace(/\n{3,}/g, '\n\n').trim();
}

function findRosterStudentName_(num) {
  const roster = getRosterEntries_();
  return sanitizeStudentName_((roster.find(student => String(student.number) === String(num)) || {}).name);
}

function resolveStudentForWrite_(lessonId, num, studentName) {
  const response = getResponseRecordByStudentNumber_(lessonId, num);
  if (response?.studentId) {
    return {
      studentId: response.studentId,
      number: String(num || ''),
      name: sanitizeStudentName_(response.studentName) || sanitizeStudentName_(studentName),
    };
  }
  return getOrCreateStudent_(num, studentName);
}

function buildStudentState_(unit, period, num, studentName, enabledFields, options) {
  const opts = options || {};
  const unitId = unit?.id || '';
  const lesson = getOrCreateLesson_(unitId, period);
  const response = getResponseRecordByStudentNumber_(lesson.lessonId, num);
  const masterUsed = String(response?.readSource || '') === 'master';
  const responseReadMeta = {
    scope: 'lesson',
    lessonId: String(lesson.lessonId || ''),
    preferMaster: false,
    masterCount: masterUsed && response ? 1 : 0,
    mergedCount: response ? 1 : 0,
    mode: masterUsed ? 'tenant_with_master_fallback' : 'tenant_primary',
    source: masterUsed ? 'master_fallback' : 'tenant_responses',
    masterUsed,
  };
  const customs = response
    ? mapAnswersToCustoms_(enabledFields, response.answersMap)
    : Array(enabledFields.length).fill('');
  const previousContext = opts.includePrevReview === true
    ? getPreviousStudentLearningContextFromDb_(unitId, period, num, unit)
    : { prevReview: '', previousNextGoal: '' };
  return {
    lessonId: String(lesson.lessonId || ''),
    activeRevision: Number(opts.activeRevision || 0),
    fields: enabledFields,
    num,
    name: sanitizeStudentName_(studentName) || sanitizeStudentName_(response?.studentName),
    customs,
    comment: response?.comment || '',
    rank: response?.rank || '',
    medal: response?.medal || '',
    medalColor: getMedalColor_(response?.medal || ''),
    submitted: response ? response.submitted : false,
    aiStatus: response?.aiStatus || '',
    prevReview: previousContext.prevReview || '',
    previousNextGoal: previousContext.previousNextGoal || '',
    responseReadMeta,
    studentAiEnabled: opts.featureFlags ? opts.featureFlags.studentAiEnabled : isStudentAiEnabled_(),
    studentAiAutoSubmitEnabled: opts.featureFlags ? opts.featureFlags.studentAiAutoSubmitEnabled : isStudentAiAutoSubmitEnabled_(),
    shell: opts.shell || getLiveTenantMaintenanceState(),
  };
}

function buildTimelinePayload_(unitId, period, unit, fields, teacherTimelineFieldKey, studentAiEnabled, snapshot) {
  const runtime = snapshot || getLessonRuntimeSnapshot_(unitId, period) || {};
  const responseMap = runtime.responseMapByStudentNumber || {};
  const rows = (runtime.roster || getRosterEntries_()).map(student => {
    const response = responseMap[String(student.number)];
    return {
      num: student.number,
      name: response?.studentName || student.name || '',
      customs: response ? mapAnswersToCustoms_(fields, response.answersMap) : Array(fields.length).fill(''),
      comment: response?.comment || '',
      rank: response?.rank || '',
      medal: response?.medal || '',
      medalColor: getMedalColor_(response?.medal || ''),
      submitted: response?.submitted === true,
      score: response?.score || 0,
      aiStatus: response?.aiStatus || '',
      aiProcessedAt: response?.aiProcessedAt || '',
      responseUpdatedAt: response?.updatedAt || '',
    };
  });
  return {
    rows,
    serverNow: runtime.serverNow || nowIso_(),
    responseReadMeta: runtime.responseReadMeta || null,
    teacherTimelineFieldKey: teacherTimelineFieldKey || '',
    fields: fields.map(field => ({ key: field.key || '', label: field.label || '' })),
    studentAiEnabled: studentAiEnabled === true,
    studentAiAutoSubmitEnabled: isStudentAiAutoSubmitEnabled_(),
  };
}

function getMedalColor_(medal) {
  const idx = MEDALS.indexOf(medal);
  return idx >= 0 ? MEDAL_COLORS[idx] : '';
}

function hasResponseSnapshotChanged_(response, fields, customs, submitted) {
  const currentAnswersMap = buildAnswersMap_(fields, customs || []);
  const currentReview = extractReviewText_(fields, currentAnswersMap);
  if (!response) {
    return Boolean(currentReview) || Object.keys(currentAnswersMap).some(key => String(currentAnswersMap[key] || '').trim()) || submitted === true;
  }
  const previousAnswersJson = JSON.stringify(response.answersMap || {});
  const nextAnswersJson = JSON.stringify(currentAnswersMap);
  if (previousAnswersJson !== nextAnswersJson) return true;
  if (String(response.reviewText || '') !== String(currentReview || '')) return true;
  if (Boolean(response.submitted) !== Boolean(submitted)) return true;
  return false;
}

function writeStudentSaveAuditLogSafe_(params) {
  try {
    writeAuditLog_(params);
  } catch (_err) {}
}

function logStudentSavePerf_(action, metrics) {
  try {
    console.log('[student_save_perf] ' + JSON.stringify({
      action: String(action || ''),
      timestamp: nowIso_(),
      lockWaitMs: Number(metrics?.lockWaitMs || 0),
      lockHoldMs: Number(metrics?.lockHoldMs || 0),
      rpcTotalMs: Number(metrics?.rpcTotalMs || 0),
      responseWriteMs: Number(metrics?.responseWriteMs || 0),
      lessonLiveStateMs: Number(metrics?.lessonLiveStateMs || 0),
      cacheUpdateMs: Number(metrics?.cacheUpdateMs || 0),
      masterMirrorMs: Number(metrics?.masterMirrorMs || 0),
      masterMirrorFailed: metrics?.masterMirrorFailed === true,
      liveStateUpdated: metrics?.liveStateUpdated !== false,
      lockBusy: metrics?.lockBusy === true,
    }));
  } catch (_err) {}
}

function runResponsePostPersistTasks_(saved, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const metrics = opts.metrics && typeof opts.metrics === 'object' ? opts.metrics : {};
  const rowValues = Array.isArray(saved?.responseRowValues) ? saved.responseRowValues : [];
  const responseId = String(saved?.responseId || rowValues[0] || '').trim();
  if (!rowValues.length) {
    metrics.cacheUpdateMs = Number(metrics.cacheUpdateMs || 0);
    metrics.masterMirrorMs = Number(metrics.masterMirrorMs || 0);
    metrics.masterMirrorFailed = false;
    return { mirrored: 0, failed: 0 };
  }

  let t0 = Date.now();
  try {
    writeResponseRowCaches_(rowValues, saved?.responseRowNumber);
    cacheResponseRows_([rowValues]);
    metrics.cacheUpdateMs = Date.now() - t0;
  } catch (err) {
    metrics.cacheUpdateMs = Date.now() - t0;
    writeStudentSaveAuditLogSafe_({
      targetType: 'response',
      targetId: responseId,
      action: String(opts.cacheAuditAction || 'response_cache_update_failed_after_save'),
      before: null,
      after: {
        error: String(err && err.message ? err.message : err),
        lessonId: String(saved?.lesson?.lessonId || rowValues[1] || ''),
      },
      actor: String(opts.actor || 'student'),
    });
  }

  t0 = Date.now();
  try {
    const mirrorResult = mirrorResponseRowsWithAudit_(
      [rowValues],
      String(opts.mirrorSource || 'student_response_write'),
      String(opts.mirrorAction || 'master_response_mirror_failed_after_save'),
      String(opts.actor || 'student')
    );
    metrics.masterMirrorMs = Date.now() - t0;
    metrics.masterMirrorFailed = Number(mirrorResult?.failed || 0) > 0;
    return mirrorResult;
  } catch (err) {
    metrics.masterMirrorMs = Date.now() - t0;
    metrics.masterMirrorFailed = true;
    writeStudentSaveAuditLogSafe_({
      targetType: 'response',
      targetId: responseId,
      action: String(opts.mirrorAuditAction || 'master_response_mirror_exception_after_save'),
      before: null,
      after: {
        error: String(err && err.message ? err.message : err),
        lessonId: String(saved?.lesson?.lessonId || rowValues[1] || ''),
      },
      actor: String(opts.actor || 'student'),
    });
    return { mirrored: 0, failed: 1 };
  }
}

function autoSave(unitId, period, num, customs, studentSessionToken) {
  beginExecutionMemoScope_();
  try {
  const startedAt = Date.now();
  const units  = getAllUnits();
  const unit   = units.find(u => u.id == unitId);
  const lesson = getOrCreateLesson_(unitId, period);
  const activeContext = resolveActiveStudentSessionContext_(units);
  assertStudentSessionTokenMatches_(
    studentSessionToken,
    num,
    resolveExpectedStudentSessionContextForLesson_(lesson, units, activeContext)
  );
  const fields = getEnabledFields_({ fields: getLessonFields_(lesson, unit) });
  const studentName = findRosterStudentName_(num);
  const existingResponse = getResponseRecordByStudentNumber_(lesson.lessonId, num);
  if (!hasResponseSnapshotChanged_(existingResponse, fields, customs || [], false)) {
    return { ok: true, skipped: true, reason: 'unchanged' };
  }
  const lock = LockService.getDocumentLock();
  const lockRequestedAt = Date.now();
  if (!lock.tryLock(LOCK_AUTOSAVE_MS)) {
    logStudentSavePerf_('autoSave', {
      lockBusy: true,
      lockWaitMs: Date.now() - lockRequestedAt,
      lockHoldMs: 0,
      rpcTotalMs: Date.now() - startedAt,
      responseWriteMs: 0,
      lessonLiveStateMs: 0,
      cacheUpdateMs: 0,
      masterMirrorMs: 0,
      masterMirrorFailed: false,
      liveStateUpdated: false,
    });
    return {
      ok: false,
      code: 'save_busy',
      retriable: true,
      reason: 'busy',
      error: '保存が混み合っています。数秒後に再試行してください。',
    };
  }
  const metrics = {
    lockWaitMs: Date.now() - lockRequestedAt,
    lockHoldMs: 0,
    rpcTotalMs: 0,
    responseWriteMs: 0,
    lessonLiveStateMs: 0,
    cacheUpdateMs: 0,
    masterMirrorMs: 0,
    masterMirrorFailed: false,
    liveStateUpdated: true,
  };
  const persistTimings = {};
  const lockAcquiredAt = Date.now();
  let saved = null;
  try {
    const student = resolveStudentForWrite_(lesson.lessonId, num, studentName);
    saved = saveResponseSnapshotToDb_(unitId, period, num, studentName, fields, customs || [], {
      submitted: false,
      lesson,
      student,
      persistTimings,
    });
    metrics.responseWriteMs = Number(persistTimings.responseWriteMs || 0);
    metrics.lessonLiveStateMs = Number(persistTimings.lessonLiveStateMs || 0);
    metrics.liveStateUpdated = saved?.liveStateUpdated !== false;
    return { ok: true };
  } finally {
    metrics.lockHoldMs = Date.now() - lockAcquiredAt;
    lock.releaseLock();
    if (saved) {
      runResponsePostPersistTasks_(saved, {
        actor: 'student_auto_save',
        mirrorSource: 'student_auto_save',
        mirrorAction: 'master_response_mirror_failed_auto_save',
        mirrorAuditAction: 'master_response_mirror_exception_auto_save',
        cacheAuditAction: 'response_cache_update_failed_auto_save',
        metrics,
      });
    }
    metrics.rpcTotalMs = Date.now() - startedAt;
    logStudentSavePerf_('autoSave', metrics);
  }
  } finally {
    endExecutionMemoScope_();
  }
}

function submitReview(unitId, period, num, customs, submitOptions, studentSessionToken) {
  beginExecutionMemoScope_();
  try {
  const startedAt = Date.now();
  const units  = getAllUnits();
  const unit   = units.find(u => u.id == unitId);
  const lesson = getOrCreateLesson_(unitId, period);
  const activeContext = resolveActiveStudentSessionContext_(units);
  assertStudentSessionTokenMatches_(
    studentSessionToken,
    num,
    resolveExpectedStudentSessionContextForLesson_(lesson, units, activeContext)
  );
  const fields = getEnabledFields_({ fields: getLessonFields_(lesson, unit) });
  const studentName = findRosterStudentName_(num);
  const opts = submitOptions && typeof submitOptions === 'object' ? submitOptions : {};
  const saveAnswers = opts.saveAnswers !== false;
  const existingResponse = getResponseRecordByStudentNumber_(lesson.lessonId, num);
  const sourceCustoms = saveAnswers
    ? (customs || [])
    : (existingResponse ? mapAnswersToCustoms_(fields, existingResponse.answersMap || {}) : []);
  const answersMap = buildAnswersMap_(fields, sourceCustoms);
  const review = extractReviewText_(fields, answersMap);

  if (!review || review.length < 5) {
    return { ok: false, error: 'ふりかえりをもっとくわしくかいてね！' };
  }

  const lock = LockService.getDocumentLock();
  const lockRequestedAt = Date.now();
  if (!lock.tryLock(LOCK_SUBMIT_MS)) {
    logStudentSavePerf_('submitReview', {
      lockBusy: true,
      lockWaitMs: Date.now() - lockRequestedAt,
      lockHoldMs: 0,
      rpcTotalMs: Date.now() - startedAt,
      responseWriteMs: 0,
      lessonLiveStateMs: 0,
      cacheUpdateMs: 0,
      masterMirrorMs: 0,
      masterMirrorFailed: false,
      liveStateUpdated: false,
    });
    return { ok: false, error: 'いま提出が混み合っています。数秒後にもう一度ていしゅつしてください。' };
  }
  const metrics = {
    lockWaitMs: Date.now() - lockRequestedAt,
    lockHoldMs: 0,
    rpcTotalMs: 0,
    responseWriteMs: 0,
    lessonLiveStateMs: 0,
    cacheUpdateMs: 0,
    masterMirrorMs: 0,
    masterMirrorFailed: false,
    liveStateUpdated: true,
  };
  const persistTimings = {};
  let result = null;
  let saved = null;
  const lockAcquiredAt = Date.now();
  const studentAiEnabled = isStudentAiEnabled_();
  const studentAiAutoSubmitEnabled = studentAiEnabled && isStudentAiAutoSubmitEnabled_();
  try {
    const student = resolveStudentForWrite_(lesson.lessonId, num, studentName);
    saved = saveResponseSnapshotToDb_(unitId, period, num, studentName, fields, sourceCustoms, {
      submitted: true,
      queueStudentAi: studentAiAutoSubmitEnabled,
      lesson,
      student,
      deferHistory: true,
      persistTimings,
    });
    metrics.responseWriteMs = Number(persistTimings.responseWriteMs || 0);
    metrics.lessonLiveStateMs = Number(persistTimings.lessonLiveStateMs || 0);
    metrics.liveStateUpdated = saved?.liveStateUpdated !== false;
    result = {
      ok: true,
      queuedAi: studentAiAutoSubmitEnabled,
      isRewrite: saved?.isRewrite === true,
      studentAiEnabled,
      studentAiAutoSubmitEnabled,
    };
  } finally {
    metrics.lockHoldMs = Date.now() - lockAcquiredAt;
    lock.releaseLock();
  }
  if (saved) {
    runResponsePostPersistTasks_(saved, {
      actor: 'student_submit',
      mirrorSource: 'student_submit',
      mirrorAction: 'master_response_mirror_failed_submit',
      mirrorAuditAction: 'master_response_mirror_exception_submit',
      cacheAuditAction: 'response_cache_update_failed_submit',
      metrics,
    });
  }
  if (studentAiAutoSubmitEnabled && saved) {
    try {
      writeAiEventLogs_([
        {
          responseId: saved.responseId,
          lessonId: saved.lesson.lessonId,
          unitId,
          studentId: saved.student.studentId,
          studentNumber: num,
          studentName: studentName || saved.student.name || '',
          eventType: 'submitted',
          aiStatus: 'pending',
          detail: saved.isRewrite ? 'rewrite submit' : 'submit',
          timestamp: nowIso_(),
        },
        {
          responseId: saved.responseId,
          lessonId: saved.lesson.lessonId,
          unitId,
          studentId: saved.student.studentId,
          studentNumber: num,
          studentName: studentName || saved.student.name || '',
          eventType: 'queued',
          aiStatus: 'pending',
          detail: `rescueDelay=${AI_TRIGGER_SHORT_RESCUE_DELAY_MS}ms`,
          timestamp: nowIso_(),
        },
      ]);
    } catch (err) {
      writeStudentSaveAuditLogSafe_({
        targetType: 'response',
        targetId: saved.responseId || '',
        action: 'ai_event_log_failed_after_submit',
        before: null,
        after: { error: String(err && err.message ? err.message : err) },
        actor: 'student_submit',
      });
    }
  }
  if (result && result.ok && saved?.historyEntry) {
    try {
      appendResponseHistory_(saved.historyEntry);
    } catch (err) {
      writeStudentSaveAuditLogSafe_({
        targetType: 'response',
        targetId: saved.responseId || '',
        action: 'history_append_failed_after_submit',
        before: null,
        after: { error: String(err && err.message ? err.message : err) },
        actor: 'student_submit',
      });
    }
  }
  if (studentAiAutoSubmitEnabled) {
    safeEnsureAiBatchTrigger_(AI_TRIGGER_SHORT_RESCUE_DELAY_MS, 'submitReview');
  }
  metrics.rpcTotalMs = Date.now() - startedAt;
  logStudentSavePerf_('submitReview', metrics);
  return result;
  } finally {
    endExecutionMemoScope_();
  }
}

function queueAiRescueTrigger() {
  if (!isStudentAiEnabled_()) {
    return { ok: true, skipped: true, reason: 'student_ai_disabled' };
  }
  safeEnsureAiBatchTrigger_(AI_TRIGGER_SHORT_RESCUE_DELAY_MS, 'queueAiRescueTrigger');
  return { ok: true };
}

function processReviewAi(unitId, period, num, customs) {
  if (!isStudentAiEnabled_()) {
    return { ok: true, queued: false, skipped: true, reason: 'student_ai_disabled' };
  }
  safeEnsureAiBatchTrigger_(AI_TRIGGER_SHORT_RESCUE_DELAY_MS, 'student_processReviewAi');
  return { ok: true, queued: true };
}

function seedAiLoadTest(unitId, period, count) {
  try {
    const unit = getAllUnits().find(row => String(row.id) === String(unitId || ''));
    if (!unit) throw new Error('単元が見つかりません。');
    if (!period) throw new Error('時間目が選ばれていません。');
    const lesson = getOrCreateLesson_(unitId, period);

    const roster = getRosterEntries_().filter(row => row.active !== false);
    const requested = Math.max(1, Math.min(Number(count || 0) || 12, roster.length || 0));
    if (!requested) throw new Error('名簿がありません。');

    const fields = getEnabledFields_(unit || {});
    const targetStudents = roster.slice(0, requested);
    let createdCount = 0;
    const batchKey = makeId_('loadtest');

    targetStudents.forEach((student, index) => {
      const customs = buildAiLoadTestCustoms_(fields, student, index);
      const saved = createAiLoadTestResponse_(lesson, unitId, period, student, fields, customs, batchKey, index);
      createdCount++;
      writeAiEventLogs_([{
        responseId: saved.responseId,
        lessonId: saved.lessonId,
        unitId: String(unitId || ''),
        studentId: saved.studentId,
        studentNumber: saved.studentNumber,
        studentName: saved.studentName,
        eventType: 'submitted',
        aiStatus: 'pending',
        detail: 'load_test submit',
        timestamp: nowIso_(),
      }, {
        responseId: saved.responseId,
        lessonId: saved.lessonId,
        unitId: String(unitId || ''),
        studentId: saved.studentId,
        studentNumber: saved.studentNumber,
        studentName: saved.studentName,
        eventType: 'queued',
        aiStatus: 'pending',
        detail: `load_test rescueDelay=${AI_TRIGGER_RESCUE_DELAY_MS}ms`,
        timestamp: nowIso_(),
      }]);
    });

    safeEnsureAiBatchTrigger_(AI_TRIGGER_SHORT_RESCUE_DELAY_MS, 'teacher_load_test');
    const kick = tryProcessPendingAiInline_('teacher_load_test');
    return {
      ok: true,
      count: createdCount,
      kickStatus: String(kick?.skipped || (kick?.processed ? 'processed' : 'ok')),
      queue: getAiQueueHealth_(),
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err && err.message ? err.message : err),
    };
  }
}

function clearAiLoadTest(unitId, period) {
  const lesson = getOrCreateLesson_(unitId, period);
  const lessonPrefix = getAiLoadTestLessonPrefix_(lesson.lessonId);
  const loadTestResponses = listAllResponses_().filter(response => {
    return String(response?.lessonId || '').startsWith(lessonPrefix)
      && isAiLoadTestResponse_(response);
  });
  const removedResponses = deleteResponseRowsFromMaster_(
    loadTestResponses,
    'response_load_test_clear',
    'master_response_delete_failed_load_test_clear',
    'system'
  ).deleted;
  deleteRowsFromSheet_(getResponsesDbSheet_(), RESPONSE_HEADERS.length, row => {
    return String(row[1] || '').startsWith(lessonPrefix) && isAiLoadTestRow_(row);
  });
  const removedHistory = deleteRowsFromSheet_(getResponseHistoryDbSheet_(), HISTORY_HEADERS.length, row => {
    return String(row[2] || '').startsWith(lessonPrefix) && String(row[5] || '').includes(AI_LOAD_TEST_PREFIX);
  });
  const removedAggregate = 0;
  const removedAssessments = deleteRowsFromSheet_(getTeacherAssessmentsDbSheet_(), ASSESS_HEADERS.length, row => {
    return String(row[1] || '') === String(unitId || '')
      && /^T\d+$/i.test(String(row[2] || '').trim());
  });
  return {
    ok: true,
    removedResponses,
    removedHistory,
    removedAggregate,
    removedAssessments,
    queue: getAiQueueHealth_(),
  };
}

function createAiLoadTestResponse_(lesson, unitId, period, student, fields, customs, batchKey, index) {
  const answersMap = buildAnswersMap_(fields, customs || []);
  const reviewText = extractReviewText_(fields, answersMap);
  const responseId = makeId_('response');
  const lessonId = `${getAiLoadTestLessonPrefix_(lesson.lessonId)}${batchKey}`;
  const studentNumber = `T${String(index + 1).padStart(2, '0')}`;
  const studentName = `${AI_LOAD_TEST_PREFIX} ${student.name || `${student.number}ばん`}`;
  const studentId = `${AI_LOAD_TEST_LESSON_PREFIX}student:${batchKey}:${index + 1}`;
  upsertResponse_({
    responseId,
    lessonId,
    unitId,
    studentId,
    studentNumber,
    studentName,
    answersMap,
    reviewText,
    submitted: true,
    submittedAt: nowIso_(),
    score: 0,
    rank: '',
    medal: '',
    comment: '',
    isRewrite: true,
    aiStatus: 'pending',
    aiQueuedAt: nowIso_(),
    aiProcessedAt: '',
    aiError: '',
    aiBatchId: '',
    aiRetryCount: 0,
    aiStartedAt: '',
    aiLatencyMs: 0,
    aiModelLatencyMs: 0,
  });
  appendResponseHistory_({
    responseId,
    lessonId,
    studentId,
    answersMap,
    reviewText,
    score: 0,
    rank: '',
    medal: '',
    comment: '',
    editType: 'load_test_submit',
  });
  return { responseId, lessonId, studentId, studentNumber, studentName };
}

function getAiLoadTestLessonPrefix_(baseLessonId) {
  return `${AI_LOAD_TEST_LESSON_PREFIX}${String(baseLessonId || '')}:`;
}

function buildAiLoadTestCustoms_(fields, student, index) {
  return (fields || []).map(field => buildAiLoadTestFieldValue_(field, student, index));
}

function buildAiLoadTestFieldValue_(field, student, index) {
  const type = String(field?.type || '').trim();
  const options = String(field?.options || '').split(',').map(item => item.trim()).filter(Boolean);
  if (field?.key === REVIEW_FIELD_KEY || type === 'review') {
    const sample = AI_LOAD_TEST_SAMPLE_REVIEWS[index % AI_LOAD_TEST_SAMPLE_REVIEWS.length];
    return `${AI_LOAD_TEST_PREFIX} ${sample}`;
  }
  if (type === 'radio' || type === 'select') {
    return options[index % options.length] || 'できた';
  }
  if (type === 'checkbox') {
    return options.slice(0, Math.max(1, Math.min(2, options.length))).join(',');
  }
  if (field?.key === 'goal') {
    return `${student.name || student.number + 'ばん'}のテストめあて`;
  }
  if (field?.key === 'method') {
    return options[0] || '１人で';
  }
  if (field?.key === 'summary') {
    return 'とけたところとむずかしいところを見つけました。';
  }
  if (field?.key === 'eval') {
    return options[0] || 'よくわかった';
  }
  return `${AI_LOAD_TEST_PREFIX} テスト入力 ${index + 1}`;
}

function isAiLoadTestRow_(row) {
  return String(row[7] || '').includes(AI_LOAD_TEST_PREFIX);
}

function deleteRowsFromSheet_(sheet, columnCount, predicate) {
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const rows = sheet.getRange(2, 1, lastRow - 1, columnCount).getValues();
  const deleteIndexes = [];
  rows.forEach((row, index) => {
    if (predicate(row)) deleteIndexes.push(index + 2);
  });
  deleteIndexes.reverse().forEach(rowNumber => sheet.deleteRow(rowNumber));
  return deleteIndexes.length;
}

function kickAiNow() {
  if (!isStudentAiEnabled_()) {
    return { ok: true, skipped: true, reason: 'student_ai_disabled' };
  }
  return tryProcessPendingAiInline_('submit_kick');
}







