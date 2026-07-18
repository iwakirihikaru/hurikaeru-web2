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
const SHEET_FIELD_PRESETS = '項目プリセット';
const SHEET_INTRO = 'はじめに';
const SHEET_NEXT = 'つぎへ';
const SHEET_DB_STUDENTS  = 'Students';
const SHEET_DB_LESSONS   = 'Lessons';
const SHEET_DB_RESPONSES = 'Responses';
const SHEET_DB_LESSON_LIVE_STATE = 'LessonLiveState';
const SHEET_DB_HISTORY   = 'ResponseHistory';
const SHEET_DB_AUDIT     = 'AuditLog';
const SHEET_DB_ASSESS    = 'TeacherAssessments';
const SHEET_DB_AI_EVENTS = 'AiEventLog';
const HEADER_ROWS   = 2;
const MAX_STUDENTS  = 40;
const SUBJECTS = ['算数','国語','理科','社会','生活','体育','図工','音楽','道徳','総合','外国語活動'];
const DEFAULT_SUBJECT_FIELDS = {
  算数: ['goal','method','summary','eval','review'],
  国語: ['goal','method','summary','eval','review'],
  理科: ['goal','method','summary','eval','review'],
  社会: ['goal','method','summary','eval','review'],
  生活: ['goal','summary','eval','review'],
  体育: ['goal','method','eval','review'],
  図工: ['goal','summary','review'],
  音楽: ['goal','eval','review'],
  道徳: ['goal','review'],
  総合: ['goal','method','summary','eval','review'],
  外国語活動: ['goal','method','eval','review'],
};
const DEFAULT_PROMPT_COMMENT = 'あなたは小学3年生の担任の先生です。以下のふりかえりを読んで、やさしく励ますコメントを60文字以内で書いてください。ひらがな・カタカナを中心に使い、自己調整学習（めあてへの意識・方略・内省）を促す言葉を入れてください。';
const DEFAULT_PROMPT_SCORE = '自己調整学習スコア(0-7)を評価してください。0=C:一言のみ, 1=C+:感想のみ, 2=B:学んだ内容に触れている, 3=B+:めあてと照らした振り返り, 4=A:方略（工夫）が書かれている, 5=A+:方略＋次への改善意図, 6=S:深い内省・概念的理解, 7=S+:教科を超えた汎用的な気づき';
const DEFAULT_PROMPT_TEACHER_FEEDBACK = 'あなたは日本の小学校の担任です。児童名は使わず、番号だけで識別してください。提出内容を読み、児童に返す短い励ましコメントを作ってください。記録にないことは書かず、やさしい先生の文体で、次の学びにつながるひと言を入れてください。';
const DEFAULT_PROMPT_PORTFOLIO = 'あなたは小学校の担任の先生です。番号で示された児童の学習記録を読み、通知表や所見作成の下書きとして使える文章を作成してください。良さ、努力、変化、次の課題が分かること。200文字以内。先生が少し直せば使える自然な文体。断定しすぎず、記録に基づいて書いてください。';
const DEFAULT_PROMPT_UNIT_SUMMARY = 'あなたは小学校の担任の先生です。単元全体の児童ふりかえり一覧を読み、クラス全体の理解傾向、自己調整学習の観点で良い動き、支援が必要な傾向、次の指導への提案、単元を通じた成長変化を先生向けに整理してください。番号で児童を示し、個人名は出さないでください。';
const DEFAULT_PROMPT_ASSESSMENT = 'あなたは日本の小学校の担任です。単元の記録を読み、指定された観点で各児童に A / B / C の仮評定を付けてください。根拠は記録に基づき、番号で児童を識別し、個人名は使わないでください。';
const AGG_HEADERS   = ['単元名','教科','時間目','出席番号','なまえ','日付','ふりかえり','ランク','AIコメント','単元ID','responseId'];
const STUDENT_HEADERS  = ['studentId','number','name','active','createdAt','updatedAt'];
const LESSON_HEADERS   = ['lessonId','unitId','period','lessonDate','status','createdAt','updatedAt','fieldsJson'];
const RESPONSE_HEADERS = ['responseId','lessonId','unitId','studentId','studentNumber','studentName','answersJson','reviewText','submitted','submittedAt','score','rank','medal','comment','isRewrite','updatedAt','aiStatus','aiQueuedAt','aiProcessedAt','aiError','aiBatchId','aiRetryCount','aiStartedAt','aiLatencyMs','aiModelLatencyMs','favorite'];
const LESSON_LIVE_STATE_HEADERS = ['liveStateId','lessonId','unitId','period','studentId','studentNumber','studentName','responseId','answersJson','reviewText','submitted','submittedAt','score','rank','medal','comment','isRewrite','updatedAt','aiStatus','aiQueuedAt','aiProcessedAt','aiError','aiBatchId','aiRetryCount','aiStartedAt','aiLatencyMs','aiModelLatencyMs','favorite'];
const HISTORY_HEADERS  = ['historyId','responseId','lessonId','studentId','answersJson','reviewText','score','rank','medal','comment','editedBy','editedAt','editType'];
const AUDIT_HEADERS    = ['logId','targetType','targetId','action','beforeJson','afterJson','actor','createdAt'];
const ASSESS_HEADERS   = ['assessmentId','unitId','studentNumber','knowledge','thinking','attitude','memo','updatedAt'];
const TEACHER_COMMENT_DRAFT_HEADERS = ['draftId','responseId','lessonId','unitId','studentId','studentNumber','draftComment','draftRank','draftScore','status','createdAt','updatedAt','returnedAt'];
const AI_EVENT_HEADERS = ['eventId','responseId','lessonId','unitId','studentId','studentNumber','studentName','batchId','eventType','aiStatus','detail','timestamp','latencyMs','modelLatencyMs','retryCount'];
const FIELD_PRESET_HEADERS = ['presetKey','label','emoji','type','placeholder','options','hints','categoriesJson','isReview','updatedAt','deleted'];
const TEMPLATE_CFG_SHEET = '_setup';
const ADMIN_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyIxBewjHHF2JLlGbI6yuDfdMM7l_AkvY1QRlclIM0uR_nOGa_NXNcAZXY9Jl_g973G/exec';
const MAIN_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q/exec';
const PORTABLE_APP_BASE_URL = 'https://hurikaeru-web2.pages.dev';
const DISTRIBUTION_TEMPLATE_MASTER_SPREADSHEET_ID = '1rW5FPPwmlfXbfAIxmVBzMRd8oB0_R4Hb5LOfCF8Jgzk';
const MASTER_GAS_API_APP_ID = 'hurikaeru';
const MASTER_RESPONSE_RECORD_TYPE = 'response_snapshot';
const MASTER_RESPONSE_MIRROR_PROP = 'ENABLE_MASTER_RESPONSE_MIRROR';

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
const APP_BUILD = 'shell-config-phase2-2026-07-05-1730';
const TENANT_SHELL_CONFIG_TTL_MS = 24 * 60 * 60 * 1000;
const TENANT_SHELL_CONFIG_PROP_KEY = 'TENANT_SHELL_CONFIG_JSON';
const TENANT_SHELL_CONFIG_FETCHED_AT_PROP_KEY = 'TENANT_SHELL_CONFIG_FETCHED_AT';
const TENANT_SHELL_CONFIG_MAINTENANCE_PROP_KEY = 'TENANT_SHELL_MAINTENANCE_JSON';
const TENANT_SHELL_CONFIG_MAINTENANCE_AT_PROP_KEY = 'TENANT_SHELL_MAINTENANCE_FETCHED_AT';
const TENANT_LOCAL_RELEASE_VERSION_PROP_KEY = 'TENANT_LOCAL_RELEASE_VERSION';
const TENANT_LOCAL_RELEASE_BUILD_PROP_KEY = 'TENANT_LOCAL_RELEASE_BUILD';
const TENANT_LOCAL_RELEASE_SYNCED_AT_PROP_KEY = 'TENANT_LOCAL_RELEASE_SYNCED_AT';
const LOCK_AUTOSAVE_MS = 250;
const LOCK_SUBMIT_MS = 8000;
const LOCK_AI_RESULT_MS = 15000;
const AI_BATCH_WINDOW_MS = 700;
const AI_BATCH_DRAIN_MS = 250;
const AI_BATCH_RETRY_DELAY_MS = 5000;
const AI_BATCH_MAX_ITEMS = 5;
const AI_TEACHER_DRAFT_CHUNK_SIZE = 40;
const AI_BATCH_SPLIT_SIZE = 1;
const AI_BATCH_EARLY_FLUSH_MS = 100;
const AI_BATCH_TRIGGER_STALE_MS = 2 * 60 * 1000;
const AI_QUEUE_RETRY_WARN_COUNT = 3;
const AI_API_FETCH_ATTEMPTS = 2;
const AI_API_RETRY_BASE_MS = 4000;
const AI_API_RETRY_MAX_MS = 15000;
const AI_PROCESSING_STALE_MS = 2 * 60 * 1000;
const AI_QUEUE_SELF_HEAL_MS = 60 * 1000;
const AI_INLINE_COOLDOWN_MS = 3000;
const AI_TEACHER_QUEUE_COOLDOWN_MS = 8000;
const AI_INLINE_BUSY_LOG_MS = 10000;
const AI_TRIGGER_BUSY_LOG_MS = 10000;
const AI_EMPTY_LOG_MS = 30000;
const AI_CLAIM_BUSY_LOG_MS = 10000;
const AI_LOG_RETENTION_DAYS = 90;
const AI_LOG_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AI_CLAIM_LOCK_MS = 0;
const AI_TRIGGER_LOCK_MS = 0;
const AI_TRIGGER_RESCUE_DELAY_MS = 3 * 60 * 1000;
const AI_TRIGGER_SHORT_RESCUE_DELAY_MS = 15 * 1000;
const AI_TRIGGER_DRAIN_DELAY_MS = 5 * 1000;
const AI_TRIGGER_RETRY_RESCUE_DELAY_MS = 60 * 1000;
const AI_BATCH_HANDLER = 'processPendingAiBatch';
const AI_BATCH_TRIGGER_AT_KEY = 'AI_BATCH_TRIGGER_AT_MS';
const AI_INLINE_KICK_AT_KEY = 'AI_INLINE_KICK_AT_MS';
const AI_TEACHER_QUEUE_KICK_AT_KEY = 'AI_TEACHER_QUEUE_KICK_AT_MS';
const AI_INLINE_BUSY_LOG_AT_KEY = 'AI_INLINE_BUSY_LOG_AT_MS';
const AI_TRIGGER_BUSY_LOG_AT_KEY = 'AI_TRIGGER_BUSY_LOG_AT_MS';
const AI_EMPTY_LOG_AT_KEY = 'AI_EMPTY_LOG_AT_MS';
const AI_CLAIM_BUSY_LOG_AT_KEY = 'AI_CLAIM_BUSY_LOG_AT_MS';
const AI_LOG_PURGE_AT_KEY = 'AI_LOG_PURGE_AT_MS';
const AI_PERSIST_RETRY_INDEX_KEY = 'AI_PERSIST_RETRY_BATCH_IDS';
const AI_AGGREGATE_QUEUE_KEY = 'AI_AGGREGATE_QUEUE_JSON';
const GEMINI_TEXT_MODEL = 'gemini-3.1-flash-lite';
const AI_LOAD_TEST_PREFIX = '[AI_LOAD_TEST]';
const AI_LOAD_TEST_LESSON_PREFIX = 'loadtest:';
const AI_LOAD_TEST_SAMPLE_REVIEWS = [
  'とけなかったところをもういちどやりたいです。',
  'つぎはじぶんでさいごまでできるようになりたいです。',
  'ともだちのやりかたもさんこうにしたいです。',
  'とけたところとまちがえたところを見なおしたいです。',
  'テストで100てんをめざしてれんしゅうしたいです。',
  'じかんを見ながらあせらずにときたいです。',
];

