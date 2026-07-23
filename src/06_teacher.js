// ============================================================
//  先生向け API
// ============================================================
const TEACHER_FEEDBACK_JOB_TTL_MS = 3 * 60 * 1000;
const TEACHER_RESPONSE_MIRROR_QUEUE_INDEX_KEY = 'TEACHER_RESPONSE_MIRROR_QUEUE_INDEX_V1';
const TEACHER_RESPONSE_MIRROR_TRIGGER_AT_KEY = 'TEACHER_RESPONSE_MIRROR_TRIGGER_AT_V1';
const TEACHER_RESPONSE_MIRROR_HANDLER = 'processTeacherResponseMirrorQueue';
const TEACHER_RESPONSE_MIRROR_DELAY_MS = 1500;
const TEACHER_RESPONSE_MIRROR_RETRY_DELAY_MS = 30000;
const TEACHER_RESPONSE_MIRROR_TRIGGER_LOCK_MS = 5000;
const TEACHER_RESPONSE_MIRROR_QUEUE_LOCK_MS = 5000;

function buildTeacherFeedbackJobKey_(lessonId, mode) {
  return `teacher_feedback_job:${String(mode || 'generate')}:${String(lessonId || '').trim()}`;
}

function beginTeacherFeedbackJob_(lessonId, mode) {
  const normalizedLessonId = String(lessonId || '').trim();
  if (!normalizedLessonId) return { ok:false, error:'授業IDが不正です。' };
  const jobKey = buildTeacherFeedbackJobKey_(normalizedLessonId, mode);
  const token = makeId_('teacherjob');
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = String(props.getProperty(jobKey) || '').trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const startedAtMs = Number(parsed && parsed.startedAtMs || 0);
        if (startedAtMs > 0 && Date.now() - startedAtMs < TEACHER_FEEDBACK_JOB_TTL_MS) {
          return { ok:false, error:'この時間目の教師AI処理は進行中です。完了まで待ってください。' };
        }
      } catch (err) {
      }
    }
    props.setProperty(jobKey, JSON.stringify({
      token,
      startedAtMs: Date.now(),
    }));
    return { ok:true, jobKey, token };
  } finally {
    lock.releaseLock();
  }
}

function endTeacherFeedbackJob_(jobKey, token) {
  const normalizedJobKey = String(jobKey || '').trim();
  const normalizedToken = String(token || '').trim();
  if (!normalizedJobKey || !normalizedToken) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = String(props.getProperty(normalizedJobKey) || '').trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (String(parsed && parsed.token || '') !== normalizedToken) return;
    } catch (err) {
      return;
    }
    props.deleteProperty(normalizedJobKey);
  } finally {
    lock.releaseLock();
  }
}

function getTeacherResponseMirrorQueuePropKey_(batchId) {
  return `TEACHER_RESPONSE_MIRROR_${String(batchId || '').trim()}`;
}

function loadTeacherResponseMirrorBatchIds_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(TEACHER_RESPONSE_MIRROR_QUEUE_INDEX_KEY) || '[]';
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch (err) {
    return [];
  }
}

function saveTeacherResponseMirrorBatchIds_(batchIds) {
  PropertiesService.getScriptProperties().setProperty(
    TEACHER_RESPONSE_MIRROR_QUEUE_INDEX_KEY,
    JSON.stringify(Array.from(new Set((batchIds || []).filter(Boolean))))
  );
}

function storeTeacherResponseMirrorQueueEntry_(batchId, payload) {
  const safeBatchId = String(batchId || '').trim();
  if (!safeBatchId) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(TEACHER_RESPONSE_MIRROR_QUEUE_LOCK_MS);
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(getTeacherResponseMirrorQueuePropKey_(safeBatchId), JSON.stringify(payload || {}));
    const ids = loadTeacherResponseMirrorBatchIds_();
    ids.push(safeBatchId);
    saveTeacherResponseMirrorBatchIds_(ids);
  } finally {
    lock.releaseLock();
  }
}

