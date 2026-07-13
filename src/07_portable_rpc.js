const PORTABLE_ACTION_HANDLERS_ = Object.freeze({
  getStudentEntryOptions: function() { return getStudentEntryOptions(); },
  studentInit: function(num, periodOverride) { return studentInit(num, periodOverride); },
  studentLoadState: function(unitId, period, num) { return studentLoadState(unitId, period, num); },
  getStudentPreviousReview: function(unitId, period, num) { return getStudentPreviousReview(unitId, period, num); },
  getStudentPastRecords: function(num, unitId, limit) { return getStudentPastRecords(num, unitId, limit); },
  getTimeline: function(unitId, period) { return getTimeline(unitId, period); },
  autoSave: function(unitId, period, num, customs) { return autoSave(unitId, period, num, customs); },
  submitReview: function(unitId, period, num, customs) { return submitReview(unitId, period, num, customs); },
  queueAiRescueTrigger: function(delayMs) { return queueAiRescueTrigger(delayMs); },
  kickAiNow: function() { return kickAiNow(); },
  getUnitsMasterSnapshot: function() { return getAllUnitsSnapshot_({ useMasterContract: true }); },
  teacherInit: function() { return teacherInit(); },
  teacherStatusInit: function() { return teacherStatusInit(); },
  teacherStatusSnapshot: function() { return teacherStatusSnapshot(); },
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
  generateTeacherFeedbackDrafts: function(unitId, period) { return generateTeacherFeedbackDrafts(unitId, period); },
  saveTeacherFeedbackDraft: function(payload) { return saveTeacherFeedbackDraft(payload); },
  saveTeacherFeedbackMedal: function(payload) { return saveTeacherFeedbackMedal(payload); },
  returnTeacherFeedbackDrafts: function(payload) { return returnTeacherFeedbackDrafts(payload); },
  clearTeacherFeedbackDrafts: function(unitId, period) { return clearTeacherFeedbackDrafts(unitId, period); },
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