function getScriptProperties_() {
  return PropertiesService.getScriptProperties();
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

function normalizeShellEndpoints_(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    primaryShellConfigUrl: String(data.primaryShellConfigUrl || '').trim(),
    fallbackShellConfigUrl: String(data.fallbackShellConfigUrl || '').trim(),
    primaryMaintenanceUrl: String(data.primaryMaintenanceUrl || '').trim(),
    fallbackMaintenanceUrl: String(data.fallbackMaintenanceUrl || '').trim(),
  };
}

function getDefaultTenantShellEndpoints_() {
  const selfBase = normalizeWebAppUrl_(
    getCurrentWebAppBaseUrl_() ||
    buildWebAppUrlFromDeploymentId_(String(getScriptProperties_().getProperty('DEPLOYMENT_ID') || '').trim()) ||
    MAIN_WEBAPP_URL
  );
  const adminBase = String(ADMIN_WEBAPP_URL || '').trim();
  return normalizeShellEndpoints_({
    primaryShellConfigUrl: appendQueryParams_(selfBase, { mode: 'shellConfig' }),
    fallbackShellConfigUrl: appendQueryParams_(adminBase, { mode: 'shellConfig' }),
    primaryMaintenanceUrl: appendQueryParams_(selfBase, { mode: 'maintenanceStatus' }),
    fallbackMaintenanceUrl: appendQueryParams_(adminBase, { mode: 'maintenanceStatus' }),
  });
}

