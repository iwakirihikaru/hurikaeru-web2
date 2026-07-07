var MVP_SHEETS = {
  responses: "Responses",
  config: "Config",
  audit: "AuditLog"
};

function doGet(e) {
  return handleRequest_(e, "GET");
}

function doPost(e) {
  return handleRequest_(e, "POST");
}

function handleRequest_(e, method) {
  try {
    var request = parseRequest_(e, method);
    var result = dispatchAction_(request);
    return jsonResponse_(true, result);
  } catch (error) {
    return jsonResponse_(false, null, error);
  }
}

function parseRequest_(e, method) {
  var params = (e && e.parameter) || {};
  var payload = {};

  if (method === "POST") {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    payload = raw ? JSON.parse(raw) : {};
  } else {
    payload = cloneObject_(params);
    if (payload.payload) {
      payload.payload = JSON.parse(payload.payload);
    }
  }

  var action = String(payload.action || params.action || "").trim().toUpperCase();
  if (!action) {
    throw new Error("Missing action.");
  }

  return {
    action: action,
    payload: payload,
    method: method
  };
}

function dispatchAction_(request) {
  switch (request.action) {
    case "PING":
      return {
        status: "ok",
        time: new Date().toISOString()
      };
    case "SAVE_RESPONSE":
      return saveResponse_(request.payload);
    case "GET_RESPONSES":
      return getResponses_(request.payload);
    case "SAVE_CONFIG":
      return saveConfig_(request.payload);
    case "GET_CONFIG":
      return getConfig_(request.payload);
    case "CUSTOM_APPEND":
      return customAppend_(request.payload);
    default:
      throw new Error("Unsupported action: " + request.action);
  }
}

function saveResponse_(payload) {
  var required = ["className", "date", "studentId"];
  validateRequired_(payload, required);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error("Could not acquire lock within 10 seconds.");
  }

  try {
    var sheet = getOrCreateSheet_(MVP_SHEETS.responses, [
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

    appendAuditLog_("SAVE_RESPONSE", {
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

function getResponses_(payload) {
  var sheet = getOrCreateSheet_(MVP_SHEETS.responses, [
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
  var dateFilter = normalizeMaybeString_(payload.date);
  var classFilter = normalizeMaybeString_(payload.className);
  var studentFilter = normalizeMaybeString_(payload.studentId);

  var items = [];
  for (var i = 1; i < values.length; i += 1) {
    var row = rowToObject_(headers, values[i]);
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
      answers: parseJsonSafe_(row.answersJson, {}),
      meta: parseJsonSafe_(row.metaJson, {})
    });
  }

  return {
    items: items,
    count: items.length
  };
}

function saveConfig_(payload) {
  var configKey = String(payload.configKey || "app_config");
  var configValue = payload.config || payload.value || {};
  var sheet = getOrCreateSheet_(MVP_SHEETS.config, [
    "configKey",
    "configJson",
    "updatedAt"
  ]);

  var values = sheet.getDataRange().getValues();
  var updatedAt = new Date().toISOString();
  var serialized = JSON.stringify(configValue);
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

  appendAuditLog_("SAVE_CONFIG", {
    configKey: configKey
  });

  return {
    status: updated ? "updated" : "created",
    configKey: configKey,
    updatedAt: updatedAt
  };
}

function getConfig_(payload) {
  var configKey = String(payload.configKey || "app_config");
  var sheet = getOrCreateSheet_(MVP_SHEETS.config, [
    "configKey",
    "configJson",
    "updatedAt"
  ]);
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i += 1) {
    if (String(values[i][0]) === configKey) {
      return {
        configKey: configKey,
        config: parseJsonSafe_(values[i][1], {}),
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

function customAppend_(payload) {
  validateRequired_(payload, ["sheetName", "rowData"]);
  if (!Array.isArray(payload.rowData)) {
    throw new Error("rowData must be an array.");
  }

  var sheetName = String(payload.sheetName).trim();
  if (!sheetName) {
    throw new Error("sheetName must not be empty.");
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(sheetName);
  }

  sheet.appendRow(payload.rowData);
  appendAuditLog_("CUSTOM_APPEND", {
    sheetName: sheetName,
    size: payload.rowData.length
  });

  return {
    status: "appended",
    sheetName: sheetName,
    appendedColumns: payload.rowData.length
  };
}

function getOrCreateSheet_(name, headers) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  var hasHeader = sheet.getLastRow() > 0;
  if (!hasHeader && headers && headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function appendAuditLog_(action, detail) {
  var sheet = getOrCreateSheet_(MVP_SHEETS.audit, [
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

function validateRequired_(payload, keys) {
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    if (payload[key] === undefined || payload[key] === null || payload[key] === "") {
      throw new Error("Missing required field: " + key);
    }
  }
}

function rowToObject_(headers, row) {
  var result = {};
  for (var i = 0; i < headers.length; i += 1) {
    result[String(headers[i])] = row[i];
  }
  return result;
}

function parseJsonSafe_(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeMaybeString_(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return String(value);
}

function cloneObject_(source) {
  var result = {};
  for (var key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  }
  return result;
}

function jsonResponse_(ok, data, error) {
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
