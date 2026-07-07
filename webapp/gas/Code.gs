var FURIKAERU_WEBAPP_SHEETS = {
  responses: "Responses",
  config: "Config",
  audit: "AuditLog"
};

function doGet(e) {
  return handleWebappRequest_(e, "GET");
}

function doPost(e) {
  return handleWebappRequest_(e, "POST");
}

function handleWebappRequest_(e, method) {
  try {
    var request = parseWebappRequest_(e, method);
    var result = dispatchWebappAction_(request);
    return jsonWebappResponse_(true, result);
  } catch (error) {
    return jsonWebappResponse_(false, null, error);
  }
}

function parseWebappRequest_(e, method) {
  var params = (e && e.parameter) || {};
  var payload = {};

  if (method === "POST") {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    payload = raw ? JSON.parse(raw) : {};
  } else {
    payload = cloneWebappObject_(params);
    if (payload.payload) {
      payload.payload = JSON.parse(payload.payload);
    }
  }

  var action = String(payload.action || params.action || "").trim().toUpperCase();
  if (!action) {
    return {
      action: "__INFO__",
      payload: payload,
      method: method
    };
  }

  return {
    action: action,
    payload: payload,
    method: method
  };
}

function dispatchWebappAction_(request) {
  switch (request.action) {
    case "__INFO__":
      return {
        status: "ready",
        message: "Furikaeri webapp GAS endpoint is running.",
        supportedActions: [
          "PING",
          "SAVE_CONFIG",
          "GET_CONFIG",
          "SAVE_RESPONSE",
          "GET_RESPONSES"
        ],
        usage: {
          getPing: "?action=PING",
          postContentType: "text/plain;charset=utf-8"
        }
      };
    case "PING":
      return {
        status: "ok",
        time: new Date().toISOString()
      };
    case "SAVE_CONFIG":
      return saveWebappConfig_(request.payload);
    case "GET_CONFIG":
      return getWebappConfig_(request.payload);
    case "SAVE_RESPONSE":
      return saveWebappResponse_(request.payload);
    case "GET_RESPONSES":
      return getWebappResponses_(request.payload);
    default:
      throw new Error("Unsupported action: " + request.action);
  }
}

function saveWebappConfig_(payload) {
  var configKey = String(payload.configKey || "furikaeri_webapp_state");
  var configValue = payload.config || payload.value || {};
  var sheet = getOrCreateWebappSheet_(FURIKAERU_WEBAPP_SHEETS.config, [
    "configKey",
    "configJson",
    "updatedAt"
  ]);

  var values = sheet.getDataRange().getValues();
  var serialized = JSON.stringify(configValue);
  var updatedAt = new Date().toISOString();
  var updated = false;

  for (var i = 1; i < values.length; i += 1) {
    if (String(values[i][0]) === configKey) {
      sheet.getRange(i + 1, 1, 1, 3).setValues([[configKey, serialized, updatedAt]]);
      updated = true;
      break;
    }
  }

  if (!updated) {
    sheet.appendRow([configKey, serialized, updatedAt]);
  }

  appendWebappAuditLog_("SAVE_CONFIG", {
    configKey: configKey,
    bytes: serialized.length
  });

  return {
    status: updated ? "updated" : "created",
    configKey: configKey,
    updatedAt: updatedAt
  };
}

function getWebappConfig_(payload) {
  var configKey = String(payload.configKey || "furikaeri_webapp_state");
  var sheet = getOrCreateWebappSheet_(FURIKAERU_WEBAPP_SHEETS.config, [
    "configKey",
    "configJson",
    "updatedAt"
  ]);
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i += 1) {
    if (String(values[i][0]) === configKey) {
      return {
        configKey: configKey,
        config: parseWebappJsonSafe_(values[i][1], null),
        updatedAt: values[i][2] ? new Date(values[i][2]).toISOString() : null
      };
    }
  }

  return {
    configKey: configKey,
    config: null,
    updatedAt: null
  };
}

function saveWebappResponse_(payload) {
  validateWebappRequired_(payload, ["className", "date", "studentId"]);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error("Could not acquire lock within 10 seconds.");
  }

  try {
    var sheet = getOrCreateWebappSheet_(FURIKAERU_WEBAPP_SHEETS.responses, [
      "responseId",
      "submittedAt",
      "date",
      "className",
      "studentId",
      "studentName",
      "answersJson",
      "metaJson"
    ]);
    var responseId = payload.responseId || Utilities.getUuid();
    var submittedAt = new Date().toISOString();
    var answers = payload.answers || {};
    var meta = payload.meta || {};

    sheet.appendRow([
      responseId,
      submittedAt,
      String(payload.date),
      String(payload.className),
      String(payload.studentId),
      String(payload.studentName || ""),
      JSON.stringify(answers),
      JSON.stringify(meta)
    ]);

    appendWebappAuditLog_("SAVE_RESPONSE", {
      responseId: responseId,
      className: payload.className,
      date: payload.date,
      studentId: payload.studentId
    });

    return {
      status: "saved",
      responseId: responseId,
      submittedAt: submittedAt
    };
  } finally {
    lock.releaseLock();
  }
}

function getWebappResponses_(payload) {
  var sheet = getOrCreateWebappSheet_(FURIKAERU_WEBAPP_SHEETS.responses, [
    "responseId",
    "submittedAt",
    "date",
    "className",
    "studentId",
    "studentName",
    "answersJson",
    "metaJson"
  ]);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return {
      items: [],
      count: 0
    };
  }

  var headers = values[0];
  var dateFilter = normalizeWebappString_(payload.date);
  var classFilter = normalizeWebappString_(payload.className);
  var studentFilter = normalizeWebappString_(payload.studentId);
  var items = [];

  for (var i = 1; i < values.length; i += 1) {
    var row = rowToWebappObject_(headers, values[i]);
    if (dateFilter && row.date !== dateFilter) continue;
    if (classFilter && row.className !== classFilter) continue;
    if (studentFilter && row.studentId !== studentFilter) continue;

    items.push({
      responseId: row.responseId,
      submittedAt: row.submittedAt,
      date: row.date,
      className: row.className,
      studentId: row.studentId,
      studentName: row.studentName,
      answers: parseWebappJsonSafe_(row.answersJson, {}),
      meta: parseWebappJsonSafe_(row.metaJson, {})
    });
  }

  return {
    items: items,
    count: items.length
  };
}

function getOrCreateWebappSheet_(name, headers) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  if (sheet.getLastRow() === 0 && headers && headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function appendWebappAuditLog_(action, detail) {
  var sheet = getOrCreateWebappSheet_(FURIKAERU_WEBAPP_SHEETS.audit, [
    "loggedAt",
    "action",
    "detailJson"
  ]);
  sheet.appendRow([
    new Date().toISOString(),
    action,
    JSON.stringify(detail || {})
  ]);
}

function validateWebappRequired_(payload, keys) {
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    if (payload[key] === undefined || payload[key] === null || payload[key] === "") {
      throw new Error("Missing required field: " + key);
    }
  }
}

function rowToWebappObject_(headers, row) {
  var result = {};
  for (var i = 0; i < headers.length; i += 1) {
    result[String(headers[i])] = row[i];
  }
  return result;
}

function parseWebappJsonSafe_(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeWebappString_(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return String(value);
}

function cloneWebappObject_(source) {
  var result = {};
  for (var key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  }
  return result;
}

function jsonWebappResponse_(ok, data, error) {
  var body = {
    ok: ok,
    data: data || null,
    error: error
      ? {
          message: error.message || String(error),
          stack: error.stack || ""
        }
      : null,
    timestamp: new Date().toISOString()
  };

  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}