function getTenantShellEndpoints_(config) {
  const defaults = getDefaultTenantShellEndpoints_();
  const overrides = normalizeShellEndpoints_(config && config.endpoints);
  return normalizeShellEndpoints_({
    primaryShellConfigUrl: overrides.primaryShellConfigUrl || defaults.primaryShellConfigUrl,
    fallbackShellConfigUrl: overrides.fallbackShellConfigUrl || defaults.fallbackShellConfigUrl,
    primaryMaintenanceUrl: overrides.primaryMaintenanceUrl || defaults.primaryMaintenanceUrl,
    fallbackMaintenanceUrl: overrides.fallbackMaintenanceUrl || defaults.fallbackMaintenanceUrl,
  });
}

function normalizeTeacherShellConfig_(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    latestVersion: String(data.latestVersion || '').trim(),
    latestBuild: String(data.latestBuild || '').trim(),
    maintenanceMode: Boolean(data.maintenanceMode),
    featureToggles: data.featureToggles && typeof data.featureToggles === 'object'
      ? data.featureToggles
      : {},
    endpoints: normalizeShellEndpoints_(data.endpoints),
    labels: data.labels && typeof data.labels === 'object'
      ? data.labels
      : {},
    questionTemplates: data.questionTemplates && typeof data.questionTemplates === 'object'
      ? data.questionTemplates
      : {},
    aiPrompts: data.aiPrompts && typeof data.aiPrompts === 'object'
      ? data.aiPrompts
      : {},
    noticeBanner: data.noticeBanner && typeof data.noticeBanner === 'object'
      ? data.noticeBanner
      : {},
    checkedAt: String(data.checkedAt || '').trim(),
    configVersion: String(data.configVersion || '').trim(),
    source: String(data.source || '').trim(),
  };
}

