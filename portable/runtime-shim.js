(function () {
  var STORAGE_KEY = "GAS_API_URL";
  var memoryApiUrl = "";
  var REDIRECT_FLAG_KEY = "__portable_setup_redirecting__";
  var TEACHER_BOOTSTRAP_CACHE_KEY = "jibun-matome-teacher-bootstrap-fast";
  var TEACHER_BOOTSTRAP_TTL_MS = 5 * 60 * 1000;
  var PORTABLE_FETCH_TIMEOUT_MS = 20000;
  var PORTABLE_FETCH_RETRY_COUNT = 1;

  function readApiUrlFromQuery() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      return String(params.get("api") || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function syncMemoryApiUrl() {
    var queryValue = readApiUrlFromQuery();
    if (queryValue) {
      memoryApiUrl = queryValue;
      try {
        window.localStorage.setItem(STORAGE_KEY, queryValue);
      } catch (_error) {}
      return memoryApiUrl;
    }
    try {
      memoryApiUrl = window.localStorage.getItem(STORAGE_KEY) || memoryApiUrl || "";
    } catch (_error) {}
    return memoryApiUrl;
  }

  function getApiUrl() {
    return syncMemoryApiUrl();
  }

  function setApiUrl(value) {
    var normalized = String(value || "").trim();
    memoryApiUrl = normalized;
    try {
      if (normalized) {
        window.localStorage.setItem(STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_error) {}
    return normalized;
  }

  function validateApiUrl(value) {
    var normalized = String(value || "").trim();
    if (!normalized) {
      return {
        ok: false,
        url: "",
        error: "GAS Web App URL を入力してください。"
      };
    }
    var parsed;
    try {
      parsed = new URL(normalized, window.location.href);
    } catch (_error) {
      return {
        ok: false,
        url: normalized,
        error: "URL の形式が正しくありません。"
      };
    }
    var protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      return {
        ok: false,
        url: normalized,
        error: "http または https の URL を指定してください。"
      };
    }
    var pathname = String(parsed.pathname || "");
    var hostname = String(parsed.hostname || "").toLowerCase();
    var looksLikeGasExec = /\/macros\/s\/[^/]+\/exec\/?$/i.test(pathname);
    var isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    if (!looksLikeGasExec && !isLocalhost) {
      return {
        ok: false,
        url: normalized,
        error: "GAS の Web アプリ URL (/macros/s/.../exec) を指定してください。"
      };
    }
    return {
      ok: true,
      url: parsed.toString(),
      error: ""
    };
  }

  function parseResponseText(text) {
    var parsed = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed.ok === "boolean" && Object.prototype.hasOwnProperty.call(parsed, "data")) {
      return parsed;
    }
    if (parsed && typeof parsed.ok === "boolean" && parsed.error && typeof parsed.error !== "string") {
      return parsed;
    }
    return {
      ok: parsed && typeof parsed.ok === "boolean" ? parsed.ok : true,
      data: parsed,
      error: parsed && parsed.ok === false ? parsed.error || "Unknown API error." : null
    };
  }

  function describeInvalidJsonResponse(text) {
    var sample = String(text || "").trim().slice(0, 120);
    if (/^Circle Master GAS API v1\.0 is running/i.test(sample)) {
      return "接続先が API 応答ではありません。GAS Web App URL (/exec) を指定してください。";
    }
    if (/^<!doctype html/i.test(sample) || /^<html/i.test(sample)) {
      return "接続先が HTML ページを返しています。GAS Web App URL (/exec) を指定してください。";
    }
    return "Invalid JSON response.";
  }

  function getErrorMessage(error) {
    if (!error) return "Unknown API error.";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    return String(error);
  }

  function createPortableError(message, extra) {
    var details = extra && typeof extra === "object" ? extra : {};
    var error = new Error(String(message || "Unknown API error."));
    if (details.code) error.code = details.code;
    if (details.status) error.status = details.status;
    if (details.retriable === true) error.retriable = true;
    if (details.cause) error.cause = details.cause;
    return error;
  }

  function normalizePortableError(error) {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === "string") {
      return createPortableError(error);
    }
    if (error && typeof error === "object") {
      return createPortableError(getErrorMessage(error), error);
    }
    return createPortableError(String(error || "Unknown API error."));
  }

  function isRetriablePortableError(error) {
    var normalized = normalizePortableError(error);
    if (normalized.retriable === true) return true;
    if (normalized.name === "AbortError") return true;
    if (normalized.code === "timeout") return true;
    var status = Number(normalized.status || 0);
    if (status >= 500) return true;
    return false;
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeString(value) {
    return String(value == null ? "" : value);
  }

  function normalizeNumber(value, fallback) {
    var num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function normalizeErrors(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return normalizeString(item); }).filter(Boolean);
    }
    var text = normalizeString(value).trim();
    return text ? [text] : [];
  }

  function normalizeStatusPayload(value) {
    var status = normalizeObject(value);
    var meta = normalizeObject(status.meta);
    var next = Object.assign({}, status);
    next.meta = Object.assign({
      teacherAiEnabled: false,
      draftCount: 0,
      returnedCount: 0
    }, meta);
    next.students = normalizeArray(status.students);
    return next;
  }

  function normalizeTeacherInitPayload(data) {
    var payload = normalizeObject(data);
    return Object.assign({}, payload, {
      portableContractVersion: normalizeNumber(payload.portableContractVersion, 1),
      units: normalizeArray(payload.units),
      unitsReadMeta: payload.unitsReadMeta && typeof payload.unitsReadMeta === "object" ? payload.unitsReadMeta : null,
      active: payload.active === undefined ? null : payload.active,
      roster: normalizeArray(payload.roster),
      unitProgress: normalizeObject(payload.unitProgress),
      progressNeedsRefresh: payload.progressNeedsRefresh !== false,
      build: normalizeString(payload.build),
      deploymentVersion: normalizeNumber(payload.deploymentVersion, 0),
      deploymentCreatedAt: normalizeString(payload.deploymentCreatedAt).trim(),
      deploymentDescription: normalizeString(payload.deploymentDescription).trim(),
      errors: normalizeErrors(payload.errors)
    });
  }

  function normalizeTeacherStatusSnapshotPayload(data) {
    var payload = normalizeObject(data);
    return Object.assign({}, payload, {
      portableContractVersion: normalizeNumber(payload.portableContractVersion, 1),
      active: payload.active === undefined ? null : payload.active,
      build: normalizeString(payload.build),
      status: normalizeStatusPayload(payload.status),
      timing: normalizeObject(payload.timing),
      errors: normalizeErrors(payload.errors)
    });
  }

  function normalizeStudentStatePayload(data) {
    var payload = normalizeObject(data);
    var fields = normalizeArray(payload.fields);
    var customs = normalizeArray(payload.customs);
    while (customs.length < fields.length) customs.push("");
    return Object.assign({}, payload, {
      portableContractVersion: normalizeNumber(payload.portableContractVersion, 1),
      fields: fields,
      num: payload.num == null ? "" : payload.num,
      name: normalizeString(payload.name),
      customs: customs,
      comment: normalizeString(payload.comment),
      rank: normalizeString(payload.rank),
      medal: normalizeString(payload.medal),
      medalColor: normalizeString(payload.medalColor),
      submitted: payload.submitted === true,
      aiStatus: normalizeString(payload.aiStatus),
      prevReview: normalizeString(payload.prevReview),
      previousNextGoal: normalizeString(payload.previousNextGoal),
      responseReadMeta: normalizeObject(payload.responseReadMeta),
      studentAiEnabled: payload.studentAiEnabled === true,
      studentAiAutoSubmitEnabled: payload.studentAiAutoSubmitEnabled === true,
      shell: normalizeObject(payload.shell)
    });
  }

  function normalizeStudentInitPayload(data) {
    var payload = normalizeObject(data);
    var normalized = normalizeStudentStatePayload(payload);
    return Object.assign({}, normalized, {
      needPeriodSelect: payload.needPeriodSelect === true,
      unit: payload.unit === undefined ? null : payload.unit,
      units: normalizeArray(payload.units),
      period: normalizeNumber(payload.period, 0),
      presets: normalizeArray(payload.presets),
      students: normalizeArray(payload.students),
      teacherSetPeriod: payload.teacherSetPeriod === true,
      teacherTimelineFieldKey: normalizeString(payload.teacherTimelineFieldKey).trim()
    });
  }

  function normalizePortableContractData(action, data) {
    var name = normalizeString(action).trim();
    if (name === "teacherInit") return normalizeTeacherInitPayload(data);
    if (name === "teacherStatusSnapshot") return normalizeTeacherStatusSnapshotPayload(data);
    if (name === "studentInit") return normalizeStudentInitPayload(data);
    if (name === "studentLoadState") return normalizeStudentStatePayload(data);
    return data;
  }

  function resolvePortableContractActionName(action, payload) {
    var name = normalizeString(action).trim();
    if (name && name !== "rpc") return name;
    var body = payload && typeof payload === "object" ? payload : {};
    return normalizeString(body.method || "").trim();
  }

  function readJsonCache(cacheKey) {
    try {
      var raw = window.localStorage.getItem(cacheKey);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed) return null;
      if ((Date.now() - Number(parsed.savedAt || 0)) > TEACHER_BOOTSTRAP_TTL_MS) {
        window.localStorage.removeItem(cacheKey);
        return null;
      }
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function writeJsonCache(cacheKey, payload) {
    try {
      window.localStorage.setItem(
        cacheKey,
        JSON.stringify({
          savedAt: Date.now(),
          apiUrl: getApiUrl(),
          data: payload
        })
      );
    } catch (_error) {}
    return payload;
  }

  function clearJsonCache(cacheKey) {
    try {
      window.localStorage.removeItem(cacheKey);
    } catch (_error) {}
  }

  function readTeacherBootstrapCache() {
    var cached = readJsonCache(TEACHER_BOOTSTRAP_CACHE_KEY);
    if (!cached || !cached.data || typeof cached.data !== "object") {
      return null;
    }
    var cachedApiUrl = String(cached.apiUrl || "").trim();
    var currentApiUrl = String(getApiUrl() || "").trim();
    if (cachedApiUrl && currentApiUrl && cachedApiUrl !== currentApiUrl) {
      clearJsonCache(TEACHER_BOOTSTRAP_CACHE_KEY);
      return null;
    }
    return cached.data;
  }

  function writeTeacherBootstrapCache(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return writeJsonCache(TEACHER_BOOTSTRAP_CACHE_KEY, payload);
  }

  function isSetupPage() {
    try {
      return /\/setup(?:\.html)?$/i.test(window.location.pathname || "");
    } catch (_error) {
      return false;
    }
  }

  function redirectToSetupIfNeeded() {
    if (isSetupPage()) return false;
    try {
      if (window.sessionStorage.getItem(REDIRECT_FLAG_KEY) === "1") {
        return false;
      }
      window.sessionStorage.setItem(REDIRECT_FLAG_KEY, "1");
    } catch (_error) {}
    try {
      var current = String((window.location.pathname || "") + (window.location.search || "") + (window.location.hash || ""));
      var target = "./setup?missingApi=1&returnTo=" + encodeURIComponent(current);
      window.location.replace(target);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function sendRequest(payload, sync) {
    var apiUrl = getApiUrl();
    if (!apiUrl) {
      redirectToSetupIfNeeded();
      throw createPortableError("GAS_API_URL is not set in localStorage.", { code: "missing_api_url" });
    }
    var validation = validateApiUrl(apiUrl);
    if (!validation.ok) {
      throw createPortableError(validation.error, { code: "invalid_api_url" });
    }
    apiUrl = validation.url;
    if (sync) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", apiUrl, false);
      xhr.timeout = PORTABLE_FETCH_TIMEOUT_MS;
      xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");
      try {
        xhr.send(JSON.stringify(payload));
      } catch (error) {
        throw createPortableError(getErrorMessage(error), { code: "network_error", retriable: true, cause: error });
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        throw createPortableError("HTTP " + xhr.status, { code: "http_error", status: xhr.status, retriable: xhr.status >= 500 });
      }
      try {
        return parseResponseText(xhr.responseText);
      } catch (error) {
        throw createPortableError(describeInvalidJsonResponse(xhr.responseText), { code: "invalid_json", cause: error });
      }
    }
    var requestBody = JSON.stringify(payload);
    var attempt = 0;
    function runFetch() {
      attempt += 1;
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () {
        controller.abort();
      }, PORTABLE_FETCH_TIMEOUT_MS) : null;
      return fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: requestBody,
        signal: controller ? controller.signal : undefined
      })
        .then(function (response) {
          if (timeoutId) clearTimeout(timeoutId);
          if (!response.ok) {
            throw createPortableError("HTTP " + response.status, { code: "http_error", status: response.status, retriable: response.status >= 500 });
          }
          return response.text();
        })
        .then(function (text) {
          try {
            return parseResponseText(text);
          } catch (error) {
            throw createPortableError(describeInvalidJsonResponse(text), { code: "invalid_json", cause: error });
          }
        })
        .catch(function (error) {
          if (timeoutId) clearTimeout(timeoutId);
          var normalized = normalizePortableError(error);
          if (normalized.name === "AbortError") {
            normalized = createPortableError("Request timed out.", { code: "timeout", retriable: true, cause: error });
          }
          if (attempt <= PORTABLE_FETCH_RETRY_COUNT && isRetriablePortableError(normalized)) {
            return runFetch();
          }
          throw normalized;
        });
    }
    return runFetch();
  }

  function buildLegacyRpcPayload(action, payload) {
    var normalizedAction = String(action || "").trim();
    var body = payload && typeof payload === "object" ? payload : {};
    return {
      action: "rpc",
      payload: {
        method: normalizedAction,
        args: Array.isArray(body.args) ? body.args : []
      }
    };
  }

  async function postAction(action, payload) {
    var requestPayload = {
      action: action,
      payload: payload || {}
    };
    var result = await sendRequest(requestPayload, false);
    if (!result.ok && String(result.error || "") === "unknown_action" && String(action || "").trim() !== "rpc") {
      result = await sendRequest(buildLegacyRpcPayload(action, payload), false);
    }
    if (!result.ok) {
      throw normalizePortableError(result.error);
    }
    return normalizePortableContractData(resolvePortableContractActionName(action, payload), result.data);
  }

  function postActionSync(action, payload) {
    var requestPayload = {
      action: action,
      payload: payload || {}
    };
    var result = sendRequest(requestPayload, true);
    if (!result.ok && String(result.error || "") === "unknown_action" && String(action || "").trim() !== "rpc") {
      result = sendRequest(buildLegacyRpcPayload(action, payload), true);
    }
    if (!result.ok) {
      throw normalizePortableError(result.error);
    }
    return normalizePortableContractData(resolvePortableContractActionName(action, payload), result.data);
  }

  function callPortableMethod(method, args) {
    return postAction(String(method || ""), {
      args: Array.isArray(args) ? args : []
    });
  }

  function callPortableMethodSync(method, args) {
    return postActionSync(String(method || ""), {
      args: Array.isArray(args) ? args : []
    });
  }

  function readEmptyStudentBootstrap() {
    return { students: [], shell: {} };
  }

  function bootstrapStudentAsync() {
    if (!getApiUrl()) {
      redirectToSetupIfNeeded();
      return Promise.resolve(readEmptyStudentBootstrap());
    }
    return callPortableMethod("getStudentEntrySummary", [{ shell: false }])
      .then(function (data) {
        if (!data || typeof data !== "object") return readEmptyStudentBootstrap();
        return data;
      });
  }

  function createRunner(successHandler, failureHandler) {
    var proxy = new Proxy(
      {},
      {
        get: function (_target, prop) {
          if (prop === "withSuccessHandler") {
            return function (handler) {
              return createRunner(handler, failureHandler);
            };
          }
          if (prop === "withFailureHandler") {
            return function (handler) {
              return createRunner(successHandler, handler);
            };
          }
          return function () {
            var args = Array.prototype.slice.call(arguments);
            callPortableMethod(String(prop), args)
              .then(function (data) {
                if (typeof successHandler === "function") {
                  successHandler(data);
                }
              })
              .catch(function (error) {
                if (typeof failureHandler === "function") {
                  failureHandler(normalizePortableError(error));
                  return;
                }
                console.error(error);
              });
          };
        }
      }
    );
    return proxy;
  }

  window.__portableGas = {
    getApiUrl: getApiUrl,
    setApiUrl: setApiUrl,
    validateApiUrl: validateApiUrl,
    postAction: postAction,
    postActionSync: postActionSync,
    callRpcSync: function (method) {
      var args = Array.prototype.slice.call(arguments, 1);
      return callPortableMethodSync(String(method), args);
    },
    cacheTeacherBootstrap: writeTeacherBootstrapCache,
    clearTeacherBootstrapCache: function () {
      clearJsonCache(TEACHER_BOOTSTRAP_CACHE_KEY);
    },
    bootstrapTeacher: function () {
      if (!getApiUrl()) {
        redirectToSetupIfNeeded();
        return { shell: {}, status: null, unitItems: [], recordItems: [] };
      }
      return readTeacherBootstrapCache();
    },
    bootstrapStudent: function () {
      if (!getApiUrl()) {
        redirectToSetupIfNeeded();
      }
      return readEmptyStudentBootstrap();
    },
    bootstrapStudentAsync: bootstrapStudentAsync
  };

  if (!window.google) {
    window.google = {};
  }
  if (!window.google.script) {
    window.google.script = {};
  }
  if (!window.google.script.run) {
    window.google.script.run = createRunner(null, null);
  }

  syncMemoryApiUrl();
})();




