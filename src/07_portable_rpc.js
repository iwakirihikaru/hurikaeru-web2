const PORTABLE_ACTION_HANDLERS_ = Object.freeze({
  getStudentEntrySummary: function(options) { return getStudentEntrySummary(options); },
  getStudentEntryOptions: function(options) { return getStudentEntryOptions(options); },
  studentInit: function(num, periodOverride) { return normalizePortableStudentInitResult_(studentInit(num, periodOverride)); },
  studentLoadState: function(unitId, period, num) { return normalizePortableStudentStateResult_(studentLoadState(unitId, period, num)); },
  getStudentPreviousReview: function(unitId, period, num) { return getStudentPreviousReview(unitId, period, num); },
  getStudentPastRecords: function(num, unitId, limit) { return getStudentPastRecords(num, unitId, limit); },
  getTimelineSnapshot: function(lessonId, activeRevision) { return getTimelineSnapshot(lessonId, activeRevision); },
  getTimeline: function(unitId, period) { return getTimeline(unitId, period); },
  autoSave: function(unitId, period, num, customs) { return autoSave(unitId, period, num, customs); },
  submitReview: function(unitId, period, num, customs, submitOptions) { return submitReview(unitId, period, num, customs, submitOptions); },
  queueAiRescueTrigger: function(delayMs) { return queueAiRescueTrigger(delayMs); },
  kickAiNow: function() { return kickAiNow(); },
  getUnitsMasterSnapshot: function() { return getAllUnitsSnapshot_({ useMasterContract: true }); },
  teacherInit: function() { return normalizePortableTeacherInitResult_(teacherInit()); },
  teacherStatusInit: function() { return teacherStatusInit(); },
  teacherStatusSnapshot: function() { return normalizePortableTeacherStatusSnapshotResult_(teacherStatusSnapshot()); },
  teacherUnitProgressRefresh: function() { return teacherUnitProgressRefresh(); },
  teacherRosterInit: function() { return teacherRosterInit(); },
  teacherEditorInit: function() { return teacherEditorInit(); },
  teacherPromptInit: function() { return teacherPromptInit(); },
  teacherHelpInit: function(forceRefresh) { return teacherHelpInit(forceRefresh); },
  refreshTeacherShellConfig: function() { return refreshTeacherShellConfig(); },
  requestTeacherAppUpdate: function() { return requestTeacherAppUpdate(); },
  getSelfUpdateInfo: function() { return getSelfUpdateInfo(); },
  runTeacherSelfUpdate: function() { return runTeacherSelfUpdate(); },
  rollbackTeacherDeployment: function() { return rollbackTeacherDeployment(); },
  refreshTemplateMaster: function(spreadsheetId) { return refreshTemplateMaster(spreadsheetId); },
  syncMasterApiFromLegacy: function() { return syncMasterApiFromLegacy(); },
  getAiQueueStatus: function() { return getAiQueueStatus(); },
  retryFailedAiResponses: function() { return retryFailedAiResponses(); },
  repairMissingAggregateEntries: function(unitId, period) { return repairMissingAggregateEntries(unitId, period); },
  getLessonStatus: function(unitId, period) { return getLessonStatus(unitId, period); },
  generateTeacherFeedbackDrafts: function(unitId, period, includeRank, autoReturn, responseIds, onlyMissing, medalMode) { return generateTeacherFeedbackDrafts(unitId, period, includeRank, autoReturn, responseIds, onlyMissing, medalMode); },
  saveTeacherFeedbackDraft: function(responseId, draftComment, draftRank) { return saveTeacherFeedbackDraft(responseId, draftComment, draftRank); },
  saveTeacherFeedbackDraftsBulk: function(items) { return saveTeacherFeedbackDraftsBulk(items); },
  saveTeacherFeedbackMedal: function(responseId, medal) { return saveTeacherFeedbackMedal(responseId, medal); },
  returnTeacherFeedbackDrafts: function(unitId, period, responseIds, medalMode, options) { return returnTeacherFeedbackDrafts(unitId, period, responseIds, medalMode, options); },
  clearTeacherFeedbackDrafts: function(unitId, period, responseIds) { return clearTeacherFeedbackDrafts(unitId, period, responseIds); },
  saveRecentCustomFieldPreset: function(field) { return saveRecentCustomFieldPreset(field); },
  deleteRecentCustomFieldPreset: function(key) { return deleteRecentCustomFieldPreset(key); },
  saveRosterEntries: function(entries) { return saveRosterEntries(entries); },
  updateSubjectDefault: function(subject, fieldDefs) { return updateSubjectDefault(subject, fieldDefs); },
  saveGlobalSettings: function(valuesByKey) { return saveGlobalSettings(valuesByKey); },
  setActiveTimelineField: function(fieldKey) { return setActiveTimelineField(fieldKey); },
  teacherStartLesson: function(unitId, period) { return teacherStartLesson(unitId, period); },
  teacherEndLesson: function() { return teacherEndLesson(); },
  getLessonFieldConfig: function(unitId, period) { return getLessonFieldConfig(unitId, period); },
  saveLessonFieldConfig: function(unitId, period, fields) { return saveLessonFieldConfig(unitId, period, fields); },
  saveUnit: function(payload) { return saveUnit(payload); },
  deleteUnit: function(unitId) { return deleteUnit(unitId); },
  getAggregateDataJson: function(unitId, optionsJson) { return getAggregateDataJson(unitId, optionsJson); },
  getAggregateData: function(unitId, options) { return getAggregateData(unitId, options); },
  exportAggregateCsv: function(unitId) { return exportAggregateCsv(unitId); },
  getStudentPortfolioDataJson: function(studentNo, optionsJson) { return getStudentPortfolioDataJson(studentNo, optionsJson); },
  getStudentPortfolioData: function(studentNo, options) { return getStudentPortfolioData(studentNo, options); },
  getAiLogSnapshot: function(limit) { return getAiLogSnapshot(limit); },
  generateStudentPortfolioSummary: function(studentNo, unitId, options) { return generateStudentPortfolioSummary(studentNo, unitId, options); },
  generateUnitSummary: function(unitId) { return generateUnitSummary(unitId); },
  generateTeacherAssessmentDrafts: function(unitId) { return generateTeacherAssessmentDrafts(unitId); },
  generateTeacherAssessmentDraftsBySubject: function(subject) { return generateTeacherAssessmentDraftsBySubject(subject); },
  saveTeacherAssessment: function(payload) { return saveTeacherAssessment(payload); },
  purgeAiLogsOlderThan: function(days) { return purgeAiLogsOlderThan(days); },
});