function readTenantShellConfigCache_() {
  const props = getScriptProperties_();
  const raw = String(props.getProperty(TENANT_SHELL_CONFIG_PROP_KEY) || '').trim();
  const fetchedAt = String(props.getProperty(TENANT_SHELL_CONFIG_FETCHED_AT_PROP_KEY) || '').trim();
  if (!raw) return null;
  try {
    return {
      config: normalizeTeacherShellConfig_(JSON.parse(raw)),
      fetchedAt,
    };
  } catch (_err) {
    return null;
  }
}

function writeTenantShellConfigCache_(config) {
  const normalized = normalizeTeacherShellConfig_(config);
  getScriptProperties_().setProperties({
    [TENANT_SHELL_CONFIG_PROP_KEY]: JSON.stringify(normalized),
    [TENANT_SHELL_CONFIG_FETCHED_AT_PROP_KEY]: new Date().toISOString(),
  }, false);
  return normalized;
}

function readTenantMaintenanceCache_() {
  const props = getScriptProperties_();
  const raw = String(props.getProperty(TENANT_SHELL_CONFIG_MAINTENANCE_PROP_KEY) || '').trim();
  const fetchedAt = String(props.getProperty(TENANT_SHELL_CONFIG_MAINTENANCE_AT_PROP_KEY) || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      maintenanceMode: Boolean(parsed && parsed.maintenanceMode),
      noticeBanner: parsed && typeof parsed.noticeBanner === 'object' ? parsed.noticeBanner : {},
      checkedAt: String(parsed && parsed.checkedAt || '').trim(),
      fetchedAt,
    };
  } catch (_err) {
    return null;
  }
}

function writeTenantMaintenanceCache_(payload) {
  const normalized = {
    maintenanceMode: Boolean(payload && payload.maintenanceMode),
    noticeBanner: payload && typeof payload.noticeBanner === 'object' ? payload.noticeBanner : {},
    checkedAt: String(payload && payload.checkedAt || '').trim(),
  };
  getScriptProperties_().setProperties({
    [TENANT_SHELL_CONFIG_MAINTENANCE_PROP_KEY]: JSON.stringify(normalized),
    [TENANT_SHELL_CONFIG_MAINTENANCE_AT_PROP_KEY]: new Date().toISOString(),
  }, false);
  return normalized;
}

function clearTenantShellConfigCache_() {
  const props = getScriptProperties_();
  [
    TENANT_SHELL_CONFIG_PROP_KEY,
    TENANT_SHELL_CONFIG_FETCHED_AT_PROP_KEY,
    TENANT_SHELL_CONFIG_MAINTENANCE_PROP_KEY,
    TENANT_SHELL_CONFIG_MAINTENANCE_AT_PROP_KEY,
  ].forEach(key => props.deleteProperty(key));
  return {
    ok: true,
    cleared: true,
  };
}

function getLocalTenantReleaseInfo_() {
  const props = getScriptProperties_();
  return {
    latestVersion: String(props.getProperty(TENANT_LOCAL_RELEASE_VERSION_PROP_KEY) || '').trim(),
    latestBuild: String(props.getProperty(TENANT_LOCAL_RELEASE_BUILD_PROP_KEY) || APP_BUILD).trim(),
    checkedAt: String(props.getProperty(TENANT_LOCAL_RELEASE_SYNCED_AT_PROP_KEY) || '').trim(),
  };
}