function loadTeacherResponseMirrorQueueEntries_() {
  const props = PropertiesService.getScriptProperties();
  return loadTeacherResponseMirrorBatchIds_().map(batchId => {
    const raw = props.getProperty(getTeacherResponseMirrorQueuePropKey_(batchId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
      return null;
    }
  }).filter(Boolean);
}

function clearTeacherResponseMirrorQueueEntry_(batchId) {
  const safeBatchId = String(batchId || '').trim();
  if (!safeBatchId) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(TEACHER_RESPONSE_MIRROR_QUEUE_LOCK_MS);
  try {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(getTeacherResponseMirrorQueuePropKey_(safeBatchId));
    const ids = loadTeacherResponseMirrorBatchIds_().filter(id => String(id || '').trim() !== safeBatchId);
    saveTeacherResponseMirrorBatchIds_(ids);
  } finally {
    lock.releaseLock();
  }
}

function ensureTeacherResponseMirrorTrigger_(delayMs) {
  const props = PropertiesService.getScriptProperties();
  const desiredDelayMs = Math.max(500, Number(delayMs || TEACHER_RESPONSE_MIRROR_DELAY_MS));
  const desiredAtMs = Date.now() + desiredDelayMs;
  const scheduledAtMs = Number(props.getProperty(TEACHER_RESPONSE_MIRROR_TRIGGER_AT_KEY) || 0);
  if (scheduledAtMs && desiredAtMs >= (scheduledAtMs - 300)) return false;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(TEACHER_RESPONSE_MIRROR_TRIGGER_LOCK_MS)) return false;
  try {
    const triggers = ScriptApp.getProjectTriggers()
      .filter(trigger => trigger.getHandlerFunction() === TEACHER_RESPONSE_MIRROR_HANDLER);
    const refreshedScheduledAtMs = Number(props.getProperty(TEACHER_RESPONSE_MIRROR_TRIGGER_AT_KEY) || 0);
    if (triggers.length > 0 && refreshedScheduledAtMs && desiredAtMs >= (refreshedScheduledAtMs - 300)) return false;
    triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
    ScriptApp.newTrigger(TEACHER_RESPONSE_MIRROR_HANDLER).timeBased().after(desiredDelayMs).create();
    props.setProperty(TEACHER_RESPONSE_MIRROR_TRIGGER_AT_KEY, String(desiredAtMs));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function enqueueTeacherResponseMirror_(responseIds, source, action, actor) {
  const ids = Array.from(new Set((Array.isArray(responseIds) ? responseIds : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)));
  if (!ids.length) return '';
  const batchId = makeId_('teachermirror');
  storeTeacherResponseMirrorQueueEntry_(batchId, {
    batchId,
    responseIds: ids,
    source: String(source || 'response_teacher_feedback_return'),
    action: String(action || 'master_mirror_failed_teacher_feedback_return'),
    actor: String(actor || 'teacher'),
    queuedAt: nowIso_(),
  });
  ensureTeacherResponseMirrorTrigger_(TEACHER_RESPONSE_MIRROR_DELAY_MS);
  return batchId;
}

function processTeacherResponseMirrorQueue() {
  PropertiesService.getScriptProperties().deleteProperty(TEACHER_RESPONSE_MIRROR_TRIGGER_AT_KEY);
  const entries = loadTeacherResponseMirrorQueueEntries_();
  if (!entries.length) return { ok:true, processed: 0, remaining: 0 };
  let processed = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const responseIds = Array.from(new Set((Array.isArray(entry.responseIds) ? entry.responseIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean)));
    try {
      const rows = responseIds
        .map(responseId => getResponseRecordByResponseId_(responseId))
        .filter(Boolean)
        .map(response => buildResponseSheetRowValues_(response));
      if (rows.length) {
        mirrorResponseRowsToMaster_(
          rows,
          entry.source || 'response_teacher_feedback_return',
          entry.action || 'master_mirror_failed_teacher_feedback_return',
          entry.actor || 'teacher'
        );
      }
      clearTeacherResponseMirrorQueueEntry_(entry.batchId);
      processed++;
    } catch (err) {
      ensureTeacherResponseMirrorTrigger_(TEACHER_RESPONSE_MIRROR_RETRY_DELAY_MS);
      return {
        ok: false,
        processed,
        remaining: loadTeacherResponseMirrorBatchIds_().length,
        error: String(err && err.message ? err.message : err),
      };
    }
  }
  return { ok:true, processed, remaining: loadTeacherResponseMirrorBatchIds_().length };
}

// teacherInit:
// 教師画面の初期 shell を立ち上げるための bootstrap。
// status 行一覧や重い集約取得は含めない。
function teacherInit() {
  const errors = [];
  let units = [];
  let unitsReadMeta = null;
  let active = null;
  let roster = [];
  let unitProgress = {};
  let progressNeedsRefresh = false;
  try {
    const unitSnapshot = getAllUnitsSnapshot_({ useMasterContract: true });
    units = Array.isArray(unitSnapshot && unitSnapshot.units) ? unitSnapshot.units : [];
    unitsReadMeta = unitSnapshot && unitSnapshot.meta ? unitSnapshot.meta : getLastUnitsReadMeta_();
  } catch (err) {
    errors.push(`units: ${err && err.message ? err.message : err}`);
  }
  try {
    active = getActiveSetting({ units, includeLesson: false });
  } catch (err) {
    errors.push(`active: ${err && err.message ? err.message : err}`);
  }
  try {
    roster = getRosterEntries_(true);
  } catch (err) {
    errors.push(`roster: ${err && err.message ? err.message : err}`);
  }
  try {
    unitProgress = getTeacherUnitProgress_({ forceRefresh: false });
  } catch (err) {
    errors.push(`unitProgress: ${err && err.message ? err.message : err}`);
    progressNeedsRefresh = true;
  }
  const deploymentInfo = buildTeacherDeploymentDisplayInfo_(null, { skipShellFallback: true });
  return {
    units,
    unitsReadMeta,
    active,
    roster,
    unitProgress,
    progressNeedsRefresh,
    build: APP_BUILD,
    deploymentVersion: deploymentInfo.version,
    deploymentCreatedAt: deploymentInfo.createdAt,
    deploymentDescription: deploymentInfo.description,
    errors,
  };
}

function teacherStatusInit() {
  const startedAt = Date.now();
  const timing = {};
  const errors = [];
  let units = [];
  let unitsReadMeta = null;
  let active = null;
  let unitProgress = {};
  let progressNeedsRefresh = false;
  try {
    const t0 = Date.now();
    const unitSnapshot = getAllUnitsSnapshot_({ useMasterContract: true });
    units = Array.isArray(unitSnapshot && unitSnapshot.units) ? unitSnapshot.units : [];
    unitsReadMeta = unitSnapshot && unitSnapshot.meta ? unitSnapshot.meta : getLastUnitsReadMeta_();
    timing.unitsMs = Date.now() - t0;
  } catch (err) {
    errors.push(`units: ${err && err.message ? err.message : err}`);
  }
  try {
    const t0 = Date.now();
    active = getActiveSetting({ units, includeLesson: false });
    timing.activeMs = Date.now() - t0;
  } catch (err) {
    errors.push(`active: ${err && err.message ? err.message : err}`);
  }
  try {
    const t0 = Date.now();
    unitProgress = readCachedTeacherUnitProgressSnapshot_();
    progressNeedsRefresh = !Object.keys(unitProgress || {}).length;
    if (progressNeedsRefresh) {
      unitProgress = getTeacherUnitProgress_({ forceRefresh: false });
      progressNeedsRefresh = false;
    }
    timing.unitProgressMs = Date.now() - t0;
  } catch (err) {
    errors.push(`unitProgress: ${err && err.message ? err.message : err}`);
    progressNeedsRefresh = true;
  }
  const deploymentInfo = buildTeacherDeploymentDisplayInfo_(null, { skipShellFallback: true });
  let status = {
    meta: {
      teacherAiEnabled: isTeacherAiEnabled_(),
      draftCount: 0,
      returnedCount: 0,
    },
    students: [],
  };
  if (active?.unitId && Number(active?.period || 0) > 0) {
    try {
      const t0 = Date.now();
      status = getLessonStatus(active.unitId, active.period);
      timing.lessonStatusMs = Date.now() - t0;
    } catch (err) {
      errors.push(`status: ${err && err.message ? err.message : err}`);
    }
  }
  timing.totalMs = Date.now() - startedAt;
  if (status && status.meta) {
    status.meta.serverRequestTiming = timing;
    status.meta.unitsReadMeta = unitsReadMeta;
  }
  return {
    units,
    unitsReadMeta,
    active,
    unitProgress,
    progressNeedsRefresh,
    build: APP_BUILD,
    deploymentVersion: deploymentInfo.version,
    deploymentCreatedAt: deploymentInfo.createdAt,
    deploymentDescription: deploymentInfo.description,
    status,
    timing,
    errors,
  };
}

function buildTeacherDeploymentDisplayInfo_(versionControl, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const vc = versionControl && typeof versionControl === 'object' ? versionControl : {};
  const currentVersion = Number(vc.currentVersionNumber || 0);
  if (currentVersion > 0) {
    return {
      version: currentVersion,
      createdAt: String(vc.currentVersionCreatedAt || '').trim(),
      description: String(vc.currentVersionDescription || '').trim(),
    };
  }
  if (opts.skipShellFallback) {
    return {
      version: 0,
      createdAt: '',
      description: '',
    };
  }

  try {
    const shellState = getTenantShellConfig_({ includeMaintenance: false });
    const shellConfig = shellState && shellState.config ? shellState.config : {};
    const latestVersion = Number(shellConfig.latestVersion || 0);
    return {
      version: Number.isFinite(latestVersion) ? latestVersion : 0,
      createdAt: String(shellConfig.checkedAt || shellState.cacheFetchedAt || '').trim(),
      description: String(shellConfig.latestBuild || '').trim(),
    };
  } catch (err) {
    return {
      version: 0,
      createdAt: '',
      description: '',
    };
  }
}

// teacherStatusSnapshot:
// 初期表示や軽い再同期で「いま何の授業か」を確認するための軽量 API。
// 単元一覧・名簿・詳細 status はここに寄せない。
function teacherStatusSnapshot() {
  const startedAt = Date.now();
  const timing = {};
  const errors = [];
  let active = null;
  let startCandidatesSnapshot = null;
  try {
    const t0 = Date.now();
    active = getActiveSetting({ includeUnit: false, includeLesson: false });
    timing.activeMs = Date.now() - t0;
  } catch (err) {
    errors.push(`active: ${err && err.message ? err.message : err}`);
  }
  try {
    const t0 = Date.now();
    startCandidatesSnapshot = getTeacherStartCandidatesSnapshot_({ forceRefresh: false });
    timing.startCandidatesMs = Date.now() - t0;
  } catch (err) {
    errors.push(`startCandidates: ${err && err.message ? err.message : err}`);
  }
  timing.totalMs = Date.now() - startedAt;
  return {
    active,
    startCandidatesSnapshot,
    build: APP_BUILD,
    timing,
    errors,
  };
}

function getLessonStatusCacheKey_(unitId, period) {
  return `teacher_lesson_status_v1:${APP_BUILD}:${readDomainCacheVersion_('responses')}:${readDomainCacheVersion_('teacher_comment_drafts')}:${readDomainCacheVersion_('students')}:${readDomainCacheVersion_('lessons')}:${String(unitId || '').trim()}:${String(period || '').trim()}`;
}

function readTeacherUnitProgressSnapshot_() {
  const cached = getCachedJson_('teacher_unit_progress_v1');
  return cached && typeof cached === 'object' ? cached : buildTeacherUnitLessonProgressSnapshot_();
}

function readCachedTeacherUnitProgressSnapshot_() {
  const cached = getCachedJson_('teacher_unit_progress_v1');
  return cached && typeof cached === 'object' ? cached : {};
}

function buildTeacherUnitLessonProgressSnapshot_() {
  const map = {};
  listLessonRecords_().forEach(lesson => {
    const unitId = String(lesson.unitId || '');
    if (!unitId) return;
    const period = Number(lesson.period || 0);
    const lessonDate = String(lesson.lessonDate || '');
    const updatedAt = String(lesson.updatedAt || lesson.createdAt || '');
    const current = map[unitId] || {
      maxPeriod: 0,
      latestActivityAt: '',
      lessonCount: 0,
      lastStartedPeriod: 0,
      lastStartedAt: '',
      lastActivityPeriod: 0,
      latestPeriodHasActivity: false,
      lightweight: true,
    };
    current.maxPeriod = Math.max(current.maxPeriod || 0, period);
    current.lessonCount += 1;
    current.lastStartedPeriod = Math.max(current.lastStartedPeriod || 0, period);
    current.lastActivityPeriod = Math.max(current.lastActivityPeriod || 0, period);
    const candidate = updatedAt || lessonDate;
    if (String(candidate) > String(current.latestActivityAt || '')) {
      current.latestActivityAt = candidate;
    }
    if (period >= Number(current.lastStartedPeriod || 0) && String(candidate) > String(current.lastStartedAt || '')) {
      current.lastStartedAt = candidate;
    }
    current.suggestedNextPeriod = Math.max(1, period + 1);
    map[unitId] = current;
  });
  return map;
}

function getTeacherUnitProgress_(options) {
  const opts = options || {};
  const cacheKey = 'teacher_unit_progress_v1';
  const cached = readCachedTeacherUnitProgressSnapshot_();
  if (!opts.forceRefresh && Object.keys(cached).length) return cached;
  const map = buildTeacherUnitLessonProgressSnapshot_();
  return putCachedJson_(cacheKey, map, 20);
}

function teacherUnitProgressRefresh() {
  return {
    unitProgress: getTeacherUnitProgress_({ forceRefresh: true }),
  };
}

function hasTeacherVisibleResponseActivity_(row) {
  if (!row) return false;
  const answersJson = Array.isArray(row)
    ? String(row[6] || '').trim()
    : JSON.stringify(row.answersMap || {});
  const reviewText = Array.isArray(row) ? String(row[7] || '').trim() : String(row.reviewText || '').trim();
  const submitted = Array.isArray(row) ? row[8] === true : row.submitted === true;
  const comment = Array.isArray(row) ? String(row[13] || '').trim() : String(row.comment || '').trim();
  if (reviewText || submitted || comment) return true;
  if (!answersJson || answersJson === '{}' || answersJson === 'null') return false;
  return true;
}

function teacherRosterInit() {
  return {
    roster: getRosterEntries_(true),
  };
}

function teacherEditorInit() {
  return {
    presets: getPresets(),
    subjectDefaults: getSubjectDefaults(),
    subjects: SUBJECTS,
    recentCustomPresets: listRecentCustomFieldPresets_(8),
  };
}

function teacherPromptInit() {
  const shellState = getTenantShellConfig_({ includeMaintenance: true });
  const shellConfig = shellState && shellState.config ? shellState.config : {};
  const cfg = getGlobalConfigWithDefaults_(shellConfig);
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
  const featureFlags = getAiFeatureFlags_();

  return {
    globalCfg: {
      medal_top     : cfg.medal_top,
      prompt_comment: cfg.prompt_comment,
      prompt_score  : cfg.prompt_score,
      prompt_portfolio: cfg.prompt_portfolio,
      prompt_unit_summary: cfg.prompt_unit_summary,
      prompt_assessment: cfg.prompt_assessment,
      api_key_configured: Boolean(apiKey),
      api_key_masked: apiKey ? `********${apiKey.slice(-4)}` : '',
      student_ai_enabled: featureFlags.studentAiEnabled,
      student_ai_submit_enabled: featureFlags.studentAiAutoSubmitEnabled,
      teacher_ai_enabled: featureFlags.teacherAiEnabled,
      shellConfig,
      shellCacheFresh: Boolean(shellState && shellState.cacheFresh),
      shellCacheStale: Boolean(shellState && shellState.cacheStale),
      shellCacheFetchedAt: String(shellState && shellState.cacheFetchedAt || '').trim(),
      shellConfigSource: String(shellState && shellState.configSource || shellState && shellState.source || '').trim(),
      shellMaintenanceSource: String(shellState && shellState.maintenanceSource || '').trim(),
    },
    aiQueue: getAiQueueStatus(),
    help: getTeacherHelpInfo_(shellState),
  };
}

function teacherHelpInit(options) {
  return getTeacherHelpInfo_(null, options);
}

function resolveTeacherRuntimeWebAppInfo_(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const setupConfig = opts.setupConfig && typeof opts.setupConfig === 'object'
    ? opts.setupConfig
    : null;
  const explicitCurrentWebAppUrl = normalizeWebAppUrl_(opts.currentWebAppUrl || '');
  const resolvedCurrentWebAppUrl = explicitCurrentWebAppUrl || normalizeWebAppUrl_(
    resolveSetupWebAppBaseUrl_(setupConfig || {}, {
      currentWebAppUrl: getCurrentWebAppBaseUrl_(),
    })
  );
  const deploymentId = String(
    inferDeploymentIdFromWebAppUrl_(resolvedCurrentWebAppUrl) ||
    getScriptProperties_().getProperty('DEPLOYMENT_ID') ||
    ''
  ).trim();
  return {
    currentWebAppUrl: resolvedCurrentWebAppUrl,
    deploymentId,
  };
}

function refreshTeacherShellConfig() {
  return getTenantShellConfig_({ forceRefresh: true, includeMaintenance: true });
}

function requestTeacherAppUpdate() {
  return requestTeacherAppUpdate_();
}

function getSelfUpdateInfo() {
  return getSelfUpdateInfo_();
}

function runTeacherSelfUpdate() {
  return runTeacherSelfUpdate_();
}

function rollbackTeacherDeployment() {
  return rollbackTeacherDeployment_();
}

function purgeAiLogsOlderThan(days) {
  return {
    ok: true,
    ...purgeAiLogsOlderThanDays_(days),
  };
}

function getTeacherHelpInfo_(preloadedShellState, options) {
  const opts = options && typeof options === 'object' ? options : {};
  let shellState = preloadedShellState && typeof preloadedShellState === 'object'
    ? preloadedShellState
    : null;
  if (!shellState && opts.forceRefresh) {
    clearTenantShellConfigCache_();
  }
  if (!shellState) {
    shellState = getTenantShellConfig_({
      forceRefresh: Boolean(opts.forceRefresh),
      includeMaintenance: true,
    });
  }
  const shellConfig = shellState && shellState.config ? shellState.config : {};
  const spreadsheet = getTenantSpreadsheet_();
  const setupConfig = loadTemplateSetupConfig_(spreadsheet);
  const runtimeWebAppInfo = resolveTeacherRuntimeWebAppInfo_({ setupConfig });
  const currentWebAppUrl = runtimeWebAppInfo.currentWebAppUrl;
  const deploymentId = runtimeWebAppInfo.deploymentId;
  const scriptId = String(ScriptApp.getScriptId() || '').trim();
  const currentBuild = String(APP_BUILD || '').trim();
  const versionControl = getTeacherVersionControlInfo_(runtimeWebAppInfo);
  const currentDeploymentVersion = Number(versionControl.currentVersionNumber || 0);
  const remoteLatestBuild = String(shellConfig.latestBuild || '').trim();
  const remoteLatestVersion = String(shellConfig.latestVersion || '').trim();
  const remoteLatestVersionNumber = Number(remoteLatestVersion || 0);
  const preferCurrentDeployment =
    currentDeploymentVersion > 0 &&
    (!remoteLatestVersionNumber || remoteLatestVersionNumber < currentDeploymentVersion);
  const latestBuild = preferCurrentDeployment
    ? (currentBuild || remoteLatestBuild)
    : remoteLatestBuild;
  const latestVersion = preferCurrentDeployment
    ? String(currentDeploymentVersion)
    : remoteLatestVersion;
  const updateAvailable = Boolean(latestBuild && currentBuild && latestBuild !== currentBuild);
  const props = getScriptProperties_();
  const registrationId = String(setupConfig.registrationId || '').trim();
  const canRequestUpdate = Boolean(
    updateAvailable &&
    String(ADMIN_WEBAPP_URL || '').trim() &&
    registrationId
  );
  const updateActionMode = canRequestUpdate ? 'request_update' : 'disabled';
  const helpReason = preferCurrentDeployment
    ? '中央の版情報が古いため、この個体の deployment version を優先表示しています。'
    : updateAvailable
    ? (canRequestUpdate
      ? 'この個体は更新通知まで自動です。コード更新は更新依頼で進めます。'
      : 'この個体では更新依頼に必要な登録情報が不足しています。')
    : 'このアプリは最新版です。';
  return {
    links: {
      teacherUrl: buildPortableTeacherRelayUrl_(currentWebAppUrl),
      studentUrl: buildPortableStudentRelayUrl_(currentWebAppUrl),
      setupUrl: buildPortableSetupUrl_(currentWebAppUrl),
      registrationUrl: buildAdminFormUrl_(),
      guideUrl: buildAdminGuideModeUrl_(),
      apiKeyGuideUrl: 'https://aistudio.google.com/app/apikey',
    },
    shell: {
      labels: shellConfig.labels || {},
      featureToggles: shellConfig.featureToggles || {},
      noticeBanner: shellConfig.noticeBanner || {},
    },
    app: {
      currentBuild,
      currentVersion: String(versionControl.currentVersionNumber || ''),
      latestBuild,
      latestVersion,
      latestNote: String(shellConfig.noticeBanner && shellConfig.noticeBanner.message || '').trim(),
      checkedAt: String(shellConfig.checkedAt || shellState.cacheFetchedAt || '').trim(),
      status: latestBuild ? (updateAvailable ? 'update_available' : 'up_to_date') : 'unknown',
      registrationId,
      spreadsheetId: String(spreadsheet.getId() || '').trim(),
      deploymentId,
      currentWebAppUrl,
      scriptId,
      scriptUrl: scriptId ? `https://script.google.com/home/projects/${scriptId}/edit` : '',
      canRequestUpdate,
      canSelfUpdate: false,
      updateActionMode,
      updateActionLabel: canRequestUpdate ? '更新を依頼' : '更新操作（利用不可）',
      updateAvailableMessage: updateAvailable
        ? '新しい版があります。URLはそのままで、更新タイミングだけ案内します。'
        : '',
      bundleVersion: '',
      minimumUpdaterVersion: '',
      sourceBundleUrl: '',
      selfUpdateReason: helpReason,
      selfUpdateLastStatus: String(props.getProperty('SELF_UPDATE_STATUS') || '').trim(),
      selfUpdateLastBuild: String(props.getProperty('LAST_SELF_UPDATE_BUILD') || '').trim(),
      selfUpdateLastAt: String(props.getProperty('LAST_SELF_UPDATE_AT') || '').trim(),
      selfUpdateLastError: String(props.getProperty('SELF_UPDATE_ERROR') || '').trim(),
      currentDeploymentVersion,
      previousDeploymentVersion: Number(versionControl.previousVersionNumber || 0),
      recentDeploymentVersions: Array.isArray(versionControl.recentVersions) ? versionControl.recentVersions : [],
      canRollbackDeployment: Boolean(versionControl.canRollback),
      rollbackReason: String(versionControl.reason || '').trim(),
      maintenanceMode: Boolean(shellConfig.maintenanceMode),
      featureToggles: shellConfig.featureToggles || {},
      noticeBanner: shellConfig.noticeBanner || {},
      shellCacheFresh: Boolean(shellState.cacheFresh),
      shellCacheStale: Boolean(shellState.cacheStale),
      shellCacheFetchedAt: String(shellState.cacheFetchedAt || '').trim(),
      shellFetchError: String(shellState.fetchError || '').trim(),
      shellConfigVersion: String(shellConfig.configVersion || '').trim(),
      shellConfigSource: String(shellState.configSource || shellState.source || '').trim(),
      shellMaintenanceSource: String(shellState.maintenanceSource || '').trim(),
    },
  };
}

function fetchAdminReleaseInfo_() {
  const base = String(ADMIN_WEBAPP_URL || '').trim();
  if (!base) return { ok: false, error: 'admin_url_missing' };
  try {
    const response = UrlFetchApp.fetch(appendQueryParams_(base, { mode: 'releaseInfo' }), {
      method: 'get',
      muteHttpExceptions: true,
    });
    const json = JSON.parse(String(response.getContentText() || '{}'));
    return json && typeof json === 'object' ? json : { ok: false, error: 'invalid_release_info' };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function fetchAdminReleaseManifest_() {
  const base = String(ADMIN_WEBAPP_URL || '').trim();
  if (!base) return { ok: false, error: 'admin_url_missing' };
  try {
    const response = UrlFetchApp.fetch(appendQueryParams_(base, { mode: 'releaseManifest' }), {
      method: 'get',
      muteHttpExceptions: true,
    });
    const json = JSON.parse(String(response.getContentText() || '{}'));
    return json && typeof json === 'object' ? json : { ok: false, error: 'invalid_release_manifest' };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function getSelfUpdateInfo_() {
  return getSelfUpdateInfoFromManifest_(fetchAdminReleaseManifest_());
}

function getSelfUpdateInfoFromManifest_(manifest) {
  const releaseManifest = manifest && typeof manifest === 'object' ? manifest : {};
  const latestBuild = String(releaseManifest.latestBuild || releaseManifest.latestTenantAppBuild || '').trim();
  const currentBuild = String(APP_BUILD || '').trim();
  const sourceBundleUrl = String(releaseManifest.sourceBundleUrl || '').trim();
  const sourceSnapshot = normalizeSelfUpdateSourceSnapshot_(releaseManifest.sourceSnapshot);
  const scriptId = String(ScriptApp.getScriptId() || '').trim();
  const deploymentId = resolveTeacherRuntimeWebAppInfo_().deploymentId;
  let updateStatus = 'unknown';
  let reason = '';
  if (latestBuild && currentBuild) {
    updateStatus = latestBuild === currentBuild ? 'up_to_date' : 'update_available';
  } else if (currentBuild) {
    updateStatus = 'current_only';
  }
  if (!releaseManifest.ok && !latestBuild) {
    reason = '中央の最新版情報を取得できませんでした。';
  } else if (!sourceBundleUrl && !sourceSnapshot) {
    reason = '更新bundleの取得先が未設定です。';
  } else if (!scriptId) {
    reason = 'このアプリの scriptId を取得できません。';
  } else if (!deploymentId) {
    reason = 'このアプリの deploymentId を取得できません。';
  } else if (latestBuild && currentBuild && latestBuild === currentBuild) {
    reason = 'このアプリは最新版です。';
  }
  return {
    currentBuild,
    latestBuild,
    latestVersion: String(releaseManifest.latestVersion || releaseManifest.latestTenantAppVersion || '').trim(),
    latestNote: String(releaseManifest.latestNote || releaseManifest.latestTenantAppNote || '').trim(),
    checkedAt: String(releaseManifest.releasedAt || releaseManifest.checkedAt || '').trim(),
    status: updateStatus,
    bundleVersion: String(releaseManifest.bundleVersion || '').trim(),
    minimumUpdaterVersion: String(releaseManifest.minimumUpdaterVersion || '').trim(),
    sourceBundleUrl,
    sourceSnapshot,
    updateAvailableMessage: String(releaseManifest.updateAvailableMessage || '').trim(),
    reason,
    canSelfUpdate: Boolean(
      (sourceBundleUrl || sourceSnapshot) &&
      scriptId &&
      deploymentId &&
      latestBuild &&
      currentBuild &&
      latestBuild !== currentBuild
    ),
  };
}

function runTeacherSelfUpdate_() {
  const manifest = fetchAdminReleaseManifest_();
  const info = getSelfUpdateInfoFromManifest_(manifest);
  if (!info.latestBuild) {
    return { ok: false, error: '最新版情報を取得できませんでした。' };
  }
  if (info.currentBuild && info.latestBuild === info.currentBuild) {
    return {
      ok: true,
      changed: false,
      currentBuild: info.currentBuild,
      latestBuild: info.latestBuild,
      message: 'このアプリは最新版です。',
    };
  }
  if (!info.sourceBundleUrl && !info.sourceSnapshot) {
    return { ok: false, error: '更新 bundle の取得情報を取得できませんでした。' };
  }

  const scriptId = String(ScriptApp.getScriptId() || '').trim();
  const deploymentId = resolveTeacherRuntimeWebAppInfo_().deploymentId;
  if (!scriptId) return { ok: false, error: 'scriptId を取得できませんでした。' };
  if (!deploymentId) return { ok: false, error: 'deploymentId を取得できませんでした。' };

  const bundle = resolveSelfUpdateBundle_(info, manifest);
  if (!bundle.ok) {
    return { ok: false, error: bundle.error || '更新 bundle を取得できませんでした。' };
  }
  if (String(bundle.appBuild || '').trim() !== String(info.latestBuild || '').trim()) {
    return { ok: false, error: '最新版 manifest と bundle の build が一致しません。' };
  }

  try {
    const updateResult = updateScriptProjectContent_(scriptId, bundle.files || []);
    const versionResult = createScriptProjectVersion_(scriptId, `self-update ${bundle.appBuild}`);
    updateScriptDeploymentVersion_(scriptId, deploymentId, Number(versionResult.versionNumber || 0), `self-update ${bundle.appBuild}`);
    const setupResult = reapplyCurrentTenantDeploymentConfig_();
    initSheets();
    getScriptProperties_().setProperties({
      LAST_SELF_UPDATE_BUILD: String(bundle.appBuild || '').trim(),
      LAST_SELF_UPDATE_AT: new Date().toISOString(),
      SELF_UPDATE_STATUS: 'updated',
      SELF_UPDATE_ERROR: '',
    }, false);
    return {
      ok: true,
      changed: true,
      latestBuild: String(bundle.appBuild || '').trim(),
      versionNumber: Number(versionResult.versionNumber || 0),
      deploymentId,
      fileCount: Number(updateResult.fileCount || 0),
      tenantId: String(setupResult.tenantId || '').trim(),
      message: '更新しました。数秒待ってから再読み込みしてください。',
    };
  } catch (err) {
    const normalizedError = normalizeSelfUpdateError_(err);
    getScriptProperties_().setProperties({
      SELF_UPDATE_STATUS: 'error',
      SELF_UPDATE_ERROR: normalizedError,
      LAST_SELF_UPDATE_AT: new Date().toISOString(),
    }, false);
    return { ok: false, error: normalizedError };
  }
}

function rollbackTeacherDeployment_() {
  const versionControl = getTeacherVersionControlInfo_();
  if (!versionControl.ok) {
    return { ok: false, error: versionControl.error || '版情報を取得できませんでした。' };
  }
  if (!versionControl.canRollback || !versionControl.previousVersionNumber) {
    return { ok: false, error: versionControl.reason || '1つ前の版が見つかりません。' };
  }
  try {
    updateScriptDeploymentVersion_(
      versionControl.scriptId,
      versionControl.deploymentId,
      Number(versionControl.previousVersionNumber || 0),
      `rollback version ${versionControl.previousVersionNumber}`
    );
    getScriptProperties_().setProperties({
      LAST_SELF_UPDATE_AT: new Date().toISOString(),
      SELF_UPDATE_STATUS: 'rolled_back',
      SELF_UPDATE_ERROR: '',
    }, false);
    return {
      ok: true,
      changed: true,
      versionNumber: Number(versionControl.previousVersionNumber || 0),
      message: `1つ前の版 ${versionControl.previousVersionNumber} に戻しました。数秒後に再読み込みしてください。`,
    };
  } catch (err) {
    const normalizedError = normalizeSelfUpdateError_(err);
    getScriptProperties_().setProperties({
      SELF_UPDATE_STATUS: 'error',
      SELF_UPDATE_ERROR: normalizedError,
      LAST_SELF_UPDATE_AT: new Date().toISOString(),
    }, false);
    return { ok: false, error: normalizedError };
  }
}

function normalizeSelfUpdateSourceSnapshot_(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return snapshot;
}

function resolveSelfUpdateBundle_(info, manifest) {
  const releaseManifest = manifest && typeof manifest === 'object' ? manifest : {};
  const sourceSnapshot = normalizeSelfUpdateSourceSnapshot_(
    (info && info.sourceSnapshot) || releaseManifest.sourceSnapshot
  );
  if (sourceSnapshot) {
    return parseSelfUpdateBundleSnapshot_(sourceSnapshot);
  }
  return fetchSelfUpdateBundle_(info && info.sourceBundleUrl);
}

function parseSelfUpdateBundleSnapshot_(snapshot) {
  const json = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if (!json || json.ok === false) {
    return { ok: false, error: String((json && json.error) || 'bundle_snapshot_invalid') };
  }
  if (!Array.isArray(json.files) || !json.files.length) {
    return { ok: false, error: 'bundle_files_missing' };
  }
  return {
    ok: true,
    appBuild: String(json.appBuild || '').trim(),
    bundleVersion: String(json.bundleVersion || '').trim(),
    files: json.files,
  };
}

function fetchSelfUpdateBundle_(url) {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) return { ok: false, error: 'bundle_url_missing' };
  try {
    const response = UrlFetchApp.fetch(targetUrl, {
      method: 'get',
      muteHttpExceptions: true,
    });
    const json = JSON.parse(String(response.getContentText() || '{}'));
    if (!json || json.ok === false) {
      return { ok: false, error: String((json && json.error) || 'bundle_fetch_failed') };
    }
    if (!Array.isArray(json.files) || !json.files.length) {
      return { ok: false, error: 'bundle_files_missing' };
    }
    return {
      ok: true,
      appBuild: String(json.appBuild || '').trim(),
      bundleVersion: String(json.bundleVersion || '').trim(),
      files: json.files,
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function updateScriptProjectContent_(scriptId, files) {
  const normalizedFiles = Array.isArray(files) ? files : [];
  if (!normalizedFiles.length) throw new Error('更新 bundle の files が空です。');
  const response = callAppsScriptApi_(
    `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/content`,
    'put',
    { files: normalizedFiles }
  );
  return {
    ok: true,
    fileCount: Array.isArray(response.files) ? response.files.length : normalizedFiles.length,
  };
}

function createScriptProjectVersion_(scriptId, description) {
  const response = callAppsScriptApi_(
    `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/versions`,
    'post',
    { description: String(description || '').trim() }
  );
  return {
    ok: true,
    versionNumber: Number(response.versionNumber || 0),
    description: String(response.description || '').trim(),
  };
}

function getScriptProjectVersions_(scriptId, pageSize) {
  const response = callAppsScriptApi_(
    `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/versions?pageSize=${Math.max(1, Number(pageSize || 20))}`,
    'get'
  );
  return Array.isArray(response.versions) ? response.versions : [];
}

function getScriptDeployment_(scriptId, deploymentId) {
  return callAppsScriptApi_(
    `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,
    'get'
  );
}

function updateScriptDeploymentVersion_(scriptId, deploymentId, versionNumber, description) {
  if (!versionNumber) throw new Error('versionNumber を取得できませんでした。');
  return callAppsScriptApi_(
    `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,
    'put',
    {
      deploymentConfig: {
        scriptId: String(scriptId || '').trim(),
        versionNumber: Number(versionNumber || 0),
        manifestFileName: 'appsscript',
        description: String(description || '').trim(),
      },
    }
  );
}

function getTeacherVersionControlInfo_(runtimeWebAppInfo) {
  const scriptId = String(ScriptApp.getScriptId() || '').trim();
  const deploymentId = String(
    runtimeWebAppInfo && runtimeWebAppInfo.deploymentId ||
    resolveTeacherRuntimeWebAppInfo_().deploymentId ||
    ''
  ).trim();
  if (!scriptId) {
    return { ok: false, error: 'scriptId を取得できませんでした。', reason: 'scriptId を取得できませんでした。' };
  }
  if (!deploymentId) {
    return { ok: false, error: 'deploymentId を取得できませんでした。', reason: 'deploymentId を取得できませんでした。' };
  }
  try {
    const deployment = getScriptDeployment_(scriptId, deploymentId);
    const currentVersionNumber = Number(
      deployment &&
      deployment.deploymentConfig &&
      deployment.deploymentConfig.versionNumber || 0
    );
    const rawVersions = getScriptProjectVersions_(scriptId, 20);
    const versionsMeta = rawVersions
      .map(version => ({
        versionNumber: Number(version && version.versionNumber || 0),
        createTime: String(version && (version.createTime || version.updateTime) || '').trim(),
        description: String(version && version.description || '').trim(),
      }))
      .filter(version => version.versionNumber > 0)
      .sort((a, b) => b.versionNumber - a.versionNumber);
    const versions = versionsMeta.map(version => version.versionNumber);
    const currentVersionMeta = versionsMeta.find(version => version.versionNumber === currentVersionNumber) || null;
    const previousVersionMeta = versionsMeta.find(version => version.versionNumber < currentVersionNumber) || null;
    const previousVersionNumber = Number(previousVersionMeta && previousVersionMeta.versionNumber || 0);
    return {
      ok: true,
      scriptId,
      deploymentId,
      currentVersionNumber,
      currentVersionCreatedAt: String(currentVersionMeta && currentVersionMeta.createTime || '').trim(),
      currentVersionDescription: String(currentVersionMeta && currentVersionMeta.description || '').trim(),
      previousVersionNumber,
      previousVersionCreatedAt: String(previousVersionMeta && previousVersionMeta.createTime || '').trim(),
      previousVersionDescription: String(previousVersionMeta && previousVersionMeta.description || '').trim(),
      recentVersions: versions.slice(0, 6),
      canRollback: Boolean(previousVersionNumber),
      reason: previousVersionNumber ? '' : 'この個体では1つ前の版が見つかりません。',
    };
  } catch (err) {
    const normalizedError = normalizeSelfUpdateError_(err);
    return {
      ok: false,
      scriptId,
      deploymentId,
      error: normalizedError,
      reason: normalizedError,
      canRollback: false,
      recentVersions: [],
    };
  }
}

function callAppsScriptApi_(url, method, payload) {
  const response = UrlFetchApp.fetch(String(url || '').trim(), {
    method: String(method || 'get').toLowerCase(),
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`,
    },
    payload: payload === undefined ? null : JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const body = String(response.getContentText() || '{}');
  const status = Number(response.getResponseCode() || 0);
  let json = {};
  try {
    json = JSON.parse(body);
  } catch (_err) {}
  if (status < 200 || status >= 300) {
    const message = json && json.error && json.error.message
      ? json.error.message
      : body.slice(0, 400);
    const error = new Error(`Apps Script API ${status}: ${message}`);
    error.apiStatus = status;
    error.apiMessage = String(message || '').trim();
    error.apiBody = body.slice(0, 800);
    throw error;
  }
  return json && typeof json === 'object' ? json : {};
}

function normalizeSelfUpdateError_(err) {
  const rawMessage = String(err && err.message ? err.message : err || '').trim();
  const status = Number(err && err.apiStatus || 0);
  const apiMessage = String(err && err.apiMessage ? err.apiMessage : '').trim();
  const combined = `${rawMessage} ${apiMessage}`.trim();
  if (/Access Not Configured|API has not been used|disabled/i.test(combined)) {
    return 'Apps Script API が未有効です。コピー先スクリプトの Google Cloud project で Apps Script API を有効化してください。';
  }
  if (status === 401 || /Request had invalid authentication credentials/i.test(combined)) {
    return '認証に失敗しました。先生アプリを開き直して権限を再許可してから、もう一度更新してください。';
  }
  if (status === 403) {
    if (/insufficient authentication scopes/i.test(combined)) {
      return '更新権限が不足しています。Apps Script API 用の権限をこのアプリに再承認してください。';
    }
    if (/The caller does not have permission|permission denied/i.test(combined)) {
      return 'このスクリプトを書き換える権限がありません。コピー先の所有者アカウントで実行しているか確認してください。';
    }
    return 'Apps Script API へのアクセスが拒否されました。Cloud project の設定か、このアカウントの権限を確認してください。';
  }
  if (status === 404) {
    if (/deployment/i.test(combined)) {
      return 'deployment が見つかりません。このアプリのデプロイ情報がずれている可能性があります。再デプロイ後に再試行してください。';
    }
    if (/projects\//i.test(combined) || /Requested entity was not found/i.test(combined)) {
      return 'scriptId が見つかりません。このコピー先アプリの scriptId 設定を確認してください。';
    }
  }
  if (status === 400 && /Invalid JSON payload|manifest/i.test(combined)) {
    return '更新bundleの内容が不正です。配布元アプリの再デプロイが必要です。';
  }
  if (/Service invoked too many times|Rate Limit Exceeded/i.test(combined)) {
    return '更新APIが混み合っています。少し待ってからもう一度更新してください。';
  }
  return rawMessage || '更新に失敗しました。';
}

function requestTeacherAppUpdate_() {
  const base = String(ADMIN_WEBAPP_URL || '').trim();
  if (!base) return { ok: false, error: '導入管理URLが未設定です。' };

  const spreadsheet = getTenantSpreadsheet_();
  const setupConfig = loadTemplateSetupConfig_(spreadsheet);
  const runtimeWebAppInfo = resolveTeacherRuntimeWebAppInfo_({
    setupConfig,
    currentWebAppUrl: getCurrentWebAppBaseUrl_(),
  });
  const currentWebAppUrl = runtimeWebAppInfo.currentWebAppUrl;
  const releaseInfo = fetchAdminReleaseInfo_();
  const scriptId = String(ScriptApp.getScriptId() || '').trim();
  const deploymentId = runtimeWebAppInfo.deploymentId;
  const payload = {
    action: 'requestTenantUpdate',
    registrationId: String(setupConfig.registrationId || '').trim(),
    teacherName: String(setupConfig.teacherName || getTeacherName_() || '').trim(),
    teacherEmail: String(setupConfig.teacherEmail || '').trim(),
    schoolName: String(setupConfig.schoolName || '').trim(),
    grade: String(setupConfig.grade || '').trim(),
    className: String(setupConfig.className || '').trim(),
    tenantId: String(getScriptProperties_().getProperty('TENANT_ID') || '').trim(),
    spreadsheetId: String(spreadsheet.getId() || '').trim(),
    spreadsheetUrl: String(spreadsheet.getUrl() || '').trim(),
    scriptId,
    scriptUrl: scriptId ? `https://script.google.com/home/projects/${scriptId}/edit` : '',
    deploymentId,
    currentWebAppUrl,
    currentBuild: String(APP_BUILD || '').trim(),
    latestKnownBuild: String(releaseInfo.latestTenantAppBuild || '').trim(),
    latestKnownVersion: String(releaseInfo.latestTenantAppVersion || '').trim(),
  };
  try {
    const response = UrlFetchApp.fetch(base, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const json = JSON.parse(String(response.getContentText() || '{}'));
    if (!json || !json.ok) {
      return { ok: false, error: String((json && json.error) || 'update_request_failed') };
    }
    return {
      ok: true,
      requestedAt: String(json.requestedAt || '').trim(),
      latestBuild: String(json.latestTenantAppBuild || '').trim(),
      latestVersion: String(json.latestTenantAppVersion || '').trim(),
      message: '更新依頼を記録しました。',
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function buildPortableTeacherRelayUrl_(apiUrl) {
  return buildPortableAppUrl_('teacher.html', apiUrl, true);
}

function buildPortableStudentRelayUrl_(apiUrl) {
  return buildPortableAppUrl_('student.html', apiUrl, true);
}

function buildPortableSetupUrl_(apiUrl) {
  return buildPortableAppUrl_('setup.html', apiUrl, true);
}

function buildPortableAppUrl_(path, apiUrl, includeApi) {
  const base = normalizePortableAppBaseUrl_(PORTABLE_APP_BASE_URL || '');
  if (!base) return '';
  const cleanPath = String(path || '').trim().replace(/^\/+/, '');
  const portableUrl = cleanPath ? `${base}/${cleanPath}` : base;
  if (includeApi === false) return portableUrl;
  const normalizedApiUrl = normalizeWebAppUrl_(String(apiUrl || '').trim());
  return normalizedApiUrl
    ? appendQueryParams_(portableUrl, { api: normalizedApiUrl })
    : portableUrl;
}

function normalizePortableAppBaseUrl_(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildAdminFormUrl_() {
  const base = String(ADMIN_WEBAPP_URL || '').trim();
  if (!base) return '';
  return appendQueryParams_(base, { mode: 'form' });
}

function buildAdminGuideModeUrl_() {
  const base = String(ADMIN_WEBAPP_URL || '').trim();
  if (!base) return '';
  return appendQueryParams_(base, { mode: 'guide' });
}

function appendQueryParams_(url, params) {
  const base = String(url || '').trim();
  if (!base) return '';
  const query = Object.keys(params || {})
    .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  if (!query) return base;
  return base.includes('?') ? `${base}&${query}` : `${base}?${query}`;
}

function getAiQueueStatus() {
  if (!isStudentAiEnabled_()) {
    return {
      disabled: true,
      disabledReason: 'student_ai_disabled',
      total: 0,
      pending: 0,
      processing: 0,
      staleProcessing: 0,
      error: 0,
      done: 0,
      queuedEligible: 0,
      retrying: 0,
      triggerCount: 0,
      lastQueuedAt: '',
      lastProcessedAt: '',
      lastSuccessAt: '',
      lastLatencyMs: 0,
      lastModelLatencyMs: 0,
      maxRetryCount: 0,
      sampleErrors: [],
      persistRetryItems: 0,
      persistRetryBatches: 0,
    };
  }
  tryProcessPendingAiInline_('teacher_queue');
  ensureAiQueueLiveness_();
  const snapshot = getAiQueueSnapshot_();
  const queue = {
    total: Number(snapshot.total || 0),
    pending: Number(snapshot.pending || 0),
    processing: Number(snapshot.processing || 0),
    staleProcessing: Number(snapshot.staleProcessing || 0),
    error: Number(snapshot.error || 0),
    done: Number(snapshot.done || 0),
    queuedEligible: Number(snapshot.queuedEligible || 0),
    retrying: Number(snapshot.retrying || 0),
    triggerCount: 0,
    lastQueuedAt: snapshot.lastQueuedAt || '',
    lastProcessedAt: snapshot.lastProcessedAt || '',
    lastSuccessAt: snapshot.lastSuccessAt || '',
    lastLatencyMs: Number(snapshot.lastLatencyMs || 0),
    lastModelLatencyMs: Number(snapshot.lastModelLatencyMs || 0),
    maxRetryCount: Number(snapshot.maxRetryCount || 0),
    sampleErrors: Array.isArray(snapshot.sampleErrors) ? snapshot.sampleErrors.slice(0, 5) : [],
    persistRetryItems: 0,
    persistRetryBatches: 0,
  };
  const aggregateHealth = getAggregateQueueHealth_();
  queue.persistRetryItems = Number(aggregateHealth.persistRetryItems || 0);
  queue.persistRetryBatches = Number(aggregateHealth.persistRetryBatches || 0);
  queue.triggerCount = ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === AI_BATCH_HANDLER)
    .length;
  return queue;
}

function retryFailedAiResponses() {
  if (!isStudentAiEnabled_()) {
    return {
      ok: false,
      error: 'この先生では児童AIコメントは無効です。',
      queue: getAiQueueStatus(),
    };
  }
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  let retried = 0;
  let staleReset = 0;
  const requeuedEvents = [];
  try {
    const queuedAt = nowIso_();
    const responseData = getResponseSheetData_();
    const masterRows = [];
    const rowUpdates = [];
    listAllResponses_().forEach(response => {
      const submitted = response?.submitted === true;
      const reviewText = String(response?.reviewText || '').trim();
      const aiStatus = String(response?.aiStatus || '');
      if (!submitted || !reviewText) return;
      let detail = '';
      if (aiStatus === 'error') {
        detail = 'retryFailedAiResponses error->pending';
        retried++;
      } else if (isStaleAiProcessing_(aiStatus, response?.aiProcessedAt || '', response?.aiStartedAt || '')) {
        detail = 'retryFailedAiResponses stale->pending';
        staleReset++;
      }
      if (!detail) return;
      const next = Object.assign({}, response, {
        aiStatus: 'pending',
        aiQueuedAt: queuedAt,
        aiProcessedAt: '',
        aiError: '',
        aiBatchId: '',
        aiStartedAt: '',
        aiLatencyMs: 0,
        aiModelLatencyMs: 0,
        updatedAt: queuedAt,
      });
      const row = buildResponseSheetRowValues_(next);
      masterRows.push(row);
      const existingRow = findResponseSheetRowEntryByResponseId_(next.responseId, responseData);
      if (existingRow) {
        rowUpdates.push({ rowNumber: existingRow.rowNumber, values: row });
      }
      requeuedEvents.push({
        responseId: next.responseId || '',
        lessonId: next.lessonId || '',
        unitId: next.unitId || '',
        studentId: next.studentId || '',
        studentNumber: next.studentNumber || '',
        studentName: next.studentName || '',
        eventType: 'manual_requeue',
        aiStatus: 'pending',
        detail,
        timestamp: queuedAt,
        retryCount: Number(next.aiRetryCount || 0),
      });
    });
    if (masterRows.length) {
      mirrorResponseRowsWithAudit_(
        masterRows,
        'response_teacher_retry_ai',
        'master_mirror_failed_teacher_retry_ai',
        'teacher'
      );
    }
    if (rowUpdates.length) {
      writeResponseRowUpdates_(rowUpdates, null);
    }
  } finally {
    lock.releaseLock();
  }
  writeAiEventLogs_(requeuedEvents);
  if (retried || staleReset) {
    safeEnsureAiBatchTrigger_(AI_TRIGGER_RETRY_RESCUE_DELAY_MS, 'retryFailedAiResponses');
  }
  return {
    ok: true,
    retried,
    staleReset,
    queue: getAiQueueStatus(),
  };
}

function repairMissingAggregateEntries() {
  return {
    ok: true,
    skipped: true,
    reason: 'aggregate_write_disabled',
    enqueued: 0,
    flushed: 0,
    remaining: 0,
    queue: getAiQueueStatus(),
  };
}

function buildLessonStatus_(unitId, period) {
  const startedAt = Date.now();
  const timing = {};
  const snapshotStartedAt = Date.now();
  const snapshot = getLessonLiveStateSnapshot_(unitId, period, { createLesson: true })
    || getLessonRuntimeSnapshot_(unitId, period)
    || {};
  timing.snapshotMs = Date.now() - snapshotStartedAt;
  const unit = snapshot.unit || null;
  const lesson = snapshot.lesson || getOrCreateLesson_(unitId, period);
  timing.unitsLookupMs = timing.snapshotMs;
  timing.lessonLookupMs = timing.snapshotMs;
  const fieldStartedAt = Date.now();
  const reviewField = snapshot.reviewField || null;
  const understandingField = snapshot.understandingField || null;
  const fields = Array.isArray(snapshot.fields) ? snapshot.fields : [];
  const statusFieldCount = fields.filter(field => String(field?.key || '') !== String(understandingField?.key || '')).length;
  timing.fieldSetupMs = Date.now() - fieldStartedAt;
  const responseStartedAt = Date.now();
  const responses = (Array.isArray(snapshot.responses) ? snapshot.responses : [])
    .filter(response => !isAiLoadTestResponse_(response));
  const responseReadMeta = snapshot.responseReadMeta || summarizeResponseReadForLesson_(lesson.lessonId, responses);
  timing.responsesMs = Date.now() - responseStartedAt;
  const responseMap = {};
  const draftMap = {};
  const draftStartedAt = Date.now();
  const drafts = listTeacherCommentDrafts_(lesson.lessonId);
  timing.draftsMs = Date.now() - draftStartedAt;
  responses.forEach(row => {
    responseMap[String(row.studentNumber)] = row;
  });
  drafts.forEach(draft => {
    draftMap[String(draft.responseId || '')] = draft;
  });
  const teacherAiEnabled = isTeacherAiEnabled_();
  const rosterStartedAt = Date.now();
  const roster = Array.isArray(snapshot.roster) ? snapshot.roster : getRosterEntries_();
  timing.rosterMs = Date.now() - rosterStartedAt;
  const buildStartedAt = Date.now();
  const students = roster.map(student => {
    const response = responseMap[String(student.number)];
    const draft = response ? draftMap[String(response.responseId || '')] : null;
    const draftStatus = String(draft?.status || '').trim();
    const draftCleared = draftStatus === 'cleared';
    const review = response
      ? (reviewField ? String(response.answersMap[reviewField.key] || response.reviewText || '') : response.reviewText || '')
      : '';
    const understanding = response && understandingField
      ? String(response.answersMap[understandingField.key] || '')
      : '';
    const entries = response
      ? buildLessonStatusEntries_(fields, response.answersMap || {}, response.reviewText || '', {
          reviewFieldKey: reviewField?.key || REVIEW_FIELD_KEY,
          understandingFieldKey: understandingField?.key || '',
        })
      : [];
    return {
      num: student.number,
      name: response?.studentName || student.name || '',
      review,
      understanding,
      entries,
      totalFieldCount: statusFieldCount,
      writtenCount: entries.length,
      responseId: response?.responseId || '',
      studentId: response?.studentId || '',
      lessonId: response?.lessonId || '',
      rank: response?.rank || '',
      medal: response?.medal || '',
      medalColor: getMedalColor_(response?.medal || ''),
      isFavorite: response?.isFavorite === true,
      comment: response?.comment || '',
      draftComment: draftCleared ? '' : (draft?.draftComment || response?.comment || ''),
      draftRank: draftCleared ? '' : (draft?.draftRank || response?.rank || ''),
      draftScore: draftCleared ? 0 : Number(draft?.draftScore || 0),
      draftStatus: draftCleared ? 'cleared' : (draftStatus || ((response?.comment || response?.rank) ? 'returned' : '')),
      draftUpdatedAt: draftCleared ? (draft?.updatedAt || '') : (draft?.updatedAt || response?.updatedAt || ''),
      draftReturnedAt: draftCleared ? '' : (draft?.returnedAt || response?.updatedAt || ''),
      submitted: response?.submitted === true,
      responseUpdatedAt: response?.updatedAt || '',
      score: response?.score || 0,
      submittedAt: response?.submittedAt || '',
      aiStatus: response?.aiStatus || '',
      aiRetryCount: Number(response?.aiRetryCount || 0),
      aiQueuedAt: response?.aiQueuedAt || '',
      aiStartedAt: response?.aiStartedAt || '',
      aiProcessedAt: response?.aiProcessedAt || '',
      aiError: response?.aiError || '',
      aiLatencyMs: Number(response?.aiLatencyMs || 0),
      aiModelLatencyMs: Number(response?.aiModelLatencyMs || 0),
      aiElapsedMs: response
        ? calcAiElapsedMs_(response.aiStartedAt || response.aiQueuedAt, response.aiProcessedAt || '')
        : 0,
    };
  });
  timing.studentBuildMs = Date.now() - buildStartedAt;
  timing.totalMs = Date.now() - startedAt;
  return {
    meta: {
      unitId: String(unitId || ''),
      period: Number(period || 0),
      lessonId: String(lesson.lessonId || ''),
      unitName: String(unit?.name || ''),
      subject: String(unit?.subject || ''),
      fields: fields
        .filter(field => String(field?.key || '') !== String(understandingField?.key || ''))
        .map(field => ({
          key: String(field?.key || ''),
          label: String(field?.label || field?.key || ''),
          emoji: String(field?.emoji || ''),
          type: String(field?.type || 'text'),
        })),
      reviewFieldKey: String(reviewField?.key || REVIEW_FIELD_KEY),
      understandingFieldKey: String(understandingField?.key || ''),
      teacherAiEnabled,
      responseReadMeta,
      draftCount: drafts.filter(draft => String(draft.status || '') === 'draft' && (String(draft.draftComment || '').trim() || String(draft.draftRank || '').trim())).length,
      returnedCount: drafts.filter(draft => String(draft.status || '') === 'returned').length,
      timing,
    },
    students,
  };
}

// getLessonStatus:
// status タブ専用の授業状況本体。初期 bootstrap と責務を分ける。
function getLessonStatus(unitId, period) {
  const cacheKey = getLessonStatusCacheKey_(unitId, period);
  const cached = getCachedJson_(cacheKey);
  if (cached && typeof cached === 'object') return cached;
  return putCachedJson_(cacheKey, buildLessonStatus_(unitId, period), 15);
}

function buildLessonStatusEntries_(fields, answersMap, reviewText, options) {
  const entries = [];
  const reviewFieldKey = String(options?.reviewFieldKey || REVIEW_FIELD_KEY);
  const understandingFieldKey = String(options?.understandingFieldKey || '');
  (fields || []).forEach(field => {
    const key = String(field?.key || '');
    if (!key || key === understandingFieldKey) return;
    const rawValue = key === reviewFieldKey
      ? (answersMap?.[key] || reviewText || '')
      : answersMap?.[key];
    const value = normalizeLessonStatusFieldValue_(rawValue);
    if (!value) return;
    entries.push({
      key,
      label: field?.label || key,
      emoji: field?.emoji || '',
      type: field?.type || 'text',
      hints: field?.hints || '',
      value,
    });
  });
  if (entries.length) return entries;
  Object.keys(answersMap || {}).forEach(key => {
    const normalizedKey = String(key || '');
    if (!normalizedKey || normalizedKey === understandingFieldKey) return;
    const value = normalizeLessonStatusFieldValue_(
      normalizedKey === reviewFieldKey
        ? (answersMap?.[normalizedKey] || reviewText || '')
        : answersMap?.[normalizedKey]
    );
    if (!value) return;
    const field = (fields || []).find(item => String(item?.key || '') === normalizedKey) || null;
    entries.push({
      key: normalizedKey,
      label: field?.label || normalizedKey,
      emoji: field?.emoji || '',
      type: field?.type || (normalizedKey === reviewFieldKey ? 'review' : 'text'),
      hints: field?.hints || '',
      value,
    });
  });
  return entries;
}

function normalizeLessonStatusFieldValue_(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean).join(' / ');
  }
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function buildTeacherFeedbackEvents_(items, eventType, extras) {
  const list = Array.isArray(items) ? items : [];
  const meta = extras || {};
  return list.map(item => ({
    responseId: item.responseId || '',
    lessonId: item.lessonId || '',
    unitId: item.unitId || '',
    studentId: item.studentId || '',
    studentNumber: item.studentNumber || '',
    studentName: '',
    batchId: meta.batchId || '',
    eventType,
    aiStatus: meta.aiStatus || '',
    detail: meta.detail || '',
    timestamp: meta.timestamp || nowIso_(),
    latencyMs: Number(meta.latencyMs || 0),
    modelLatencyMs: Number(meta.modelLatencyMs || 0),
    retryCount: Number(meta.retryCount || 0),
  }));
}

function generateTeacherFeedbackDrafts(unitId, period, includeRank, autoReturn, responseIds, onlyMissing, medalMode) {
  if (!isTeacherAiEnabled_()) return { ok:false, error:'この先生では先生向けAI機能は無効です。' };
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
  if (!apiKey) return { ok:false, error:'APIキーが設定されていません。' };

  const normalizedUnitId = String(unitId || '').trim();
  const normalizedPeriod = String(period || '').trim();
  if (!normalizedUnitId || !normalizedPeriod) return { ok:false, error:'単元と時間目を選択してください。' };
  const units = getAllUnits();
  const unit = units.find(item => String(item.id || '') === normalizedUnitId);
  if (!unit) return { ok:false, error:'単元が見つかりません。' };
  const lesson = getOrCreateLesson_(normalizedUnitId, normalizedPeriod);
  const job = beginTeacherFeedbackJob_(lesson.lessonId, 'generate');
  if (!job.ok) return { ok:false, error: job.error || '教師AI処理が進行中です。' };
  try {
  const allResponses = listResponsesForLesson_(lesson.lessonId)
    .filter(response => !isAiLoadTestResponse_(response))
    .filter(response => canGenerateTeacherFeedbackForResponse_(response));
  if (!allResponses.length) return { ok:false, error:'記入済みの児童がいません。' };

  const normalizedMedalMode = normalizeTeacherFeedbackMedalMode_(medalMode);
  const responseIdSet = new Set((Array.isArray(responseIds) ? responseIds : []).map(value => String(value || '').trim()).filter(Boolean));
  const draftMap = {};
  listTeacherCommentDrafts_(lesson.lessonId).forEach(draft => {
    draftMap[String(draft.responseId || '').trim()] = draft;
  });
  const selectedResponses = responseIdSet.size
    ? allResponses.filter(response => responseIdSet.has(String(response.responseId || '').trim()))
    : allResponses;
  const missingOnly = onlyMissing !== false;
  const responses = missingOnly
    ? selectedResponses.filter(response => !hasTeacherFeedbackResult_(response, draftMap[String(response.responseId || '').trim()]))
    : selectedResponses;
  const skippedExistingCount = selectedResponses.length - responses.length;
  if (!selectedResponses.length) return { ok:false, error:'対象の記録が見つかりません。' };
  if (!responses.length) return {
    ok: true,
    targetCount: 0,
    updatedCount: 0,
    returnedCount: 0,
    includeRank: includeRank !== false,
    autoReturn: autoReturn === true,
    skippedExistingCount,
    medalAwarded: false,
    drafts: [],
  };

  const targets = buildTeacherFeedbackDraftTargets_(unit, normalizedPeriod, responses);
  if (!targets.length) return {
    ok: true,
    targetCount: 0,
    updatedCount: 0,
    returnedCount: 0,
    includeRank: includeRank !== false,
    autoReturn: autoReturn === true,
    skippedExistingCount,
    medalAwarded: false,
    drafts: [],
  };

  const draftItems = [];
  const chunkSize = Math.max(1, Number(AI_TEACHER_DRAFT_CHUNK_SIZE || 10));
  const withRank = includeRank !== false;
  const batchId = makeId_('teacherfb');
  writeAiEventLogs_(buildTeacherFeedbackEvents_(targets, 'teacher_feedback_started', {
    batchId,
    aiStatus: 'pending',
    detail: `targetCount=${targets.length} includeRank=${withRank} autoReturn=${autoReturn === true}`,
    timestamp: nowIso_(),
  }));
  const totalChunks = Math.ceil(targets.length / chunkSize);
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    const chunkIndex = Math.floor(i / chunkSize) + 1;
    const chunkDetail = `chunk=${chunkIndex}/${totalChunks} size=${chunk.length} includeRank=${withRank}`;
    const apiStartedAt = Date.now();
    writeAiEventLogs_(buildTeacherFeedbackEvents_(chunk, 'teacher_feedback_api_started', {
      batchId,
      aiStatus: 'processing',
      detail: chunkDetail,
      timestamp: nowIso_(),
    }));
    const prompt = buildTeacherFeedbackDraftPrompt_(unit, normalizedPeriod, chunk, withRank);
    try {
      const parsed = fetchGeminiJsonWithRetry_(apiKey, prompt);
      const normalized = normalizeTeacherFeedbackDrafts_(parsed, chunk, withRank);
      normalized.forEach(item => draftItems.push(item));
      writeAiEventLogs_(buildTeacherFeedbackEvents_(chunk, 'teacher_feedback_api_finished', {
        batchId,
        aiStatus: 'processing',
        detail: `${chunkDetail} saved=${normalized.length}`,
        timestamp: nowIso_(),
        latencyMs: Date.now() - apiStartedAt,
      }));
    } catch (err) {
      writeAiEventLogs_(buildTeacherFeedbackEvents_(chunk, 'teacher_feedback_failed', {
        batchId,
        aiStatus: 'error',
        detail: `${chunkDetail} error=${String(err && err.message ? err.message : err).slice(0, 180)}`,
        timestamp: nowIso_(),
        latencyMs: Date.now() - apiStartedAt,
      }));
      throw err;
    }
  }

  let savedDrafts = draftItems.slice();
  let saveLatencyMs = 0;
  if (autoReturn === true) {
    writeAiEventLogs_(buildTeacherFeedbackEvents_(savedDrafts, 'teacher_feedback_saved', {
      batchId,
      aiStatus: 'done',
      detail: `draftSkipped autoReturn=true includeRank=${withRank} saveMs=0`,
      timestamp: nowIso_(),
      latencyMs: 0,
    }));
  } else {
    saveLatencyMs = 0;
    writeAiEventLogs_(buildTeacherFeedbackEvents_(savedDrafts, 'teacher_feedback_saved', {
      batchId,
      aiStatus: 'done',
      detail: `draftDeferred autoReturn=false includeRank=${withRank} saveMs=${saveLatencyMs}`,
      timestamp: nowIso_(),
      latencyMs: saveLatencyMs,
    }));
  }
  let returnedCount = 0;
  let medalAwarded = false;
  let returnedIds = [];
  if (autoReturn === true && savedDrafts.length) {
    const applied = applyTeacherFeedbackDrafts_(lesson.lessonId, savedDrafts, {
      batchId,
      source: 'teacher_bulk_generate',
      medalMode: normalizedMedalMode,
      skipDraftPersist: true,
    });
    returnedCount = Number(applied.returnedCount || 0);
    medalAwarded = applied?.medalAwarded === true;
    returnedIds = Array.isArray(applied?.returnedIds) ? applied.returnedIds : [];
  }
  return {
    ok: true,
    targetCount: targets.length,
    updatedCount: savedDrafts.length,
    returnedCount,
    includeRank: withRank,
    autoReturn: autoReturn === true,
    skippedExistingCount,
    medalAwarded,
    returnedIds,
    drafts: savedDrafts,
  };
  } finally {
    endTeacherFeedbackJob_(job.jobKey, job.token);
  }
}

function saveTeacherFeedbackDraft(responseId, draftComment, draftRank) {
  const existing = getResponseRecordByResponseId_(responseId);
  if (!existing) return { ok:false, error:'対象の提出が見つかりません。' };
  const nextComment = String(draftComment || '').trim();
  const nextRank = normalizeStudentRank_(draftRank);
  const nextScore = nextRank ? studentRankToScore_(nextRank) : 0;
  const saved = upsertTeacherCommentDrafts_([{
    responseId: existing.responseId || '',
    lessonId: existing.lessonId || '',
    unitId: existing.unitId || '',
    studentId: existing.studentId || '',
    studentNumber: existing.studentNumber || '',
    draftComment: nextComment,
    draftRank: nextRank,
    draftScore: nextScore,
    status: (nextComment || nextRank) ? 'draft' : 'cleared',
    returnedAt: '',
  }], 'teacher');
  return { ok:true, draft: saved[0] || null };
}

function saveTeacherFeedbackDraftsBulk(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { ok:true, savedCount: 0, drafts: [] };
  const responseIdSet = new Set(list.map(item => String(item && item.responseId || '').trim()).filter(Boolean));
  if (!responseIdSet.size) return { ok:false, error:'保存する下書きがありません。' };
  const responseMap = {};
  listAllResponses_().forEach(response => {
    const responseId = String(response && response.responseId || '').trim();
    if (responseIdSet.has(responseId)) responseMap[responseId] = response;
  });
  const draftItems = [];
  list.forEach(item => {
    const responseId = String(item && item.responseId || '').trim();
    const existing = responseMap[responseId];
    if (!existing) return;
    const nextComment = String(item && item.draftComment || '').trim();
    const nextRank = normalizeStudentRank_(item && item.draftRank);
    const nextScore = nextRank ? studentRankToScore_(nextRank) : 0;
    draftItems.push({
      responseId: existing.responseId || '',
      lessonId: existing.lessonId || '',
      unitId: existing.unitId || '',
      studentId: existing.studentId || '',
      studentNumber: existing.studentNumber || '',
      draftComment: nextComment,
      draftRank: nextRank,
      draftScore: nextScore,
      status: (nextComment || nextRank) ? 'draft' : 'cleared',
      returnedAt: '',
    });
  });
  if (!draftItems.length) return { ok:false, error:'対象の提出が見つかりません。' };
  const saved = upsertTeacherCommentDrafts_(draftItems, 'teacher-bulk', {
    skipAuditLogs: true,
  });
  return {
    ok: true,
    savedCount: saved.length,
    drafts: saved,
  };
}

function updateTeacherFavoriteColumnsByRowEntry_(existingRowEntry, isFavorite) {
  const rowEntry = existingRowEntry && typeof existingRowEntry === 'object' ? existingRowEntry : null;
  const rowNumber = Number(rowEntry && rowEntry.rowNumber || 0);
  const rowValues = Array.isArray(rowEntry && rowEntry.values) ? rowEntry.values.slice() : [];
  if (rowNumber < 2 || !rowValues.length) return null;
  const nextFavorite = isFavorite === true;
  rowValues[25] = nextFavorite;
  getResponsesDbSheet_().getRange(rowNumber, 26).setValue(nextFavorite);
  writeResponseRowCaches_(rowValues, rowNumber);
  const lessonId = String(rowValues[1] || '').trim();
  const studentId = String(rowValues[3] || '').trim();
  if (lessonId && studentId) {
    const liveSheet = getLessonLiveStateDbSheet_();
    const liveRowNumber = readLessonLiveStateRowNumber_(liveSheet, lessonId, studentId);
    if (liveRowNumber >= 2) {
      liveSheet.getRange(liveRowNumber, 28).setValue(nextFavorite);
      putCachedJson_(getLessonLiveStateRowCacheKey_(lessonId, studentId), liveRowNumber, 21600);
      addLessonLiveStateRowIndex_(lessonId, liveRowNumber);
    }
  }
  invalidateLessonResponseCaches_();
  return { rowNumber, values: rowValues, isFavorite: nextFavorite };
}

function readTeacherFavoriteMutationActor_() {
  const spreadsheet = getTenantSpreadsheet_();
  const setupConfig = loadTemplateSetupConfig_(spreadsheet);
  const configuredTeacherName = String(setupConfig.teacherName || getTeacherName_() || '').trim();
  const configuredTeacherEmail = String(setupConfig.teacherEmail || '').trim().toLowerCase();
  const sessionEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!String(getTenantId_() || '').trim()) throw new Error('tenant が未設定です。');
  if (configuredTeacherEmail && sessionEmail && configuredTeacherEmail !== sessionEmail) {
    throw new Error('教師権限がありません。');
  }
  return {
    teacherName: configuredTeacherName,
    teacherEmail: configuredTeacherEmail,
    sessionEmail,
  };
}

function resolveTeacherFavoriteTarget_(responseId, options) {
  const normalizedResponseId = String(responseId || '').trim();
  if (!normalizedResponseId) {
    throw new Error('responseId が不正です。');
  }
  const opts = options && typeof options === 'object' ? options : {};
  const response = getResponseRecordByResponseId_(normalizedResponseId);
  if (!response || String(response.responseId || '').trim() !== normalizedResponseId) {
    throw new Error('対象の提出が見つかりません。');
  }
  const lesson = getLessonRecordById_(response.lessonId);
  if (!lesson || String(lesson.lessonId || '').trim() !== String(response.lessonId || '').trim()) {
    throw new Error('response と lesson の対応が不正です。');
  }
  const expectedLessonId = String(opts.lessonId || '').trim();
  if (expectedLessonId && expectedLessonId !== String(lesson.lessonId || '').trim()) {
    throw new Error('別授業の responseId は更新できません。');
  }
  const expectedUnitId = String(opts.unitId || '').trim();
  if (expectedUnitId && expectedUnitId !== String(lesson.unitId || '').trim()) {
    throw new Error('lesson と unit の対応が不正です。');
  }
  const expectedPeriod = Number(opts.period || 0);
  if (expectedPeriod > 0 && expectedPeriod !== Number(lesson.period || 0)) {
    throw new Error('lesson と period の対応が不正です。');
  }
  if (!String(response.studentId || '').trim() || !String(response.studentNumber || '').trim()) {
    throw new Error('response と児童情報の対応が不正です。');
  }
  const rosterExists = getRosterEntries_(true).some(function (student) {
    return String(student && student.number || '').trim() === String(response.studentNumber || '').trim();
  });
  if (!rosterExists) {
    throw new Error('response の児童が授業データに存在しません。');
  }
  const existingRow = findResponseSheetRowEntryByResponseId_(normalizedResponseId);
  return {
    response,
    lesson,
    existingRow: existingRow && Number(existingRow.rowNumber || 0) >= 2 ? existingRow : null,
  };
}

function setTeacherResponseFavorite(responseId, isFavorite, options) {
  readTeacherFavoriteMutationActor_();
  const target = resolveTeacherFavoriteTarget_(responseId, options);
  const nextFavorite = isFavorite === true;
  const existing = target.response || {};
  if (existing.isFavorite === nextFavorite) {
    return {
      ok: true,
      responseId: String(existing.responseId || ''),
      lessonId: String(existing.lessonId || ''),
      isFavorite: nextFavorite,
    };
  }
  const next = Object.assign({}, existing, {
    isFavorite: nextFavorite,
    updatedAt: nowIso_(),
  });
  const row = buildResponseSheetRowValues_(next);
  if (target.existingRow) {
    updateTeacherFavoriteColumnsByRowEntry_(target.existingRow, nextFavorite);
  } else {
    upsertResponseSheetRowValues_(row, null, {
      updateLessonLiveState: true,
    });
  }
  mirrorResponseRowsWithAudit_(
    [row],
    'response_teacher_favorite_update',
    'master_mirror_failed_teacher_favorite_update',
    'teacher'
  );
  return {
    ok: true,
    responseId: String(existing.responseId || ''),
    lessonId: String(existing.lessonId || ''),
    isFavorite: nextFavorite,
  };
}

function saveTeacherFeedbackMedal(responseId, medal) {
  const existing = getResponseRecordByResponseId_(responseId);
  if (!existing) return { ok:false, error:'対象の提出が見つかりません。' };
  const nextMedal = normalizeTeacherMedal_(medal);
  const updatedAt = nowIso_();
  const next = Object.assign({}, existing, {
    medal: nextMedal,
    updatedAt,
  });
  const row = buildResponseSheetRowValues_(next);
  mirrorResponseRowsWithAudit_(
    [row],
    'response_teacher_medal_update',
    'master_mirror_failed_teacher_medal_update',
    'teacher'
  );
  const existingRow = findResponseSheetRowEntryByResponseId_(responseId);
  if (existingRow) {
    writeResponseSheetRowEntryUpdates_([{
      rowNumber: existingRow.rowNumber,
      values: row,
    }], null, null, null, {
      updateLessonLiveState: true,
    });
  }
  return {
    ok: true,
    medal: nextMedal,
    medalColor: getMedalColor_(nextMedal),
  };
}

function returnTeacherFeedbackDrafts(unitId, period, responseIds, medalMode, options) {
  const normalizedUnitId = String(unitId || '').trim();
  const normalizedPeriod = String(period || '').trim();
  if (!normalizedUnitId || !normalizedPeriod) return { ok:false, error:'単元と時間目を選択してください。' };
  const lesson = getOrCreateLesson_(normalizedUnitId, normalizedPeriod);
  const opts = options && typeof options === 'object' ? options : {};
  const responses = listResponsesForLesson_(lesson.lessonId);
  const responseMap = {};
  responses.forEach(response => {
    const responseId = String(response && response.responseId || '').trim();
    if (responseId) responseMap[responseId] = response;
  });
  const draftMap = {};
  listTeacherCommentDrafts_(lesson.lessonId)
    .filter(draft => String(draft.status || '') === 'draft' && String(draft.draftComment || '').trim())
    .forEach(draft => {
      const responseId = String(draft && draft.responseId || '').trim();
      if (responseId) draftMap[responseId] = draft;
    });
  normalizeTeacherFeedbackReturnDraftItems_(opts.draftItems || opts.drafts || [], responseMap).forEach(draft => {
    draftMap[String(draft.responseId || '').trim()] = draft;
  });
  const responseIdSet = new Set((Array.isArray(responseIds) ? responseIds : []).map(value => String(value || '').trim()).filter(Boolean));
  const selected = responseIdSet.size
    ? Object.keys(draftMap).filter(responseId => responseIdSet.has(responseId)).map(responseId => draftMap[responseId])
    : Object.keys(draftMap).map(responseId => draftMap[responseId]);
  if (!selected.length) return { ok:false, error:'返却できる下書きがありません。' };
  return applyTeacherFeedbackDrafts_(lesson.lessonId, selected, {
    batchId: makeId_('teacherreturn'),
    source: opts.source ? String(opts.source) : 'teacher_manual_return',
    medalMode,
    skipEventLogs: opts.skipEventLogs === true,
    responseRecords: responses,
    period: normalizedPeriod,
  });
}

function normalizeTeacherFeedbackReturnDraftItems_(items, responseMap) {
  const list = Array.isArray(items) ? items : [];
  const drafts = [];
  list.forEach(item => {
    const responseId = String(item && item.responseId || '').trim();
    const response = responseId ? responseMap[responseId] : null;
    if (!response) return;
    const draftComment = String(item && item.draftComment || item && item.comment || '').trim();
    if (!draftComment) return;
    const draftRank = normalizeStudentRank_(item && (item.draftRank || item.rank));
    drafts.push({
      responseId: response.responseId || responseId,
      lessonId: response.lessonId || '',
      unitId: response.unitId || '',
      studentId: response.studentId || '',
      studentNumber: response.studentNumber || '',
      draftComment,
      draftRank,
      draftScore: draftRank ? studentRankToScore_(draftRank) : 0,
      status: 'draft',
      returnedAt: '',
    });
  });
  return drafts;
}

function clearTeacherFeedbackDrafts(unitId, period, responseIds) {
  const normalizedUnitId = String(unitId || '').trim();
  const normalizedPeriod = String(period || '').trim();
  if (!normalizedUnitId || !normalizedPeriod) return { ok:false, error:'単元と時間目を選択してください。' };
  const lesson = getOrCreateLesson_(normalizedUnitId, normalizedPeriod);
  const drafts = listTeacherCommentDrafts_(lesson.lessonId);
  const responseIdSet = new Set((Array.isArray(responseIds) ? responseIds : []).map(value => String(value || '').trim()).filter(Boolean));
  const selected = responseIdSet.size
    ? drafts.filter(draft => responseIdSet.has(String(draft.responseId || '').trim()))
    : drafts.filter(draft => String(draft.status || '') === 'draft');
  if (!selected.length) return { ok:true, clearedCount: 0 };
  const saved = upsertTeacherCommentDrafts_(selected.map(draft => ({
    responseId: draft.responseId,
    lessonId: draft.lessonId,
    unitId: draft.unitId,
    studentId: draft.studentId,
    studentNumber: draft.studentNumber,
    draftComment: '',
    draftRank: '',
    draftScore: 0,
    status: 'cleared',
    returnedAt: '',
  })), 'teacher');
  return { ok:true, clearedCount: saved.length };
}

function buildTeacherFeedbackDraftTargets_(unit, period, responses) {
  return (responses || []).map(response => {
    const lesson = getLessonRecordById_(response.lessonId);
    const lessonConfig = { fields: getLessonFields_(lesson, unit) };
    const reviewField = getReviewField_(lessonConfig);
    const understandingField = getUnderstandingField_(lessonConfig);
    const fields = getEnabledFields_(lessonConfig);
    const entries = buildLessonStatusEntries_(fields, response.answersMap || {}, response.reviewText || '', {
            reviewFieldKey: reviewField?.key || REVIEW_FIELD_KEY,
            understandingFieldKey: understandingField?.key || '',
          }).slice(0, 4);
    const evidenceLines = entries.length
      ? entries.map(entry => `${entry.label}: ${entry.value}`)
      : [String(response.reviewText || '').trim()];
    return {
      responseId: response.responseId || '',
      lessonId: response.lessonId || '',
      unitId: response.unitId || '',
      studentId: response.studentId || '',
      studentNumber: String(response.studentNumber || '').trim(),
      reviewText: String(response.reviewText || '').trim(),
      evidenceLines: evidenceLines.filter(Boolean),
    };
  }).filter(item => item.responseId && item.studentNumber && item.evidenceLines.length);
}

function canGenerateTeacherFeedbackForResponse_(response) {
  if (!response) return false;
  if (!String(response.responseId || '').trim()) return false;
  const reviewText = String(response.reviewText || '').trim();
  if (reviewText) return true;
  const answersMap = response.answersMap || {};
  return Object.keys(answersMap).some(key => String(answersMap[key] || '').trim());
}

function hasTeacherFeedbackResult_(response, draft) {
  if (String(response?.comment || '').trim()) return true;
  if (String(response?.rank || '').trim()) return true;
  if (!draft) return false;
  if (isTeacherFeedbackDraftStale_(response, draft)) return false;
  const status = String(draft.status || '').trim();
  const hasDraftBody = Boolean(String(draft.draftComment || '').trim() || String(draft.draftRank || '').trim());
  return hasDraftBody && (status === 'draft' || status === 'returned');
}

function normalizeTeacherFeedbackMedalMode_(value) {
  return String(value || '').trim() === 'auto_award' ? 'auto_award' : 'none';
}

function isTeacherFeedbackDraftStale_(response, draft) {
  const responseTs = Date.parse(response?.updatedAt || response?.submittedAt || '');
  const draftTs = Date.parse(draft?.updatedAt || draft?.returnedAt || '');
  if (!Number.isFinite(responseTs) || !Number.isFinite(draftTs)) return false;
  return responseTs > draftTs;
}

function buildTeacherFeedbackDraftPrompt_(unit, period, targets, includeRank) {
  const cfg = getGlobalConfigWithDefaults_();
  const studentBlock = (targets || []).map(item => {
    const evidence = item.evidenceLines.length ? item.evidenceLines.join('\n') : item.reviewText;
    return `- studentNumber: ${item.studentNumber}\n  evidence:\n${evidence.split('\n').map(line => `    ${line}`).join('\n')}`;
  }).join('\n');
  const outputRule = includeRank
    ? '- 各要素は {"studentNumber":"1","comment":"コメント","score":4} の形式'
    : '- 各要素は {"studentNumber":"1","comment":"コメント"} の形式';
  return `${cfg.prompt_comment || DEFAULT_PROMPT_COMMENT}

${DEFAULT_PROMPT_TEACHER_FEEDBACK}
${includeRank ? `${cfg.prompt_score || DEFAULT_PROMPT_SCORE}` : ''}

条件:
- 児童名は出さない
- 出力はJSON配列のみ
- ${outputRule.replace(/^- /,'')}
- comment は60文字以内
- comment は小学校3年生が読みやすいよう、できるだけひらがな中心で書く
- comment の漢字は教科名やごく基本的な語だけにして、むずかしい漢字は使わない
- comment は一文を短めにし、かな中心のやさしい先生ことばにする
- ${includeRank ? 'score は 0 から 7 の整数' : 'score は不要'}
- comment はやさしく具体的に、次の学びにつながる一言にする
- ${includeRank ? 'score は記録に根拠がある場合のみ高くする' : 'ランク付けはしない'}
- 今回の対象は ${period}時間目
- 対象単元: ${unit?.name || ''} / ${unit?.subject || ''}

対象:
${studentBlock}`;
}

function normalizeTeacherFeedbackDrafts_(parsed, chunk, includeRank) {
  const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : null);
  if (!list) throw new Error('AI一括フィードバックの応答形式が不正です');
  const chunkMap = {};
  (chunk || []).forEach(item => {
    chunkMap[String(item.studentNumber || '')] = item;
  });
  const deduped = {};
  list.forEach(item => {
    const studentNumber = String(item?.studentNumber || '').trim();
    const target = chunkMap[studentNumber];
    if (!target) return;
    const comment = String(item?.comment || '').trim();
    if (!comment) return;
    const score = Math.max(0, Math.min(7, Math.round(Number(item?.score || 0))));
    deduped[target.responseId] = {
      responseId: target.responseId,
      lessonId: target.lessonId,
      unitId: target.unitId,
      studentId: target.studentId,
      studentNumber: target.studentNumber,
      draftComment: comment,
      draftRank: includeRank ? (RANKS[score] || '') : '',
      draftScore: includeRank ? score : 0,
      status: 'draft',
      returnedAt: '',
    };
  });
  return Object.keys(deduped).map(key => deduped[key]);
}

function applyTeacherFeedbackDrafts_(lessonId, drafts, options) {
  const selectedDrafts = Array.isArray(drafts) ? drafts.filter(Boolean) : [];
  if (!selectedDrafts.length) return { ok:false, error:'返却する下書きがありません。' };
  const meta = options || {};
  const batchId = meta.batchId || makeId_('teacherreturn');
  const medalMode = normalizeTeacherFeedbackMedalMode_(meta.medalMode);
  const draftMap = {};
  selectedDrafts.forEach(draft => {
    draftMap[String(draft.responseId || '').trim()] = draft;
  });
  let returnedCount = 0;
  const returnedDrafts = [];
  let medalAwarded = false;
  const returnStartedAtMs = Date.now();
  let responseWriteMs = 0;
  let draftSaveMs = 0;
  let aggregateMs = 0;
  try {
    const period = meta.period || '';
    const updatedAt = nowIso_();
    const responses = Array.isArray(meta.responseRecords) ? meta.responseRecords : listResponsesForLesson_(lessonId);
    const updatedResponses = [];
    const pendingRowUpdates = [];
    if (!responses.length) return { ok:false, error:'提出データがありません。' };
    responses.forEach(response => {
      const responseId = String(response?.responseId || '').trim();
      const draft = draftMap[responseId];
      if (!draft || !String(draft.draftComment || '').trim()) {
        updatedResponses.push(response);
        return;
      }
      const nextComment = String(draft.draftComment || '').trim();
      const nextRank = String(draft.draftRank || '').trim();
      const nextScore = nextRank ? Number(draft.draftScore || 0) : Number(response?.score || 0);
      const hasResponseChange = (
        String(response?.comment || '').trim() !== nextComment ||
        String(response?.rank || '').trim() !== nextRank ||
        Number(response?.score || 0) !== nextScore ||
        String(response?.aiStatus || '').trim() !== 'done' ||
        String(response?.aiError || '').trim() !== ''
      );
      const next = hasResponseChange
        ? Object.assign({}, response, {
            comment: nextComment,
            score: nextScore,
            rank: nextRank,
            aiStatus: 'done',
            aiProcessedAt: updatedAt,
            aiError: '',
            updatedAt,
          })
        : Object.assign({}, response, {
            comment: nextComment,
            score: nextScore,
            rank: nextRank,
          });
      updatedResponses.push(next);
      if (hasResponseChange) {
        pendingRowUpdates.push({
          responseId,
          values: buildResponseSheetRowValues_(next),
        });
      }
      returnedCount++;
      returnedDrafts.push({
        responseId,
        lessonId: next.lessonId || '',
        unitId: next.unitId || '',
        studentId: next.studentId || '',
        studentNumber: next.studentNumber || '',
        studentName: next.studentName || '',
        reviewText: next.reviewText || '',
        comment: next.comment || '',
        rank: next.rank || '',
        period,
      });
    });
    if (!returnedCount) return { ok:false, error:'返却できる下書きがありません。' };
    if (meta.skipEventLogs !== true) {
      writeAiEventLogs_(buildTeacherFeedbackEvents_(selectedDrafts, 'teacher_feedback_return_started', {
        batchId,
        aiStatus: 'processing',
        detail: `source=${String(meta.source || 'teacher_return')}`,
        timestamp: nowIso_(),
      }));
    }

    const lock = LockService.getDocumentLock();
    const mirroredResponseIds = [];
    const responseWriteStartedAt = Date.now();
    if (!lock.tryLock(250)) {
      return {
        ok: false,
        code: 'busy',
        retriable: true,
        reason: 'busy',
        error: '返却が混み合っています。少し待ってからもう一度お試しください。',
      };
    }
    try {
      if (pendingRowUpdates.length) {
        const responseData = getResponseSheetData_();
        const rowNumberByResponseId = {};
        const rows = Array.isArray(responseData && responseData.rows) ? responseData.rows : [];
        for (let i = 0; i < rows.length; i++) {
          const responseId = String(rows[i] && rows[i][0] || '').trim();
          if (responseId) rowNumberByResponseId[responseId] = i + 2;
        }
        const rowUpdates = pendingRowUpdates
          .map(item => {
            const rowNumber = Number(rowNumberByResponseId[item.responseId] || 0);
            if (!rowNumber) return null;
            return {
              rowNumber,
              values: item.values,
            };
          })
          .filter(Boolean);
        if (rowUpdates.length) {
          writeResponseRowUpdates_(rowUpdates, null, null, null, {
            skipResponseCacheRefresh: true,
            invalidateResponseCaches: true,
          });
          rowUpdates.forEach(item => {
            const responseId = String(item && item.values && item.values[0] || '').trim();
            if (responseId) mirroredResponseIds.push(responseId);
          });
        }
      }
    } finally {
      lock.releaseLock();
    }
    responseWriteMs = Date.now() - responseWriteStartedAt;

    if (mirroredResponseIds.length) {
      enqueueTeacherResponseMirror_(
        mirroredResponseIds,
        'response_teacher_feedback_return',
        'master_mirror_failed_teacher_feedback_return',
        'teacher'
      );
    }

    if (medalMode === 'auto_award') {
      const medalStartedAt = Date.now();
      recalcLessonMedalsFromDb_(lessonId, {
        responses: updatedResponses,
      });
      aggregateMs = Date.now() - medalStartedAt;
      medalAwarded = true;
    }

    const returnedAt = nowIso_();
    if (meta.skipDraftPersist === true) {
      draftSaveMs = 0;
    } else {
      const draftSaveStartedAt = Date.now();
      upsertTeacherCommentDrafts_(returnedDrafts.map(item => ({
        responseId: item.responseId,
        lessonId: item.lessonId,
        unitId: item.unitId,
        studentId: item.studentId,
        studentNumber: item.studentNumber,
        draftComment: item.comment,
        draftRank: item.rank,
        draftScore: studentRankToScore_(item.rank),
        status: 'returned',
        returnedAt,
      })), 'teacher-return');
      draftSaveMs = Date.now() - draftSaveStartedAt;
    }
    if (meta.skipEventLogs !== true) {
      writeAiEventLogs_(buildTeacherFeedbackEvents_(returnedDrafts, 'teacher_feedback_returned', {
        batchId,
        aiStatus: 'done',
        detail: `source=${String(meta.source || 'teacher_return')} responseWriteMs=${responseWriteMs} draftSaveMs=${draftSaveMs} aggregateMs=${aggregateMs}`,
        timestamp: returnedAt,
        latencyMs: Date.now() - returnStartedAtMs,
      }));
    }
    return {
      ok: true,
      returnedCount,
      medalAwarded,
      returnedIds: returnedDrafts.map(item => item.responseId).filter(Boolean),
    };
  } catch (err) {
    if (meta.skipEventLogs !== true) {
      writeAiEventLogs_(buildTeacherFeedbackEvents_(selectedDrafts, 'teacher_feedback_return_failed', {
        batchId,
        aiStatus: 'error',
        detail: `source=${String(meta.source || 'teacher_return')} responseWriteMs=${responseWriteMs} draftSaveMs=${draftSaveMs} aggregateMs=${aggregateMs} error=${String(err && err.message ? err.message : err).slice(0, 180)}`,
        timestamp: nowIso_(),
        latencyMs: Date.now() - returnStartedAtMs,
      }));
    }
    throw err;
  }
}

function normalizeStudentRank_(value) {
  const text = String(value || '').trim().toUpperCase();
  return RANKS.includes(text) ? text : '';
}

function studentRankToScore_(rank) {
  const normalized = normalizeStudentRank_(rank);
  if (!normalized) return 0;
  const index = RANKS.indexOf(normalized);
  return index >= 0 ? index : 0;
}

function normalizeTeacherMedal_(value) {
  const text = String(value || '').trim();
  return MEDALS.includes(text) ? text : '';
}

function normalizeAggregateFilterOptions_(options) {
  if (!options || typeof options !== 'object') return { subject: '' };
  return {
    subject: String(options.subject || '').trim(),
  };
}

function getAggregateDataJsonCacheKey_(unitId, filters, useCompact) {
  return [
    'aggregate_json_v1',
    readDomainCacheVersion_('responses'),
    readDomainCacheVersion_('lessons'),
    readDomainCacheVersion_('units'),
    readDomainCacheVersion_('assessments'),
    String(unitId || '').trim() || 'all',
    String(filters && filters.subject || '').trim() || 'all',
    useCompact ? 'compact' : 'full',
  ].join(':');
}

function readCachedAggregateDataJson_(unitId, filters, useCompact) {
  try {
    return getDomainCache_().get(getAggregateDataJsonCacheKey_(unitId, filters, useCompact)) || '';
  } catch (_err) {
    return '';
  }
}

function writeCachedAggregateDataJson_(unitId, filters, useCompact, payload) {
  try {
    getDomainCache_().put(getAggregateDataJsonCacheKey_(unitId, filters, useCompact), String(payload || ''), 20);
  } catch (_err) {}
  return payload;
}

function logTeacherPerf_(name, payload) {
  try {
    console.log('[teacher_perf] ' + JSON.stringify({
      name: String(name || ''),
      ...(payload && typeof payload === 'object' ? payload : {}),
    }));
  } catch (_err) {}
}

function getAggregateResponseDedupKey_(response, lessonMap) {
  const responseId = String(response && response.responseId || '').trim();
  if (responseId) return `response:${responseId}`;
  const lessonId = String(response && response.lessonId || '').trim();
  const studentNumber = String(response && response.studentNumber || '').trim();
  if (lessonId && studentNumber) return `lesson:${lessonId}:student:${studentNumber}`;
  const unitId = String(response && response.unitId || '').trim();
  const lesson = lessonId ? lessonMap[lessonId] : null;
  const period = String(response && response.period || lesson && lesson.period || '').trim();
  if (unitId && period && studentNumber) return `unit:${unitId}:period:${period}:student:${studentNumber}`;
  return '';
}

function getAggregateResponseDedupTime_(response) {
  const keys = ['updatedAt', 'submittedAt', 'createdAt', 'timestamp'];
  for (let idx = 0; idx < keys.length; idx++) {
    const value = String(response && response[keys[idx]] || '').trim();
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return NaN;
}

function getAggregateResponseContentSize_(response) {
  const answersJson = String(response && response.answersJson || '');
  const answersMap = response && typeof response.answersMap === 'object' ? response.answersMap : {};
  return [
    answersJson,
    JSON.stringify(answersMap),
    String(response && response.reviewText || ''),
    String(response && response.comment || ''),
    String(response && response.rank || ''),
    String(response && response.studentName || ''),
  ].join('').length;
}

function preferAggregateResponseCandidate_(candidate, current) {
  const candidateTime = getAggregateResponseDedupTime_(candidate);
  const currentTime = getAggregateResponseDedupTime_(current);
  const candidateHasTime = !Number.isNaN(candidateTime);
  const currentHasTime = !Number.isNaN(currentTime);
  if (candidateHasTime && currentHasTime && candidateTime !== currentTime) return candidateTime > currentTime;
  if (candidateHasTime !== currentHasTime) return candidateHasTime;
  return getAggregateResponseContentSize_(candidate) > getAggregateResponseContentSize_(current);
}

function dedupeAggregateResponses_(responses, lessonMap) {
  const list = Array.isArray(responses) ? responses : [];
  const deduped = [];
  const indexByKey = {};
  list.forEach(response => {
    const key = getAggregateResponseDedupKey_(response, lessonMap || {});
    if (!key) {
      deduped.push(response);
      return;
    }
    const existingIndex = indexByKey[key];
    if (existingIndex === undefined) {
      indexByKey[key] = deduped.length;
      deduped.push(response);
      return;
    }
    if (preferAggregateResponseCandidate_(response, deduped[existingIndex])) {
      deduped[existingIndex] = response;
    }
  });
  return deduped;
}

function readTeacherRecordSource_(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const filterUnitId = String(opts.unitId || '').trim();
  const filterSubject = String(opts.subject || '').trim();
  const filterStudentNumber = String(opts.studentNumber || '').trim();
  const timing = {};
  const counts = {};
  const startedAt = Date.now();

  let t0 = Date.now();
  const units = getAllUnits();
  timing.unitsMs = Date.now() - t0;
  counts.unitCount = units.length;
  const unitMap = {};
  units.forEach(item => {
    unitMap[String(item.id || '')] = item;
  });

  t0 = Date.now();
  const lessons = listLessonRecords_();
  timing.lessonsMs = Date.now() - t0;
  counts.lessonCount = lessons.length;
  const lessonMap = {};
  lessons.forEach(item => {
    lessonMap[String(item.lessonId || '')] = item;
  });

  t0 = Date.now();
  let allResponses = [];
  if (filterUnitId || filterSubject) {
    const targetLessons = lessons.filter(lesson => {
      const unitId = String(lesson.unitId || '');
      if (filterUnitId && unitId !== filterUnitId) return false;
      if (filterSubject) {
        const unit = unitMap[unitId];
        if (String(unit && unit.subject || '') !== filterSubject) return false;
      }
      return true;
    });
    if (filterStudentNumber) {
      const targetLessonIds = targetLessons.map(lesson => String(lesson.lessonId || '').trim()).filter(Boolean);
      allResponses = listResponsesForStudent_(filterStudentNumber, targetLessonIds);
    } else {
      targetLessons.forEach(lesson => {
        const lessonId = String(lesson.lessonId || '').trim();
        if (!lessonId) return;
        allResponses = allResponses.concat(listResponsesForLesson_(lessonId));
      });
    }
    counts.scopedLessonCount = targetLessons.length;
  } else if (filterStudentNumber) {
    allResponses = listResponsesForStudent_(filterStudentNumber);
  } else {
    allResponses = listAllResponses_();
  }
  allResponses = dedupeAggregateResponses_(allResponses, lessonMap);
  timing.responsesMs = Date.now() - t0;
  counts.rawResponseCount = allResponses.length;
  counts.studentScoped = filterStudentNumber ? 1 : 0;

  t0 = Date.now();
  const responseReadMeta = summarizeResponseReadForAll_(allResponses);
  const responses = allResponses.filter(response => !isAiLoadTestResponse_(response));
  timing.responseTransformMs = Date.now() - t0;
  counts.responseCount = responses.length;

  let roster = null;
  if (opts.includeRoster) {
    t0 = Date.now();
    roster = getRosterEntries_(true);
    timing.rosterMs = Date.now() - t0;
    counts.rosterCount = Array.isArray(roster) ? roster.length : 0;
  }

  let assessments = null;
  if (opts.includeAssessments) {
    t0 = Date.now();
    assessments = listTeacherAssessments_();
    timing.assessmentsMs = Date.now() - t0;
    counts.assessmentCount = Array.isArray(assessments) ? assessments.length : 0;
  }

  timing.totalReadMs = Date.now() - startedAt;
  return {
    units,
    unitMap,
    lessons,
    lessonMap,
    responses,
    responseReadMeta,
    roster,
    assessments,
    timing,
    counts,
  };
}
function getAggregateData(unitId, options) {
  const startedAt = Date.now();
  const filters = normalizeAggregateFilterOptions_(options);
  const source = readTeacherRecordSource_({
    includeAssessments: true,
    unitId,
    subject: filters.subject,
  });
  const assessmentMap = {};
  (source.assessments || []).forEach(item => {
    assessmentMap[`${String(item.unitId || '')}:${String(item.studentNumber || '')}`] = item;
  });
  const mapStartedAt = Date.now();
  const rows = source.responses
    .filter(response => {
      if (unitId && String(response.unitId) !== String(unitId)) return false;
      if (filters.subject) {
        const unit = source.unitMap[String(response.unitId || '')];
        if (String(unit?.subject || '') !== filters.subject) return false;
      }
      return true;
    })
    .map(response => {
      const unit = source.unitMap[String(response.unitId || '')];
      const lesson = source.lessonMap[String(response.lessonId || '')] || null;
      const fields = getLessonFields_(lesson, unit);
      const assessment = assessmentMap[`${String(response.unitId || '')}:${String(response.studentNumber || '')}`] || null;
      return {
        unitName: unit?.name || '',
        subject: unit?.subject || '',
        period: lesson?.period || '',
        num: response.studentNumber,
        name: response.studentName,
        date: lesson?.lessonDate || '',
        review: response.reviewText || '',
        rank: response.rank || '',
        comment: response.comment || '',
        unitId: response.unitId || '',
        answersMap: response.answersMap || {},
        fields,
        teacherAssessment: assessment,
      };
    });
  const performanceMeta = {
    timing: {
      ...source.timing,
      aggregateMs: Date.now() - mapStartedAt,
      totalMs: Date.now() - startedAt,
    },
    counts: {
      ...source.counts,
      resultCount: rows.length,
    },
  };
  rows.responseReadMeta = source.responseReadMeta;
  rows.performanceMeta = performanceMeta;
  logTeacherPerf_('getAggregateData', {
    unitFilter: String(unitId || ''),
    subjectFilter: filters.subject,
    ...performanceMeta.timing,
    ...performanceMeta.counts,
  });
  return rows;
}

function getCompactAggregateRowSchema_() {
  return [
    'unitName',
    'subject',
    'period',
    'num',
    'name',
    'date',
    'review',
    'rank',
    'comment',
    'unitId',
    'answersMap',
    'fieldSetKey',
    'teacherAssessment',
  ];
}

function normalizeAggregateFieldForPayload_(field) {
  if (!field || typeof field !== 'object') return null;
  const next = {
    key: String(field.key || ''),
    label: String(field.label || field.key || ''),
    emoji: String(field.emoji || ''),
    type: String(field.type || 'text'),
    categories: Array.isArray(field.categories) ? field.categories.filter(Boolean) : [],
    source: field.source || '',
  };
  const hints = String(field.hints || '').trim();
  if (hints) next.hints = hints;
  if (field.enabled === false) next.enabled = false;
  return next.key ? next : null;
}

function normalizeAggregateFieldsForPayload_(fields) {
  return (Array.isArray(fields) ? fields : [])
    .map(normalizeAggregateFieldForPayload_)
    .filter(Boolean);
}

function compactAggregateAnswersMap_(answersMap) {
  const source = answersMap && typeof answersMap === 'object' ? answersMap : {};
  const compact = {};
  Object.keys(source).forEach(key => {
    const value = source[key];
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      const list = value.map(item => String(item || '').trim()).filter(Boolean);
      if (list.length) compact[key] = list;
      return;
    }
    const text = String(value).trim();
    if (text) compact[key] = value;
  });
  return compact;
}

function buildCompactAggregatePayload_(rows) {
  const schema = getCompactAggregateRowSchema_();
  const fieldSetIndex = {};
  const fieldSets = {};
  let fieldSetSeq = 0;
  const compactRows = (Array.isArray(rows) ? rows : []).map(row => {
    const fields = normalizeAggregateFieldsForPayload_(row && row.fields);
    const fieldSignature = JSON.stringify(fields);
    let fieldSetKey = fieldSetIndex[fieldSignature];
    if (!fieldSetKey) {
      fieldSetKey = `f${fieldSetSeq++}`;
      fieldSetIndex[fieldSignature] = fieldSetKey;
      fieldSets[fieldSetKey] = fields;
    }
    return [
      row.unitName || '',
      row.subject || '',
      row.period || '',
      row.num || '',
      row.name || '',
      row.date || '',
      row.review || '',
      row.rank || '',
      row.comment || '',
      row.unitId || '',
      compactAggregateAnswersMap_(row.answersMap),
      fieldSetKey,
      row.teacherAssessment || null,
    ];
  });
  return {
    compactVersion: 1,
    rowSchema: schema,
    fieldSets,
    rowsCompact: compactRows,
  };
}

function getAggregateDataJson(unitId, optionsJson) {
  const startedAt = Date.now();
  try {
    let options = null;
    if (optionsJson && String(optionsJson).trim()) {
      options = JSON.parse(String(optionsJson));
    }
    const filters = normalizeAggregateFilterOptions_(options);
    const useCompact = options && options.compact === true;
    const cachedPayload = readCachedAggregateDataJson_(unitId, filters, useCompact);
    if (cachedPayload) {
      logTeacherPerf_('getAggregateDataJson', {
        unitFilter: String(unitId || ''),
        subjectFilter: filters.subject,
        compact: useCompact,
        cacheHit: true,
        totalMs: Date.now() - startedAt,
      });
      return cachedPayload;
    }
    const dataStartedAt = Date.now();
    const rows = getAggregateData(unitId, options);
    const dataMs = Date.now() - dataStartedAt;
    const jsonStartedAt = Date.now();
    const basePayload = {
      ok: true,
      build: APP_BUILD,
      debug: {
        unitId: String(unitId || ''),
        subject: filters.subject,
        rowCount: rows.length,
        compact: useCompact,
        responseReadMeta: rows.responseReadMeta || null,
        performanceMeta: rows.performanceMeta || null,
        sampleRows: rows.slice(0, 5).map(row => ({
          subject: row.subject || '',
          unitName: row.unitName || '',
          period: row.period || '',
          num: row.num || '',
          date: row.date || '',
          preview: String(row.review || '').slice(0, 40),
          })),
        },
    };
    const payload = JSON.stringify(useCompact
      ? Object.assign(basePayload, buildCompactAggregatePayload_(rows))
      : Object.assign(basePayload, { rows }));
    logTeacherPerf_('getAggregateDataJson', {
      unitFilter: String(unitId || ''),
      subjectFilter: filters.subject,
      compact: useCompact,
      dataMs,
      jsonMs: Date.now() - jsonStartedAt,
      totalMs: Date.now() - startedAt,
      resultCount: rows.length,
    });
    return writeCachedAggregateDataJson_(unitId, filters, useCompact, payload);
  } catch (e) {
    return JSON.stringify({
      ok: false,
      build: APP_BUILD,
      error: String(e),
    });
  }
}
function exportAggregateCsv(unitId, period) {
  const rows = getAggregateData(unitId).filter(row => {
    if (period && String(row.period) !== String(period)) return false;
    return true;
  });
  const unit = getAllUnits().find(item => String(item.id) === String(unitId));
  const header = ['単元','教科','時間','番号','名前','日付','ふりかえり','ランク','コメント'];
  const body = rows.map(row => [
    row.unitName || '',
    row.subject || '',
    row.period || '',
    row.num || '',
    row.name || '',
    row.date || '',
    row.review || '',
    row.rank || '',
    row.comment || '',
  ]);
  const csv = [header].concat(body).map(toCsvLine_).join('\r\n');
  const filenameParts = [
    'jibun-matome',
    sanitizeFileNamePart_(unit?.subject || 'all'),
    sanitizeFileNamePart_(unit?.name || 'all-units'),
    period ? `${period}jikanme` : 'all-periods',
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss'),
  ];
  writeAuditLog_({
    targetType: 'aggregateCsv',
    targetId: String(unitId || 'all'),
    action: 'export',
    before: null,
    after: { period: period || '', rowCount: rows.length },
    actor: 'teacher',
  });
  return {
    filename: filenameParts.join('_') + '.csv',
    csv,
    rowCount: rows.length,
  };
}

function getStudentPortfolioData(studentNumber, unitId) {
  const cacheKey = `student_portfolio_v2_${String(studentNumber || '').trim()}_${String(unitId || '').trim() || 'all'}`;
  const cached = getCachedJson_(cacheKey);
  if (cached && Array.isArray(cached.rows)) return cached;
  const startedAt = Date.now();
  const source = readTeacherRecordSource_({
    includeRoster: true,
    studentNumber,
    unitId,
  });
  const selectedUnit = source.units.find(item => String(item.id) === String(unitId));
  const roster = Array.isArray(source.roster) ? source.roster : [];
  const student = roster.find(item => String(item.number) === String(studentNumber));
  const rosterNameMap = {};
  roster.forEach(item => {
    const normalizedNumber = String(item && item.number || '').trim();
    if (!normalizedNumber) return;
    rosterNameMap[normalizedNumber] = String(item && item.name || '').trim();
  });
  const studentIdSet = {};
  const studentNameSet = {};
  if (student?.studentId) studentIdSet[String(student.studentId)] = true;
  if (student?.name) studentNameSet[String(student.name)] = true;
  const debug = {
    selectedStudentNumber: String(studentNumber || ''),
    selectedStudentId: student?.studentId || '',
    selectedStudentName: student?.name || '',
    selectedUnitId: String(unitId || ''),
    responseCount: source.responses.length,
    matchedStudentCount: 0,
    matchedUnitCount: 0,
    sampleMatchedRows: [],
  };
  const matchStartedAt = Date.now();
  let matchedStudentRows = source.responses.filter(row => {
    if (String(row.studentNumber) === String(studentNumber)) return true;
    if (row.studentId && studentIdSet[String(row.studentId)]) return true;
    if (row.studentName && studentNameSet[String(row.studentName)]) return true;
    return false;
  });
  if (!matchedStudentRows.length && (Object.keys(studentIdSet).length || Object.keys(studentNameSet).length)) {
    // 古いデータで出席番号が欠けている場合だけ、従来の全件探索へ戻す。
    const fallbackSource = readTeacherRecordSource_({ includeRoster: false, unitId });
    source.responses = fallbackSource.responses;
    source.responseReadMeta = fallbackSource.responseReadMeta;
    source.timing = Object.assign({}, source.timing, {
      fallbackResponsesMs: fallbackSource.timing && fallbackSource.timing.responsesMs || 0,
      fallbackTotalReadMs: fallbackSource.timing && fallbackSource.timing.totalReadMs || 0,
    });
    source.counts = Object.assign({}, source.counts, {
      fallbackRawResponseCount: fallbackSource.counts && fallbackSource.counts.rawResponseCount || 0,
    });
    matchedStudentRows = source.responses.filter(row => {
      if (String(row.studentNumber) === String(studentNumber)) return true;
      if (row.studentId && studentIdSet[String(row.studentId)]) return true;
      if (row.studentName && studentNameSet[String(row.studentName)]) return true;
      return false;
    });
  }
  debug.matchedStudentCount = matchedStudentRows.length;
  const rows = matchedStudentRows
    .filter(row => {
      const effectiveUnitId = String(row.unitId || source.lessonMap[String(row.lessonId || '')]?.unitId || '').trim();
      if (!unitId) return true;
      if (effectiveUnitId === String(unitId)) return true;
      const rowUnit = source.unitMap[effectiveUnitId];
      if (!selectedUnit || !rowUnit) return false;
      return String(rowUnit.name || '') === String(selectedUnit.name || '')
        && String(rowUnit.subject || '') === String(selectedUnit.subject || '');
    })
    .map(row => {
      const lesson = source.lessonMap[String(row.lessonId || '')] || null;
      const effectiveUnitId = String(row.unitId || lesson?.unitId || '').trim();
      const unit = source.unitMap[effectiveUnitId];
      return {
        unitName: unit?.name || '',
        subject: unit?.subject || '',
        period: lesson?.period || '',
        num: row.studentNumber,
        name: row.studentName || rosterNameMap[String(row.studentNumber || '').trim()] || '',
        date: lesson?.lessonDate || '',
        review: row.reviewText || '',
        score: Number(row.score || 0),
        rank: row.rank || '',
        medal: row.medal || '',
        comment: row.comment || '',
        unitId: effectiveUnitId,
        answersMap: row.answersMap || {},
        fields: getLessonFields_(lesson, unit),
      };
    });
  const portfolioMs = Date.now() - matchStartedAt;
  debug.matchedUnitCount = rows.length;
  debug.sampleMatchedRows = rows.slice(0, 5).map(row => ({
    subject: row.subject || '',
    unitName: row.unitName || '',
    period: row.period || '',
    date: row.date || '',
    preview: String(row.review || '').slice(0, 40),
  }));
  rows.sort((a, b) => {
    const subjectCmp = String(a.subject || '').localeCompare(String(b.subject || ''));
    if (subjectCmp !== 0) return subjectCmp;
    const unitCmp = String(a.unitName || '').localeCompare(String(b.unitName || ''));
    if (unitCmp !== 0) return unitCmp;
    return Number(a.period || 0) - Number(b.period || 0);
  });
  const result = putCachedJson_(cacheKey, {
    studentNumber,
    studentName: student?.name || rosterNameMap[String(studentNumber || '').trim()] || '',
    rows,
    build: APP_BUILD,
    responseReadMeta: source.responseReadMeta,
    performanceMeta: {
      timing: {
        ...source.timing,
        portfolioMs,
        totalMs: Date.now() - startedAt,
      },
      counts: {
        ...source.counts,
        resultCount: rows.length,
      },
    },
    debug,
  }, 20);
  logTeacherPerf_('getStudentPortfolioData', {
    studentNumber: String(studentNumber || ''),
    unitFilter: String(unitId || ''),
    ...result.performanceMeta.timing,
    ...result.performanceMeta.counts,
    matchedStudentCount: debug.matchedStudentCount,
    matchedUnitCount: debug.matchedUnitCount,
  });
  return result;
}
function getStudentPortfolioDataJson(studentNumber, unitId) {
  const startedAt = Date.now();
  try {
    const dataStartedAt = Date.now();
    const result = getStudentPortfolioData(studentNumber, unitId);
    const dataMs = Date.now() - dataStartedAt;
    const jsonStartedAt = Date.now();
    const payload = JSON.stringify(result);
    logTeacherPerf_('getStudentPortfolioDataJson', {
      studentNumber: String(studentNumber || ''),
      unitFilter: String(unitId || ''),
      dataMs,
      jsonMs: Date.now() - jsonStartedAt,
      totalMs: Date.now() - startedAt,
      resultCount: Array.isArray(result && result.rows) ? result.rows.length : 0,
    });
    return payload;
  } catch (e) {
    return JSON.stringify({
      ok: false,
      build: APP_BUILD,
      error: String(e),
    });
  }
}
function getAiLogSnapshot(scope, limit, unitId, period) {
  const normalizedScope = String(scope || 'current');
  const rowLimit = Math.max(20, Math.min(300, Number(limit || 60) || 60));
  const lessonMap = buildTeacherLessonMetaMap_();
  const active = getActiveSetting();
  const targetUnitId = String(unitId || active?.unitId || '');
  const targetPeriod = Number(period || active?.period || 0);
  let targetLessonId = '';
  if (normalizedScope === 'current' && targetUnitId && targetPeriod > 0) {
    targetLessonId = findLessonIdByUnitAndPeriod_(targetUnitId, targetPeriod, lessonMap);
  }

  const sheet = getAiEventLogDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, AI_EVENT_HEADERS.length).getValues()
    : [];
  const filtered = rows.filter(row => {
    if (normalizedScope !== 'current') return true;
    if (!targetLessonId) return false;
    return String(row[2] || '') === String(targetLessonId);
  });
  const selected = filtered.slice(Math.max(0, filtered.length - rowLimit));
  const text = selected.map(row => formatAiLogRow_(row, lessonMap)).join('\n');
  const scopeLabel = normalizedScope === 'current'
    ? (targetLessonId
        ? `この授業 ${targetUnitId}/${targetPeriod}時間目`
        : 'この授業のログはまだありません')
    : '全体ログ';
  return {
    build: APP_BUILD,
    scopeLabel,
    rowCount: selected.length,
    text: text || 'ログがありません。',
  };
}

function buildTeacherLessonMetaMap_() {
  const sheet = getLessonsDbSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, LESSON_HEADERS.length).getValues()
    : [];
  const map = {};
  rows.forEach(row => {
    map[String(row[0] || '')] = {
      lessonId: row[0] || '',
      unitId: row[1] || '',
      period: Number(row[2] || 0),
      lessonDate: row[3] || '',
    };
  });
  return map;
}

function findLessonIdByUnitAndPeriod_(unitId, period, lessonMap) {
  const targetUnitId = String(unitId || '');
  const targetPeriod = Number(period || 0);
  const keys = Object.keys(lessonMap || {});
  for (let i = 0; i < keys.length; i++) {
    const lesson = lessonMap[keys[i]];
    if (String(lesson?.unitId || '') === targetUnitId && Number(lesson?.period || 0) === targetPeriod) {
      return String(lesson.lessonId || '');
    }
  }
  return '';
}

function formatAiLogRow_(row, lessonMap) {
  const lesson = lessonMap[String(row[2] || '')] || {};
  const parts = [
    String(row[11] || ''),
    String(row[8] || ''),
  ];
  if (lesson?.period) parts.push(`${lesson.period}時間目`);
  if (row[5] || row[6]) parts.push(`${row[5] || ''} ${row[6] || ''}`.trim());
  if (row[9]) parts.push(`status=${row[9]}`);
  if (Number(row[14] || 0) > 0) parts.push(`retry=${Number(row[14] || 0)}`);
  if (Number(row[12] || 0) > 0) parts.push(`latency=${Number(row[12] || 0)}ms`);
  if (Number(row[13] || 0) > 0) parts.push(`api=${Number(row[13] || 0)}ms`);
  const detail = String(row[10] || '').trim();
  return detail ? `${parts.join(' | ')} | ${detail}` : parts.join(' | ');
}

function callGeminiText_(apiKey, prompt) {
  const res = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      muteHttpExceptions: true,
    }
  );
  const status = res.getResponseCode();
  const body = res.getContentText() || '';

  if (status < 200 || status >= 300) {
    throw new Error(`AI API error ${status}: ${body.slice(0, 500)}`);
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch (e) {
    throw new Error(`AI response parse error: ${String(e)} / body=${body.slice(0, 300)}`);
  }

  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = json?.candidates?.[0]?.finishReason || '';
    const promptFeedback = json?.promptFeedback ? JSON.stringify(json.promptFeedback).slice(0, 300) : '';
    throw new Error(`AI response text is empty${finishReason ? ` / finishReason=${finishReason}` : ''}${promptFeedback ? ` / promptFeedback=${promptFeedback}` : ''}`);
  }

  return text.trim();
}

function buildStudentNumberNameMap_(items) {
  const map = {};
  (items || []).forEach(item => {
    const studentNumber = String(item?.studentNumber || item?.num || item?.number || '').trim();
    const studentName = String(item?.studentName || item?.name || '').trim();
    if (!studentNumber || !studentName) return;
    map[studentNumber] = studentName;
  });
  getRosterEntries_().forEach(item => {
    const studentNumber = String(item?.number || '').trim();
    const studentName = String(item?.name || '').trim();
    if (!studentNumber || !studentName || map[studentNumber]) return;
    map[studentNumber] = studentName;
  });
  return map;
}

function buildAiSafePortfolioRecords_(rows) {
  return (rows || []).map(row => ({
    subject: String(row?.subject || ''),
    unitName: String(row?.unitName || ''),
    period: String(row?.period || ''),
    rank: String(row?.rank || ''),
    review: String(row?.review || ''),
  }));
}

function buildAiSafeAggregateRecords_(rows) {
  return (rows || []).map(row => ({
    studentNumber: String(row?.num || row?.studentNumber || '').trim(),
    period: String(row?.period || ''),
    rank: String(row?.rank || ''),
    review: String(row?.review || ''),
  }));
}

function cleanAiDisplayText_(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*[-*][ \t]+/gm, '・')
    .replace(/^[ \t]*\*\*[ \t]*/gm, '')
    .replace(/[ \t]*\*\*[ \t]*$/gm, '')
    .replace(/^\*[ \t]+/gm, '・')
    .replace(/[ \t]*\*+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function replaceStudentNumberToken_(text, studentNumber, replacement) {
  const escaped = studentNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let output = String(text || '');
  const rules = [
    [new RegExp(`studentNumber\\s*[:：]\\s*"?${escaped}"?`, 'g'), replacement],
    [new RegExp(`出席番号\\s*[:：]?\\s*${escaped}`, 'g'), replacement],
    [new RegExp(`#${escaped}(?!\\d)`, 'g'), replacement],
    [new RegExp(`No\\.?\\s*${escaped}(?!\\d)`, 'gi'), replacement],
    [new RegExp(`児童\\s*${escaped}(?!\\d)`, 'g'), replacement],
    [new RegExp(`番号\\s*${escaped}(?!\\d)`, 'g'), replacement],
    [new RegExp(`${escaped}番`, 'g'), replacement],
  ];
  rules.forEach(([pattern, next]) => {
    output = output.replace(pattern, next);
  });
  return output;
}

function localizeStudentNumbersForDisplay_(text, items) {
  let output = cleanAiDisplayText_(text);
  const map = buildStudentNumberNameMap_(items);
  Object.keys(map)
    .sort((a, b) => b.length - a.length)
    .forEach(studentNumber => {
      const studentName = map[studentNumber];
      output = replaceStudentNumberToken_(output, studentNumber, `${studentName}さん`);
    });
  return output;
}

function generateStudentPortfolioSummary(studentNumber, unitId) {
  if (!isTeacherAiEnabled_()) return { ok:false, error:'この先生では先生向けAI機能は無効です。' };
  const portfolio = getStudentPortfolioData(studentNumber, unitId);
  if (!portfolio.rows.length) return { ok:false, error:'データがありません' };
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok:false, error:'APIキーが未設定です' };

  const aiSafeRows = buildAiSafePortfolioRecords_(portfolio.rows);
  const reviews = aiSafeRows.map(row =>
    `・${row.subject}/${row.unitName}/${row.period}時間目/${row.rank}: ${row.review}`
  ).join('\n');
  const cfg = getGlobalConfigWithDefaults_();
  const prompt = `${cfg.prompt_portfolio || DEFAULT_PROMPT_PORTFOLIO}

対象児童:
- studentNumber: ${studentNumber}

出席番号に触れるときは、見出し番号の「1.」「1:」とは混同しないよう、必ず「${studentNumber}番」のように「番」を付けて書いてください。

記録:
${reviews}`;

  try {
    const text = callGeminiText_(apiKey, prompt);
    return {
      ok:true,
      studentName: portfolio.studentName || `${studentNumber}番`,
      summary: localizeStudentNumbersForDisplay_(text, [{
        studentNumber,
        studentName: portfolio.studentName || '',
      }]),
    };
  } catch (e) {
    return { ok:false, error:e.toString() };
  }
}

function toCsvLine_(values) {
  return (values || []).map(toCsvCell_).join(',');
}

function toCsvCell_(value) {
  const text = String(value == null ? '' : value);
  return `"${text.replace(/"/g, '""')}"`;
}

function sanitizeFileNamePart_(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'data';
}

function generateUnitSummary(unitId, period) {
  if (!isTeacherAiEnabled_()) return { ok:false, error:'この先生では先生向けAI機能は無効です。' };
  const normalizedPeriod = String(period || '').trim();
  const units = getAllUnits();
  const unit  = units.find(u=>u.id==unitId);
  if (!unit) return { ok:false, error:'単元が見つかりません' };
  const all = getAggregateData(unitId).filter(row => !normalizedPeriod || String(row.period || '') === normalizedPeriod);
  if (!all.length) return { ok:false, error:'データがありません' };
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok:false, error:'APIキーが未設定です' };

  const aiSafeRows = buildAiSafeAggregateRecords_(all);
  const cfg = getGlobalConfigWithDefaults_();
  const reviews = aiSafeRows.map(r=>`・${r.studentNumber}番(${r.period}時間目/${r.rank}): ${r.review}`).join('\n');
  const prompt  = `${cfg.prompt_unit_summary || DEFAULT_PROMPT_UNIT_SUMMARY}

対象単元:
- 単元名: ${unit.name}
- 教科: ${unit.subject}
- 対象時間: ${normalizedPeriod ? `${normalizedPeriod}時間目` : '単元全体'}

児童番号に言及するときは、見出し番号の「1.」「1:」と区別できるよう、必ず「1番」の形式で書いてください。見出しや章番号には児童番号だけの裸の数字を使わないでください。

ふりかえり一覧:
${reviews}`;

  try {
    const text = callGeminiText_(apiKey, prompt);
    return {
      ok:true,
      summary: localizeStudentNumbersForDisplay_(text, all.map(row => ({
        studentNumber: row.num || '',
        studentName: row.name || '',
      }))),
      unitName:unit.name,
    };
  } catch(e) { return { ok:false, error:e.toString() }; }
}

function generateTeacherAssessmentDrafts(unitId, category, period, onlyEmpty) {
  if (!isTeacherAiEnabled_()) return { ok:false, error:'この先生では先生向けAI機能は無効です。' };
  const normalizedUnitId = String(unitId || '').trim();
  const normalizedCategory = String(category || '').trim();
  const normalizedPeriod = String(period || '').trim();
  const emptyOnly = onlyEmpty !== false;
  if (!normalizedUnitId) return { ok:false, error:'単元を選択してください' };
  if (!['knowledge','thinking','attitude'].includes(normalizedCategory)) {
    return { ok:false, error:'観点が不正です' };
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok:false, error:'APIキーが未設定です' };

  const units = getAllUnits();
  const unit = units.find(item => String(item.id) === normalizedUnitId);
  if (!unit) return { ok:false, error:'単元が見つかりません' };

  const filteredRows = getAggregateData(normalizedUnitId).filter(row => {
    if (normalizedPeriod && String(row.period || '') !== normalizedPeriod) return false;
    return true;
  });
  if (!filteredRows.length) return { ok:false, error:'対象データがありません' };

  const grouped = buildTeacherAssessmentDraftTargets_(filteredRows, normalizedCategory);
  const targets = grouped.filter(item => !emptyOnly || !String(item.currentValue || '').trim());
  if (!targets.length) {
    return {
      ok: true,
      unitName: unit.name || '',
      category: normalizedCategory,
      targetCount: 0,
      updatedCount: 0,
      skippedCount: grouped.length,
      drafts: [],
    };
  }

  const chunkSize = 8;
  const drafts = [];
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    const prompt = buildTeacherAssessmentDraftPrompt_(unit, normalizedCategory, chunk, normalizedPeriod);
    const parsed = fetchGeminiJsonWithRetry_(apiKey, prompt);
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : null);
    if (!list) throw new Error('AI仮評定の応答形式が不正です');
    list.forEach(item => {
      const normalizedStudentNumber = String(item?.studentNumber || '').trim();
      const level = normalizeTeacherAssessmentLevel_(item?.level);
      if (!normalizedStudentNumber || !level) return;
      const matched = chunk.find(target => String(target.studentNumber) === normalizedStudentNumber);
      if (!matched) return;
      drafts.push({
        unitId: normalizedUnitId,
        studentNumber: normalizedStudentNumber,
        [normalizedCategory]: level,
        memo: matched.currentMemo || '',
      });
    });
  }

  const deduped = dedupeTeacherAssessmentDrafts_(drafts, normalizedCategory);
  const saved = upsertTeacherAssessments_(deduped);
  return {
    ok: true,
    unitName: unit.name || '',
    category: normalizedCategory,
    targetCount: targets.length,
    updatedCount: saved.length,
    skippedCount: grouped.length - targets.length,
    drafts: saved,
  };
}

function generateTeacherAssessmentDraftsBySubject(subject, category, onlyEmpty) {
  if (!isTeacherAiEnabled_()) return { ok:false, error:'この先生では先生向けAI機能は無効です。' };
  const normalizedSubject = String(subject || '').trim();
  const normalizedCategory = String(category || '').trim();
  const emptyOnly = onlyEmpty !== false;
  if (!normalizedSubject) return { ok:false, error:'教科を選択してください' };
  if (!['knowledge','thinking','attitude'].includes(normalizedCategory)) {
    return { ok:false, error:'観点が不正です' };
  }

  const units = getAllUnits().filter(unit => String(unit.subject || '') === normalizedSubject);
  if (!units.length) return { ok:false, error:'対象教科の単元がありません' };

  let targetCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const unitResults = [];
  units.forEach(unit => {
    const res = generateTeacherAssessmentDrafts(unit.id, normalizedCategory, '', emptyOnly);
    if (!res?.ok) {
      unitResults.push({
        unitId: unit.id,
        unitName: unit.name || '',
        ok: false,
        error: res?.error || 'unknown',
      });
      return;
    }
    targetCount += Number(res.targetCount || 0);
    updatedCount += Number(res.updatedCount || 0);
    skippedCount += Number(res.skippedCount || 0);
    unitResults.push({
      unitId: unit.id,
      unitName: unit.name || '',
      ok: true,
      targetCount: res.targetCount || 0,
      updatedCount: res.updatedCount || 0,
      skippedCount: res.skippedCount || 0,
    });
  });

  const failed = unitResults.filter(item => item.ok === false);
  if (failed.length && !updatedCount) {
    return {
      ok: false,
      error: `AI仮評定に失敗しました: ${failed.map(item => `${item.unitName}:${item.error}`).join(' / ')}`,
      subject: normalizedSubject,
      category: normalizedCategory,
      unitResults,
    };
  }
  return {
    ok: true,
    subject: normalizedSubject,
    category: normalizedCategory,
    targetCount,
    updatedCount,
    skippedCount,
    unitResults,
    warning: failed.length ? failed.map(item => `${item.unitName}:${item.error}`).join(' / ') : '',
  };
}

function buildTeacherAssessmentDraftTargets_(rows, category) {
  const grouped = {};
  rows.forEach(row => {
    const studentNumber = String(row.num || '').trim();
    if (!studentNumber) return;
    if (!grouped[studentNumber]) {
      grouped[studentNumber] = {
        unitId: row.unitId || '',
        studentNumber,
        currentValue: String(row.teacherAssessment?.[category] || ''),
        currentMemo: String(row.teacherAssessment?.memo || ''),
        evidenceLines: [],
      };
    }
    const target = grouped[studentNumber];
    const entries = collectAssessmentEvidenceEntries_(row, category);
    if (entries.length) {
      target.evidenceLines.push(`${row.period}時間目: ${entries.join(' / ')}`);
    } else if (String(row.review || '').trim()) {
      target.evidenceLines.push(`${row.period}時間目: ${String(row.review || '').trim()}`);
    }
  });
  return Object.keys(grouped)
    .sort((a, b) => Number(a || 0) - Number(b || 0))
    .map(key => {
      const item = grouped[key];
      item.evidenceLines = Array.from(new Set(item.evidenceLines)).slice(0, 6);
      return item;
    });
}

function collectAssessmentEvidenceEntries_(row, category) {
  const fields = Array.isArray(row.fields) ? row.fields : [];
  const answersMap = row.answersMap || {};
  const explicit = fields
    .filter(field => Array.isArray(field.categories) && field.categories.includes(category))
    .map(field => `${field.label || field.key}: ${String(answersMap[field.key] || '').trim()}`)
    .filter(text => !text.endsWith(': '));
  if (explicit.length) return explicit;
  return fields
    .filter(field => matchesAssessmentDraftField_(field, category))
    .map(field => `${field.label || field.key}: ${String(answersMap[field.key] || '').trim()}`)
    .filter(text => !text.endsWith(': '));
}

function matchesAssessmentDraftField_(field, category) {
  const categories = Array.isArray(field?.categories) ? field.categories : [];
  if (categories.includes(category)) return true;
  const haystack = `${String(field?.key || '')} ${String(field?.label || '')} ${String(field?.type || '')}`.toLowerCase();
  if (category === 'knowledge') return /理解|できた|わかった|まとめ|用語|知識|技能|eval|summary/.test(haystack);
  if (category === 'thinking') return /ふりかえり|review|やり方|方法|工夫|理由|考え|説明|まとめ/.test(haystack);
  if (category === 'attitude') return /めあて|goal|ふりかえり|review|次|がんば|取り組|やり方|方法/.test(haystack);
  return false;
}

function buildTeacherAssessmentDraftPrompt_(unit, category, targets, period) {
  const categoryLabelMap = {
    knowledge: '知識・技能',
    thinking: '思考・判断・表現',
    attitude: '主体的に学習に取り組む態度',
  };
  const rubricMap = {
    knowledge: 'A=理解が安定しており学習内容を自分の言葉で扱えている。B=理解は見られるが不安定。C=理解の根拠がまだ弱い。',
    thinking: 'A=理由・工夫・考え方が具体的に書けている。B=考えはあるが具体性や一貫性が弱い。C=感想中心で根拠が弱い。',
    attitude: 'A=めあて・振り返り・次への見通しがある。B=取り組みはあるが次へのつながりが弱い。C=意欲や自己調整の根拠がまだ少ない。',
  };
  const studentBlock = targets.map(item => {
    const evidence = item.evidenceLines.length ? item.evidenceLines.join('\n') : '記録なし';
    return `- studentNumber: ${item.studentNumber}\n  evidence:\n${evidence.split('\n').map(line => `    ${line}`).join('\n')}`;
  }).join('\n');
  const cfg = getGlobalConfigWithDefaults_();
  return `${cfg.prompt_assessment || DEFAULT_PROMPT_ASSESSMENT}

観点:
- ${categoryLabelMap[category]}

判定基準:
${rubricMap[category]}

条件:
- 出力はJSON配列のみ
- 各要素は {"studentNumber":"1","level":"A","reason":"20字以内"} の形式
- level は A / B / C のいずれか
- 記録に根拠が乏しい場合は厳しすぎず B または C にする
- 先生の下書き用なので、無理に差を付けすぎない
- 今回の対象は ${period ? `${period}時間目のみ` : '単元全体'} の記録

対象単元:
- 単元名: ${unit?.name || ''}
- 教科: ${unit?.subject || ''}

対象:
${studentBlock}`;
}

function normalizeTeacherAssessmentLevel_(value) {
  const level = String(value || '').trim().toUpperCase();
  return ['A','B','C'].includes(level) ? level : '';
}

function dedupeTeacherAssessmentDrafts_(drafts, category) {
  const map = {};
  (drafts || []).forEach(item => {
    const key = `${String(item.unitId || '')}:${String(item.studentNumber || '')}`;
    if (!key || !item[category]) return;
    map[key] = item;
  });
  return Object.keys(map).map(key => map[key]);
}

// プロンプト・設定の保存
function saveGlobalSettings(medalTop, promptComment, promptScore, promptPortfolio, promptUnitSummary, promptAssessment, apiKey, studentAiAutoSubmitEnabled) {
  writeGlobalConfig('medal_top',      medalTop);
  writeGlobalConfig('prompt_comment', promptComment);
  writeGlobalConfig('prompt_score',   promptScore);
  writeGlobalConfig('prompt_portfolio', promptPortfolio);
  writeGlobalConfig('prompt_unit_summary', promptUnitSummary);
  writeGlobalConfig('prompt_assessment', promptAssessment);
  const props = getScriptProperties_();
  props.setProperty('ENABLE_STUDENT_AI_AUTO_SUBMIT', studentAiAutoSubmitEnabled ? 'true' : 'false');
  let effectiveApiKey = String(props.getProperty('GEMINI_API_KEY') || '').trim();
  if (apiKey && String(apiKey).trim()) {
    effectiveApiKey = String(apiKey).trim();
    props.setProperty('GEMINI_API_KEY', effectiveApiKey);
  }
  props.setProperty('ENABLE_TEACHER_AI', effectiveApiKey ? 'true' : 'false');
  return {
    ok: true,
    globalCfg: {
      medal_top: medalTop,
      prompt_comment: promptComment,
      prompt_score: promptScore,
      prompt_portfolio: promptPortfolio,
      prompt_unit_summary: promptUnitSummary,
      prompt_assessment: promptAssessment,
      api_key_configured: Boolean(effectiveApiKey),
      api_key_masked: effectiveApiKey ? `********${effectiveApiKey.slice(-4)}` : '',
      student_ai_enabled: isStudentAiEnabled_(),
      student_ai_submit_enabled: Boolean(studentAiAutoSubmitEnabled),
      teacher_ai_enabled: Boolean(effectiveApiKey),
    },
  };
}