const PORTABLE_CONTRACT_VERSION_ = 1;

function normalizePortableObject_(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizePortableArray_(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePortableNumber_(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizePortableString_(value) {
  return String(value == null ? '' : value);
}

function normalizePortableErrors_(value) {
  if (Array.isArray(value)) return value.map(item => normalizePortableString_(item)).filter(Boolean);
  const text = normalizePortableString_(value).trim();
  return text ? [text] : [];
}

function normalizePortableStatusResult_(value) {
  const status = normalizePortableObject_(value);
  const meta = normalizePortableObject_(status.meta);
  return Object.assign({}, status, {
    meta: Object.assign({
      teacherAiEnabled: false,
      draftCount: 0,
      returnedCount: 0,
    }, meta),
    students: normalizePortableArray_(status.students),
  });
}

function normalizePortableTeacherInitResult_(value) {
  const data = normalizePortableObject_(value);
  return Object.assign({}, data, {
    portableContractVersion: PORTABLE_CONTRACT_VERSION_,
    units: normalizePortableArray_(data.units),
    unitsReadMeta: data.unitsReadMeta && typeof data.unitsReadMeta === 'object' ? data.unitsReadMeta : null,
    active: data.active === undefined ? null : data.active,
    roster: normalizePortableArray_(data.roster),
    unitProgress: normalizePortableObject_(data.unitProgress),
    progressNeedsRefresh: data.progressNeedsRefresh !== false,
    build: normalizePortableString_(data.build || APP_BUILD),
    deploymentVersion: normalizePortableNumber_(data.deploymentVersion, 0),
    deploymentCreatedAt: normalizePortableString_(data.deploymentCreatedAt).trim(),
    deploymentDescription: normalizePortableString_(data.deploymentDescription).trim(),
    errors: normalizePortableErrors_(data.errors),
  });
}

function normalizePortableTeacherStatusSnapshotResult_(value) {
  const data = normalizePortableObject_(value);
  return Object.assign({}, data, {
    portableContractVersion: PORTABLE_CONTRACT_VERSION_,
    active: data.active === undefined ? null : data.active,
    build: normalizePortableString_(data.build || APP_BUILD),
    status: normalizePortableStatusResult_(data.status),
    timing: normalizePortableObject_(data.timing),
    errors: normalizePortableErrors_(data.errors),
  });
}

function normalizePortableStudentStateResult_(value) {
  const data = normalizePortableObject_(value);
  const fields = normalizePortableArray_(data.fields);
  const customs = normalizePortableArray_(data.customs);
  return Object.assign({}, data, {
    portableContractVersion: PORTABLE_CONTRACT_VERSION_,
    fields,
    num: data.num == null ? '' : data.num,
    name: normalizePortableString_(data.name),
    customs: customs.concat(Array(Math.max(0, fields.length - customs.length)).fill('')),
    comment: normalizePortableString_(data.comment),
    rank: normalizePortableString_(data.rank),
    medal: normalizePortableString_(data.medal),
    medalColor: normalizePortableString_(data.medalColor),
    submitted: data.submitted === true,
    aiStatus: normalizePortableString_(data.aiStatus),
    prevReview: normalizePortableString_(data.prevReview),
    previousNextGoal: normalizePortableString_(data.previousNextGoal),
    responseReadMeta: normalizePortableObject_(data.responseReadMeta),
    studentAiEnabled: data.studentAiEnabled === true,
    studentAiAutoSubmitEnabled: data.studentAiAutoSubmitEnabled === true,
    shell: normalizePortableObject_(data.shell),
  });
}

function normalizePortableStudentInitResult_(value) {
  const data = normalizePortableObject_(value);
  const normalized = normalizePortableStudentStateResult_(data);
  return Object.assign({}, normalized, {
    needPeriodSelect: data.needPeriodSelect === true,
    unit: data.unit === undefined ? null : data.unit,
    units: normalizePortableArray_(data.units),
    period: normalizePortableNumber_(data.period, 0),
    presets: normalizePortableArray_(data.presets),
    students: normalizePortableArray_(data.students),
    teacherSetPeriod: data.teacherSetPeriod === true,
    teacherTimelineFieldKey: normalizePortableString_(data.teacherTimelineFieldKey).trim(),
  });
}

function isPortableFixedAction_(action) {
  return Boolean(PORTABLE_ACTION_HANDLERS_[String(action || '').trim()]);
}

function resolvePortableActionNameFromBody_(body) {
  const directAction = String(body && body.action || '').trim();
  if (directAction && directAction !== 'rpc') return directAction;
  const payload = body && body.payload ? body.payload : {};
  return String(payload.method || '').trim();
}

function extractPortableActionArgsFromBody_(body) {
  const payload = body && body.payload ? body.payload : {};
  return Array.isArray(payload.args) ? payload.args : [];
}

function isPortableActionRequestBody_(body) {
  return isPortableFixedAction_(resolvePortableActionNameFromBody_(body));
}

function dispatchPortableFixedAction_(action, args) {
  const normalizedAction = String(action || '').trim();
  if (!normalizedAction) {
    throw new Error('Missing action.');
  }
  const handler = PORTABLE_ACTION_HANDLERS_[normalizedAction];
  if (typeof handler !== 'function') {
    throw new Error(`Portable action is not allowed: ${normalizedAction}`);
  }
  const normalizedArgs = Array.isArray(args) ? args : [];
  return handler.apply(null, normalizedArgs);
}

function dispatchPortableActionRequest_(body) {
  const action = resolvePortableActionNameFromBody_(body);
  const args = extractPortableActionArgsFromBody_(body);
  return dispatchPortableFixedAction_(action, args);
}

function dispatchPortableRpc_(body) {
  const method = resolvePortableActionNameFromBody_(body);
  const args = extractPortableActionArgsFromBody_(body);
  if (!method) {
    throw new Error('Missing rpc method.');
  }
  return dispatchPortableFixedAction_(method, args);
}