function buildLocalTenantShellConfig_() {
  const cached = readTenantShellConfigCache_();
  const cachedConfig = cached && cached.config ? cached.config : normalizeTeacherShellConfig_({});
  const cachedMaintenance = readTenantMaintenanceCache_();
  const releaseInfo = getLocalTenantReleaseInfo_();
  return normalizeTeacherShellConfig_({
    ...cachedConfig,
    latestVersion: releaseInfo.latestVersion || String(cachedConfig.latestVersion || '').trim(),
    latestBuild: releaseInfo.latestBuild || String(cachedConfig.latestBuild || APP_BUILD).trim(),
    maintenanceMode: cachedMaintenance ? Boolean(cachedMaintenance.maintenanceMode) : Boolean(cachedConfig.maintenanceMode),
    featureToggles: cachedConfig.featureToggles && typeof cachedConfig.featureToggles === 'object'
      ? cachedConfig.featureToggles
      : {
          allowUpdateRequest: true,
          showAiSettings: true,
          showUpdateTab: true,
          showNoticeBanner: true,
          showRegistrationLink: true,
          showHelpUpdateGuide: true,
        },
    endpoints: getDefaultTenantShellEndpoints_(),
    labels: cachedConfig.labels && typeof cachedConfig.labels === 'object' ? cachedConfig.labels : {},
    questionTemplates: cachedConfig.questionTemplates && typeof cachedConfig.questionTemplates === 'object' ? cachedConfig.questionTemplates : {},
    aiPrompts: cachedConfig.aiPrompts && typeof cachedConfig.aiPrompts === 'object' ? cachedConfig.aiPrompts : {},
    noticeBanner: cachedMaintenance && cachedMaintenance.noticeBanner
      ? cachedMaintenance.noticeBanner
      : (cachedConfig.noticeBanner && typeof cachedConfig.noticeBanner === 'object' ? cachedConfig.noticeBanner : {}),
    checkedAt: releaseInfo.checkedAt || (cachedMaintenance && cachedMaintenance.checkedAt) || String(cachedConfig.checkedAt || '').trim(),
    configVersion: APP_BUILD,
    source: 'self',
  });
}

function getLocalTenantShellConfigResponse_() {
  const shell = buildLocalTenantShellConfig_();
  return {
    ok: true,
    latestVersion: String(shell.latestVersion || '').trim(),
    latestBuild: String(shell.latestBuild || '').trim(),
    maintenanceMode: Boolean(shell.maintenanceMode),
    featureToggles: shell.featureToggles || {},
    endpoints: shell.endpoints || {},
    labels: shell.labels || {},
    questionTemplates: shell.questionTemplates || {},
    aiPrompts: shell.aiPrompts || {},
    noticeBanner: shell.noticeBanner || {},
    checkedAt: String(shell.checkedAt || '').trim(),
    configVersion: String(shell.configVersion || '').trim(),
    source: String(shell.source || 'self').trim(),
  };
}

function getLocalTenantMaintenanceStatusResponse_() {
  const shell = buildLocalTenantShellConfig_();
  return {
    ok: true,
    maintenanceMode: Boolean(shell.maintenanceMode),
    noticeBanner: shell.noticeBanner || {},
    checkedAt: String(shell.checkedAt || '').trim(),
    configVersion: String(shell.configVersion || '').trim(),
  };
}

function getLocalTenantReleaseInfoResponse_() {
  const releaseInfo = getLocalTenantReleaseInfo_();
  return {
    ok: true,
    latestTenantAppBuild: String(releaseInfo.latestBuild || APP_BUILD).trim(),
    latestTenantAppVersion: String(releaseInfo.latestVersion || '').trim(),
    latestTenantAppNote: '',
    checkedAt: String(releaseInfo.checkedAt || '').trim(),
  };
}

function syncLocalTenantReleaseInfo_(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const version = String(payload.versionNumber || payload.latestVersion || '').trim();
  const build = String(payload.latestBuild || APP_BUILD).trim() || APP_BUILD;
  const checkedAt = new Date().toISOString();
  getScriptProperties_().setProperties({
    [TENANT_LOCAL_RELEASE_VERSION_PROP_KEY]: version,
    [TENANT_LOCAL_RELEASE_BUILD_PROP_KEY]: build,
    [TENANT_LOCAL_RELEASE_SYNCED_AT_PROP_KEY]: checkedAt,
  }, false);
  const cached = readTenantShellConfigCache_();
  writeTenantShellConfigCache_({
    ...(cached && cached.config ? cached.config : {}),
    latestVersion: version,
    latestBuild: build,
    endpoints: getDefaultTenantShellEndpoints_(),
    configVersion: APP_BUILD,
    source: 'self',
  });
  return getLocalTenantShellConfigResponse_();
}

