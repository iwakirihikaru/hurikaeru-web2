(function () {
  var STORAGE_KEYS = {
    apiUrl: "GAS_API_URL",
    studentDraft: "FURIKAERU_MVP_STUDENT_DRAFT",
    studentStatus: "FURIKAERU_MVP_STUDENT_STATUS"
  };
  var memoryStorage = {};

  function getStorage() {
    try {
      if (window && window.localStorage) {
        var probeKey = "__furikaeru_mvp_probe__";
        window.localStorage.setItem(probeKey, "1");
        window.localStorage.removeItem(probeKey);
        return window.localStorage;
      }
    } catch (error) {
    }

    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(memoryStorage, key)
          ? memoryStorage[key]
          : null;
      },
      setItem: function (key, value) {
        memoryStorage[key] = String(value);
      },
      removeItem: function (key) {
        delete memoryStorage[key];
      }
    };
  }

  function getApiUrl() {
    return getStorage().getItem(STORAGE_KEYS.apiUrl) || "";
  }

  function setApiUrl(url) {
    getStorage().setItem(STORAGE_KEYS.apiUrl, String(url || "").trim());
  }

  async function callApi(payload) {
    var apiUrl = getApiUrl();
    if (!apiUrl) {
      throw new Error("GAS API URL is not set.");
    }

    var response = await window.fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Request failed with status " + response.status + ".");
    }

    var result = await response.json();
    if (!result.ok) {
      throw new Error(result.error && result.error.message ? result.error.message : "Unknown API error.");
    }
    return result.data;
  }

  async function pingApi() {
    return callApi({ action: "PING" });
  }

  function getStudentDraft() {
    var raw = getStorage().getItem(STORAGE_KEYS.studentDraft);
    if (!raw) return defaultStudentDraft();
    try {
      return Object.assign(defaultStudentDraft(), JSON.parse(raw));
    } catch (error) {
      return defaultStudentDraft();
    }
  }

  function saveStudentDraft(draft) {
    getStorage().setItem(STORAGE_KEYS.studentDraft, JSON.stringify(draft));
  }

  function clearStudentDraft() {
    getStorage().removeItem(STORAGE_KEYS.studentDraft);
  }

  function hasApiUrlConfigured() {
    return Boolean(getApiUrl());
  }

  function updateSetupNotice(page) {
    var notice = document.getElementById("setup-required-notice");
    if (!notice) return hasApiUrlConfigured();
    if (hasApiUrlConfigured()) {
      notice.hidden = true;
      return true;
    }
    notice.hidden = false;
    var pageLabel = page === "teacher" ? "先生画面" : "児童画面";
    var message = notice.querySelector("[data-role='message']");
    if (message) {
      message.textContent = pageLabel + "を使う前に、設定画面で GAS API URL を保存してください。";
    }
    return false;
  }

  function defaultStudentDraft() {
    return {
      className: "",
      date: todayString(),
      studentId: "",
      studentName: "",
      answers: {
        reflection: ""
      }
    };
  }

  function normalizeConfig(config) {
    var safe = config && typeof config === "object" ? config : {};
    return {
      className: String(safe.className || ""),
      roster: Array.isArray(safe.roster)
        ? safe.roster.map(function (item) {
            return {
              id: String(item && item.id || ""),
              name: String(item && item.name || "")
            };
          }).filter(function (item) {
            return item.id || item.name;
          })
        : []
    };
  }

  function parseRosterText(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean)
      .map(function (line) {
        var match = line.match(/^(\S+)\s+(.+)$/);
        if (match) {
          return {
            id: match[1],
            name: match[2]
          };
        }
        return {
          id: line,
          name: ""
        };
      });
  }

  function rosterToText(roster) {
    return (roster || [])
      .map(function (item) {
        return item.name ? item.id + " " + item.name : item.id;
      })
      .join("\n");
  }

  function todayString() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, "0");
    var day = String(now.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  async function submitStudentResponse(draft) {
    var jitterMs = Math.floor(Math.random() * 5000);
    await sleep(jitterMs);

    var payload = {
      action: "SAVE_RESPONSE",
      responseId: cryptoRandomId(),
      className: draft.className,
      date: draft.date,
      studentId: draft.studentId,
      studentName: draft.studentName,
      answers: draft.answers,
      meta: {
        jitterMs: jitterMs,
        clientSentAt: new Date().toISOString()
      }
    };

    return callApi(payload);
  }

  async function fetchResponses(filters) {
    return callApi(
      Object.assign(
        {
          action: "GET_RESPONSES"
        },
        filters || {}
      )
    );
  }

  async function saveConfig(config, configKey) {
    return callApi({
      action: "SAVE_CONFIG",
      configKey: configKey || "app_config",
      config: config
    });
  }

  async function getConfig(configKey) {
    return callApi({
      action: "GET_CONFIG",
      configKey: configKey || "app_config"
    });
  }

  function cryptoRandomId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "mvp-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
  }

  function mountSetupPage() {
    var form = document.getElementById("setup-form");
    if (!form) return;

    var apiInput = document.getElementById("api-url");
    var status = document.getElementById("setup-status");
    var saveButton = document.getElementById("setup-save");
    var testButton = document.getElementById("setup-test");

    var params = new URLSearchParams(window.location.search);
    var apiFromQuery = params.get("api");
    var savedUrl = getApiUrl();
    apiInput.value = apiFromQuery || savedUrl;

    if (apiFromQuery) {
      setApiUrl(apiFromQuery);
      setStatus(status, "URL を保存しました。接続テストを実行してください。", "info");
    }

    saveButton.addEventListener("click", function () {
      var url = apiInput.value.trim();
      if (!url) {
        setStatus(status, "GAS API URL を入力してください。", "error");
        return;
      }
      setApiUrl(url);
      setStatus(status, "保存しました。", "success");
    });

    testButton.addEventListener("click", async function () {
      try {
        testButton.disabled = true;
        setApiUrl(apiInput.value.trim());
        setStatus(status, "接続を確認しています...", "info");
        var result = await pingApi();
        setStatus(status, "接続成功: " + result.time, "success");
      } catch (error) {
        setStatus(status, "接続失敗: " + error.message, "error");
      } finally {
        testButton.disabled = false;
      }
    });
  }

  function mountStudentPage() {
    var form = document.getElementById("student-form");
    if (!form) return;

    var draft = getStudentDraft();
    var status = document.getElementById("student-status");
    var submitButton = document.getElementById("student-submit");
    var retryButton = document.getElementById("student-retry");
    var successBox = document.getElementById("student-success");
    var classHint = document.getElementById("student-class-hint");
    var studentList = document.getElementById("student-roster-list");
    var setupReady = updateSetupNotice("student");

    if (!setupReady) {
      submitButton.disabled = true;
      if (classHint) {
        classHint.textContent = "先に設定画面で GAS API URL を保存してください。";
      }
    }

    bindFieldValue("student-class", draft.className, function (value) {
      draft.className = value;
      saveStudentDraft(draft);
    });
    bindFieldValue("student-date", draft.date, function (value) {
      draft.date = value;
      saveStudentDraft(draft);
    });
    bindFieldValue("student-id", draft.studentId, function (value) {
      draft.studentId = value;
      saveStudentDraft(draft);
    });
    bindFieldValue("student-name", draft.studentName, function (value) {
      draft.studentName = value;
      saveStudentDraft(draft);
    });
    bindFieldValue("student-reflection", draft.answers.reflection, function (value) {
      draft.answers.reflection = value;
      saveStudentDraft(draft);
    });

    if (!setupReady) {
      return;
    }

    getConfig("app_config")
      .then(function (result) {
        var config = normalizeConfig(result && result.config);
        if (!draft.className && config.className) {
          draft.className = config.className;
          document.getElementById("student-class").value = config.className;
          saveStudentDraft(draft);
        }
        if (classHint) {
          classHint.textContent = config.className
            ? "設定済みクラス: " + config.className
            : "先生画面でクラス設定を保存すると、ここに既定値が入ります。";
        }
        renderRosterOptions(studentList, config.roster, draft, function () {
          saveStudentDraft(draft);
        });
      })
      .catch(function () {
        if (classHint) {
          classHint.textContent = "クラス設定を読み込めませんでした。手入力で続けてください。";
        }
      });

    async function runSubmit() {
      try {
        submitButton.disabled = true;
        retryButton.hidden = true;
        successBox.hidden = true;
        setStatus(status, "送信中...", "info");
        var result = await submitStudentResponse(draft);
        clearStudentDraft();
        setStatus(status, "提出できました。", "success");
        successBox.hidden = false;
        form.reset();
        draft = defaultStudentDraft();
        document.getElementById("student-date").value = draft.date;
      } catch (error) {
        setStatus(status, "通信に失敗しました。入力内容は残っています。 " + error.message, "error");
        retryButton.hidden = false;
      } finally {
        submitButton.disabled = false;
      }
    }

    submitButton.addEventListener("click", function (event) {
      event.preventDefault();
      runSubmit();
    });

    retryButton.addEventListener("click", function (event) {
      event.preventDefault();
      runSubmit();
    });
  }

  function mountTeacherPage() {
    var form = document.getElementById("teacher-filter-form");
    if (!form) return;

    var classInput = document.getElementById("teacher-class");
    var dateInput = document.getElementById("teacher-date");
    var refreshButton = document.getElementById("teacher-refresh");
    var status = document.getElementById("teacher-status");
    var list = document.getElementById("teacher-list");
    var count = document.getElementById("teacher-count");
    var timerId = null;
    var configClass = document.getElementById("config-class-name");
    var configRoster = document.getElementById("config-roster");
    var configSave = document.getElementById("config-save");
    var configLoad = document.getElementById("config-load");
    var configStatus = document.getElementById("config-status");
    var setupReady = updateSetupNotice("teacher");

    dateInput.value = todayString();
    if (!setupReady) {
      refreshButton.disabled = true;
      if (configSave) configSave.disabled = true;
      if (configLoad) configLoad.disabled = true;
      setStatus(status, "設定画面で GAS API URL を保存すると、この画面が使えます。", "error");
      setStatus(configStatus, "先に設定画面を完了してください。", "error");
      return;
    }

    function applyConfigToFilters(config) {
      if (config.className && !classInput.value.trim()) {
        classInput.value = config.className;
      }
      if (configClass) {
        configClass.value = config.className;
      }
      if (configRoster) {
        configRoster.value = rosterToText(config.roster);
      }
    }

    async function loadConfigIntoPage() {
      try {
        if (configLoad) configLoad.disabled = true;
        setStatus(configStatus, "設定を読み込んでいます...", "info");
        var result = await getConfig("app_config");
        var config = normalizeConfig(result && result.config);
        applyConfigToFilters(config);
        setStatus(configStatus, "設定を読み込みました。", "success");
      } catch (error) {
        setStatus(configStatus, "設定読込失敗: " + error.message, "error");
      } finally {
        if (configLoad) configLoad.disabled = false;
      }
    }

    async function loadResponses() {
      try {
        refreshButton.disabled = true;
        setStatus(status, "一覧を更新しています...", "info");
        var result = await fetchResponses({
          className: classInput.value.trim(),
          date: dateInput.value.trim()
        });
        window.FurikaeruMvp.renderTeacherList(list, result.items);
        count.textContent = String(result.count);
        setStatus(status, "更新しました。", "success");
      } catch (error) {
        setStatus(status, "更新失敗: " + error.message, "error");
      } finally {
        refreshButton.disabled = false;
      }
    }

    refreshButton.addEventListener("click", function (event) {
      event.preventDefault();
      loadResponses();
    });

    if (configSave) {
      configSave.addEventListener("click", async function () {
        try {
          configSave.disabled = true;
          setStatus(configStatus, "設定を保存しています...", "info");
          var config = {
            className: configClass.value.trim(),
            roster: parseRosterText(configRoster.value)
          };
          await saveConfig(config, "app_config");
          if (!classInput.value.trim()) {
            classInput.value = config.className;
          }
          setStatus(configStatus, "設定を保存しました。", "success");
        } catch (error) {
          setStatus(configStatus, "設定保存失敗: " + error.message, "error");
        } finally {
          configSave.disabled = false;
        }
      });
    }

    if (configLoad) {
      configLoad.addEventListener("click", function () {
        loadConfigIntoPage();
      });
    }

    loadConfigIntoPage().finally(loadResponses);
    timerId = window.setInterval(loadResponses, 30000);
    window.addEventListener("beforeunload", function () {
      if (timerId) {
        window.clearInterval(timerId);
      }
    });
  }

  function bindFieldValue(id, initialValue, onChange) {
    var field = document.getElementById(id);
    if (!field) return;
    field.value = initialValue || "";
    field.addEventListener("input", function (event) {
      onChange(event.target.value);
    });
  }

  function setStatus(node, message, tone) {
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone || "info";
  }

  function renderTeacherList(node, items) {
    if (!node) return;
    node.innerHTML = "";

    if (!items.length) {
      var empty = document.createElement("li");
      empty.textContent = "まだ提出はありません。";
      node.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var li = document.createElement("li");
      var text = item.studentName || item.studentId;
      li.textContent = text + " / " + item.submittedAt + " / " + ((item.answers && item.answers.reflection) || "");
      node.appendChild(li);
    });
  }

  function renderRosterOptions(node, roster, draft, onPick) {
    if (!node) return;
    node.innerHTML = "";
    if (!roster || !roster.length) {
      var empty = document.createElement("p");
      empty.className = "tl-empty";
      empty.textContent = "先生画面で名簿を保存すると、ここに選択肢が出ます。";
      node.appendChild(empty);
      return;
    }

    roster.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "tip";
      button.textContent = item.id + (item.name ? " " + item.name : "");
      button.addEventListener("click", function () {
        draft.studentId = item.id;
        draft.studentName = item.name;
        document.getElementById("student-id").value = item.id;
        document.getElementById("student-name").value = item.name;
        if (onPick) onPick();
      });
      node.appendChild(button);
    });
  }

  window.FurikaeruMvp = {
    getApiUrl: getApiUrl,
    setApiUrl: setApiUrl,
    callApi: callApi,
    pingApi: pingApi,
    getStudentDraft: getStudentDraft,
    saveStudentDraft: saveStudentDraft,
    clearStudentDraft: clearStudentDraft,
    submitStudentResponse: submitStudentResponse,
    fetchResponses: fetchResponses,
    saveConfig: saveConfig,
    getConfig: getConfig,
    renderTeacherList: renderTeacherList,
    mountSetupPage: mountSetupPage,
    mountStudentPage: mountStudentPage,
    mountTeacherPage: mountTeacherPage
  };

  document.addEventListener("DOMContentLoaded", function () {
    mountSetupPage();
    mountStudentPage();
    mountTeacherPage();
  });
})();
