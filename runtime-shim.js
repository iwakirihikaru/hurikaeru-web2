(function () {
  var STORAGE_KEY = "GAS_API_URL";
  var memoryApiUrl = "";
  var REDIRECT_FLAG_KEY = "__portable_setup_redirecting__";

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

  function getErrorMessage(error) {
    if (!error) return "Unknown API error.";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    return String(error);
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
      throw new Error("GAS_API_URL is not set in localStorage.");
    }
    if (sync) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", apiUrl, false);
      xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");
      xhr.send(JSON.stringify(payload));
      if (xhr.status < 200 || xhr.status >= 300) {
        throw new Error("HTTP " + xhr.status);
      }
      return parseResponseText(xhr.responseText);
    }
    return fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.text();
      })
      .then(parseResponseText);
  }

  async function postAction(action, payload) {
    var result = await sendRequest({
      action: action,
      payload: payload || {}
    }, false);
    if (!result.ok) {
      throw new Error(getErrorMessage(result.error));
    }
    return result.data;
  }

  function postActionSync(action, payload) {
    var result = sendRequest({
      action: action,
      payload: payload || {}
    }, true);
    if (!result.ok) {
      throw new Error(getErrorMessage(result.error));
    }
    return result.data;
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
            postAction("rpc", {
              method: String(prop),
              args: args
            })
              .then(function (data) {
                if (typeof successHandler === "function") {
                  successHandler(data);
                }
              })
              .catch(function (error) {
                if (typeof failureHandler === "function") {
                  failureHandler(error && error.message ? error.message : String(error));
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
    postAction: postAction,
    postActionSync: postActionSync,
    callRpcSync: function (method) {
      var args = Array.prototype.slice.call(arguments, 1);
      return postActionSync("rpc", {
        method: String(method),
        args: args
      });
    },
    bootstrapTeacher: function () {
      if (!getApiUrl()) {
        redirectToSetupIfNeeded();
        return { shell: {}, status: null, unitItems: [], recordItems: [] };
      }
      return postActionSync("rpc", {
        method: "teacherInit",
        args: []
      }) || null;
    },
    bootstrapStudent: function () {
      if (!getApiUrl()) {
        redirectToSetupIfNeeded();
        return { students: [], shell: {} };
      }
      return postActionSync("rpc", {
        method: "getStudentEntryOptions",
        args: []
      }) || { students: [], shell: {} };
    }
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