function fetchJsonFromShellEndpoint_(url, fallbackError) {
  const target = String(url || '').trim();
  if (!target) {
    return { ok: false, error: String(fallbackError || 'endpoint_missing') };
  }
  try {
    const response = UrlFetchApp.fetch(target, {
      method: 'get',
      muteHttpExceptions: true,
    });
    const statusCode = Number(response.getResponseCode() || 0);
    if (statusCode >= 400) {
      return { ok: false, error: `http_${statusCode}` };
    }
    const json = JSON.parse(String(response.getContentText() || '{}'));
    if (!json || json.ok === false) {
      return { ok: false, error: String(json && json.error || fallbackError || 'fetch_failed') };
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function fetchTenantShellConfigFromUrl_(url, source) {
  const result = fetchJsonFromShellEndpoint_(url, 'shell_config_fetch_failed');
  if (!result.ok) return result;
  return {
    ok: true,
    source: String(source || '').trim(),
    config: normalizeTeacherShellConfig_({
      ...result.json,
      source: String(source || '').trim(),
    }),
  };
}

function fetchTenantMaintenanceStateFromUrl_(url, source) {
  const result = fetchJsonFromShellEndpoint_(url, 'maintenance_fetch_failed');
  if (!result.ok) return result;
  return {
    ok: true,
    source: String(source || '').trim(),
    payload: writeTenantMaintenanceCache_({
      ...result.json,
      source: String(source || '').trim(),
    }),
  };
}

function tryFetchTenantShellConfigFromEndpoints_(endpoints) {
  const chain = [
    { url: endpoints && endpoints.primaryShellConfigUrl, source: 'cdn_primary' },
    { url: endpoints && endpoints.fallbackShellConfigUrl, source: 'gas_fallback' },
  ];
  const errors = [];
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    if (!String(entry.url || '').trim()) continue;
    const result = fetchTenantShellConfigFromUrl_(entry.url, entry.source);
    if (result.ok) return result;
    errors.push(`${entry.source}:${String(result.error || 'shell_config_fetch_failed')}`);
  }
  return {
    ok: false,
    error: errors.length ? errors.join(' | ') : 'shell_config_endpoint_missing',
  };
}

function tryFetchTenantMaintenanceFromEndpoints_(endpoints) {
  const chain = [
    { url: endpoints && endpoints.primaryMaintenanceUrl, source: 'cdn_primary' },
    { url: endpoints && endpoints.fallbackMaintenanceUrl, source: 'gas_fallback' },
  ];
  const errors = [];
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    if (!String(entry.url || '').trim()) continue;
    const result = fetchTenantMaintenanceStateFromUrl_(entry.url, entry.source);
    if (result.ok) return result;
    errors.push(`${entry.source}:${String(result.error || 'maintenance_fetch_failed')}`);
  }
  return {
    ok: false,
    error: errors.length ? errors.join(' | ') : 'maintenance_endpoint_missing',
  };
}

function getTenantShellConfig_(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const cached = readTenantShellConfigCache_();
  const fetchedAtMs = cached && cached.fetchedAt ? Date.parse(cached.fetchedAt) : 0;
  const cacheAgeMs = fetchedAtMs ? Math.max(0, Date.now() - fetchedAtMs) : Number.POSITIVE_INFINITY;
  const cacheFresh = Boolean(cached && fetchedAtMs && cacheAgeMs < TENANT_SHELL_CONFIG_TTL_MS);
  let config = cached ? cached.config : normalizeTeacherShellConfig_({});
  let endpoints = getTenantShellEndpoints_(config);
  let source = cached ? 'cache' : 'default';
  let configSource = String(config && config.source || '').trim() || source;
  let maintenanceSource = '';
  let fetchError = '';

  if (opts.forceRefresh || !cacheFresh) {
    const remote = tryFetchTenantShellConfigFromEndpoints_(endpoints);
    if (remote.ok && remote.config) {
      config = writeTenantShellConfigCache_(remote.config);
      endpoints = getTenantShellEndpoints_(config);
      source = String(remote.source || 'remote').trim();
      configSource = source;
      fetchError = '';
      if (
        source === 'gas_fallback' &&
        endpoints.primaryShellConfigUrl &&
        opts.skipPrimaryRetry !== true
      ) {
        const primaryRetry = fetchTenantShellConfigFromUrl_(endpoints.primaryShellConfigUrl, 'cdn_primary');
        if (primaryRetry.ok && primaryRetry.config) {
          config = writeTenantShellConfigCache_(primaryRetry.config);
          endpoints = getTenantShellEndpoints_(config);
          source = 'cdn_primary';
          configSource = 'cdn_primary';
        }
      }
    } else {
      fetchError = String(remote && remote.error || 'shell_config_fetch_failed');
    }
  }

  const finalCache = readTenantShellConfigCache_();
  const finalFetchedAtMs = finalCache && finalCache.fetchedAt ? Date.parse(finalCache.fetchedAt) : 0;
  const finalCacheAgeMs = finalFetchedAtMs ? Math.max(0, Date.now() - finalFetchedAtMs) : Number.POSITIVE_INFINITY;
  const finalCacheFresh = Boolean(finalCache && finalFetchedAtMs && finalCacheAgeMs < TENANT_SHELL_CONFIG_TTL_MS);

  const maintenanceResult = opts.includeMaintenance !== false
    ? tryFetchTenantMaintenanceFromEndpoints_(endpoints)
    : null;
  if (maintenanceResult && maintenanceResult.ok && maintenanceResult.payload) {
    maintenanceSource = String(maintenanceResult.source || '').trim();
    config = {
      ...config,
      maintenanceMode: Boolean(maintenanceResult.payload.maintenanceMode),
      noticeBanner: maintenanceResult.payload.noticeBanner || config.noticeBanner || {},
      checkedAt: maintenanceResult.payload.checkedAt || config.checkedAt || '',
    };
  } else if (opts.includeMaintenance !== false) {
    const cachedMaintenance = readTenantMaintenanceCache_();
    if (cachedMaintenance) {
      maintenanceSource = 'cache';
      config = {
        ...config,
        maintenanceMode: Boolean(cachedMaintenance.maintenanceMode),
        noticeBanner: cachedMaintenance.noticeBanner || config.noticeBanner || {},
        checkedAt: cachedMaintenance.checkedAt || config.checkedAt || '',
      };
    } else if (maintenanceResult) {
      maintenanceSource = 'default';
      fetchError = fetchError
        ? `${fetchError} | ${String(maintenanceResult.error || 'maintenance_fetch_failed')}`
        : String(maintenanceResult.error || 'maintenance_fetch_failed');
    }
  }

  return {
    ok: Boolean(config && (config.latestVersion || config.latestBuild || finalCache || cached)),
    config: normalizeTeacherShellConfig_(config),
    source,
    configSource,
    maintenanceSource,
    cacheFetchedAt: finalCache && finalCache.fetchedAt ? finalCache.fetchedAt : '',
    cacheAgeMs: Number.isFinite(finalCacheAgeMs) ? finalCacheAgeMs : null,
    cacheFresh: finalCacheFresh,
    cacheStale: !finalCacheFresh,
    fetchError,
  };
}

function getLiveTenantMaintenanceState() {
  const endpoints = getTenantShellEndpoints_(readTenantShellConfigCache_()?.config);
  const result = tryFetchTenantMaintenanceFromEndpoints_(endpoints);
  if (result.ok && result.payload) {
    return {
      ok: true,
      maintenanceMode: Boolean(result.payload.maintenanceMode),
      noticeBanner: result.payload.noticeBanner || {},
      checkedAt: result.payload.checkedAt || '',
      source: String(result.source || 'remote').trim(),
    };
  }
  const cached = readTenantMaintenanceCache_();
  if (cached) {
    return {
      ok: false,
      maintenanceMode: Boolean(cached.maintenanceMode),
      noticeBanner: cached.noticeBanner || {},
      checkedAt: cached.checkedAt || '',
      source: 'cache',
      error: String(result && result.error || 'maintenance_fetch_failed'),
    };
  }
  return {
    ok: false,
    maintenanceMode: false,
    noticeBanner: {},
    checkedAt: '',
    source: 'default',
    error: String(result && result.error || 'maintenance_fetch_failed'),
  };
}

function getTenantId_() {
  return String(getScriptProperties_().getProperty('TENANT_ID') || '').trim();
}

function getTeacherName_() {
  return String(getScriptProperties_().getProperty('TEACHER_NAME') || '').trim();
}

function getScriptBooleanProperty_(key, defaultValue) {
  const raw = String(getScriptProperties_().getProperty(String(key || '')) || '').trim().toLowerCase();
  if (!raw) return Boolean(defaultValue);
  if (['true', '1', 'yes', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'off'].includes(raw)) return false;
  return Boolean(defaultValue);
}

function isStudentAiEnabled_() {
  return getScriptBooleanProperty_('ENABLE_STUDENT_AI', false);
}

function isStudentAiAutoSubmitEnabled_() {
  return getScriptBooleanProperty_('ENABLE_STUDENT_AI_AUTO_SUBMIT', false);
}

function isTeacherAiEnabled_() {
  const raw = String(getScriptProperties_().getProperty('ENABLE_TEACHER_AI') || '').trim().toLowerCase();
  if (raw) {
    return getScriptBooleanProperty_('ENABLE_TEACHER_AI', false);
  }
  const apiKey = String(getScriptProperties_().getProperty('GEMINI_API_KEY') || '').trim();
  return Boolean(apiKey);
}

function getAiFeatureFlags_() {
  return {
    studentAiEnabled: isStudentAiEnabled_(),
    studentAiAutoSubmitEnabled: isStudentAiAutoSubmitEnabled_(),
    teacherAiEnabled: isTeacherAiEnabled_(),
  };
}

function getTenantSpreadsheetId_() {
  const spreadsheetId = String(getScriptProperties_().getProperty('SPREADSHEET_ID') || '').trim();
  if (spreadsheetId) {
    return spreadsheetId;
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active && typeof active.getId === 'function') {
    const activeId = String(active.getId() || '').trim();
    if (activeId) {
      getScriptProperties_().setProperty('SPREADSHEET_ID', activeId);
      return activeId;
    }
  }
  throw new Error('SPREADSHEET_ID is not configured. 「登録を完了する」を実行してください。');
}

function getTenantSpreadsheet_() {
  return SpreadsheetApp.openById(getTenantSpreadsheetId_());
}

function setTenantDeploymentConfig(config) {
  const payload = config && typeof config === 'object' ? config : {};
  const props = getScriptProperties_();
  const tenantId = String(payload.tenantId || '').trim();
  const teacherName = String(payload.teacherName || '').trim();
  const spreadsheetId = String(payload.spreadsheetId || '').trim();
  const deploymentId = String(payload.deploymentId || '').trim();
  const studentAiEnabled = Boolean(payload.enableStudentAi);
  const teacherAiEnabled = Boolean(payload.enableTeacherAi);

  if (!tenantId) throw new Error('tenantId is required.');
  if (!teacherName) throw new Error('teacherName is required.');
  if (!spreadsheetId) throw new Error('spreadsheetId is required.');

  props.setProperties({
    TENANT_ID: tenantId,
    TEACHER_NAME: teacherName,
    SPREADSHEET_ID: spreadsheetId,
    DEPLOYMENT_ID: deploymentId,
    ENABLE_STUDENT_AI: studentAiEnabled ? 'true' : 'false',
    ENABLE_STUDENT_AI_AUTO_SUBMIT: 'false',
    ENABLE_TEACHER_AI: teacherAiEnabled ? 'true' : 'false',
  }, false);

  return {
    ok: true,
    tenantId,
    teacherName,
    spreadsheetId,
    deploymentId,
    enableStudentAi: studentAiEnabled,
    enableTeacherAi: teacherAiEnabled,
  };
}

function buildCurrentTenantDeploymentConfig_() {
  const props = getScriptProperties_();
  const activeSpreadsheetId = String(
    props.getProperty('SPREADSHEET_ID') ||
    ((function() {
      try {
        const active = SpreadsheetApp.getActiveSpreadsheet();
        return active && typeof active.getId === 'function' ? active.getId() : '';
      } catch (_err) {
        return '';
      }
    })())
  || '').trim();
  return {
    tenantId: String(props.getProperty('TENANT_ID') || '').trim(),
    teacherName: String(props.getProperty('TEACHER_NAME') || '').trim(),
    spreadsheetId: activeSpreadsheetId,
    deploymentId: String(props.getProperty('DEPLOYMENT_ID') || '').trim(),
    enableStudentAi: getScriptBooleanProperty_('ENABLE_STUDENT_AI', false),
    enableTeacherAi: isTeacherAiEnabled_(),
  };
}

function reapplyCurrentTenantDeploymentConfig_() {
  const config = buildCurrentTenantDeploymentConfig_();
  const result = setTenantDeploymentConfig(config);
  return {
    ...result,
    reappliedAt: new Date().toISOString(),
  };
}

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
      categories: ['attitude'],
    },
    {
      key    : 'method',
      label  : '学習のやり方',
      emoji  : '🔧',
      type   : 'radio',
      placeholder: '',
      options: '１人で,友達と,先生と',
      hints  : '',
      categories: ['thinking','attitude'],
    },
    {
      key    : 'summary',
      label  : 'まとめ',
      emoji  : '📝',
      type   : 'text',
      placeholder: 'わかったこと・きづいたことをかいてみよう',
      options: '',
      hints  : '',
      categories: ['knowledge','thinking'],
    },
    {
      key    : 'eval',
      label  : 'よくわかりましたか？',
      emoji  : '🤔',
      type   : 'select',
      placeholder: '',
      options: 'よくわかった,だいたいわかった,あまりわからなかった,わからなかった',
      hints  : '',
      categories: ['knowledge'],
    },
    {
      key    : 'review',
      label  : 'ふりかえり',
      emoji  : '💬',
      type   : 'review',  // 特殊：観点ヒント付き自由記述
      placeholder: 'くわしくかいてみよう！',
      options: '',
      hints  : 'がんばったこと,やり方,わかったこと,次にしたいこと,しりたいこと,おもったこと,むずかしかったこと',
      categories: ['thinking','attitude'],
    },
  ];
}

