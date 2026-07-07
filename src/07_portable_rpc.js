const PORTABLE_RPC_ALLOWLIST_ = Object.freeze({
  getStudentEntryOptions: true,
  studentInit: true,
  studentLoadState: true,
  getStudentPreviousReview: true,
  getStudentPastRecords: true,
  getTimeline: true,
  autoSave: true,
  submitReview: true,
  queueAiRescueTrigger: true,
  kickAiNow: true,
  teacherInit: true,
  teacherStatusInit: true,
  teacherRosterInit: true,
  teacherEditorInit: true,
  teacherPromptInit: true,
  teacherHelpInit: true,
  refreshTeacherShellConfig: true,
  requestTeacherAppUpdate: true,
  getSelfUpdateInfo: true,
  runTeacherSelfUpdate: true,
  rollbackTeacherDeployment: true,
  getAiQueueStatus: true,
  retryFailedAiResponses: true,
  repairMissingAggregateEntries: true,
  getLessonStatus: true,
  generateTeacherFeedbackDrafts: true,
  saveTeacherFeedbackDraft: true,
  saveTeacherFeedbackMedal: true,
  returnTeacherFeedbackDrafts: true,
  clearTeacherFeedbackDrafts: true,
  saveRecentCustomFieldPreset: true,
  deleteRecentCustomFieldPreset: true,
  saveRosterEntries: true,
  updateSubjectDefault: true,
  saveGlobalSettings: true,
  setActiveTimelineField: true,
  teacherStartLesson: true,
  teacherEndLesson: true,
  getLessonFieldConfig: true,
  saveLessonFieldConfig: true,
  saveUnit: true,
  deleteUnit: true,
  getAggregateDataJson: true,
  getAggregateData: true,
  exportAggregateCsv: true,
  getStudentPortfolioDataJson: true,
  getStudentPortfolioData: true,
  getAiLogSnapshot: true,
  generateStudentPortfolioSummary: true,
  generateUnitSummary: true,
  generateTeacherAssessmentDrafts: true,
  generateTeacherAssessmentDraftsBySubject: true,
  saveTeacherAssessment: true,
  purgeAiLogsOlderThan: true
});

function dispatchPortableRpc_(body) {
  const payload = body && body.payload ? body.payload : {};
  const method = String(payload.method || '').trim();
  const args = Array.isArray(payload.args) ? payload.args : [];
  if (!method) {
    throw new Error('Missing rpc method.');
  }
  if (!PORTABLE_RPC_ALLOWLIST_[method]) {
    throw new Error(`RPC method is not allowed: ${method}`);
  }
  const fn = globalThis[method];
  if (typeof fn !== 'function') {
    throw new Error(`RPC target is not available: ${method}`);
  }
  return fn.apply(null, args);
}
