const MASTER_GAS_API_VERSION = '1.0';
const MASTER_GAS_API_GET_TEXT = 'Circle Master GAS API v1.0 is running. Use POST request.';
const MASTER_GAS_API_LOCK_TIMEOUT_MS = 0;
const MASTER_GAS_API_MAX_LIMIT = 500;
const MASTER_GAS_API_DEFAULT_LIMIT = 100;
const MASTER_GAS_API_ALLOWED_ACTIONS = Object.freeze({
  PING: true,
  APPEND_RECORD: true,
  GET_RECORDS: true,
  UPSERT_CONFIG: true,
  GET_CONFIG: true,
  UPSERT_MASTER: true,
  GET_MASTER: true,
  APPEND_LOG: true,
});
const MASTER_GAS_API_SHEETS = Object.freeze({
  RECORDS: 'Records',
  CONFIG: 'Config',
  MASTER: 'Master',
  LOGS: 'Logs',
});
const MASTER_GAS_API_HEADERS = Object.freeze({
  Records: ['recordId', 'recordType', 'classId', 'lessonId', 'studentId', 'studentNo', 'clientSubmitId', 'payloadJson', 'createdAt', 'updatedAt', 'source', 'appId', 'deleted'],
  Config: ['configKey', 'classId', 'configValueJson', 'updatedAt', 'updatedBy', 'appId'],
  Master: ['masterType', 'masterId', 'classId', 'payloadJson', 'updatedAt', 'updatedBy', 'appId', 'deleted'],
  Logs: ['logId', 'level', 'eventType', 'message', 'payloadJson', 'createdAt', 'appId', 'source'],
});

function isMasterGasApiAction_(action) {
  return Boolean(MASTER_GAS_API_ALLOWED_ACTIONS[String(action || '').trim()]);
}

function shouldServeMasterGasApiInfo_(e) {
  const params = (e && e.parameter) || {};
  const mode = String(params.mode || '').trim().toLowerCase();
  const api = String(params.api || '').trim().toLowerCase();
  const apiVersion = String(params.apiVersion || '').trim();
  return mode === 'masterapi'
    || mode === 'master-gas-api'
    || api === 'master'
    || api === 'v1'
    || apiVersion === MASTER_GAS_API_VERSION;
}

function textOutput_(text) {
  return ContentService
    .createTextOutput(String(text || ''))
    .setMimeType(ContentService.MimeType.TEXT);
}

function tryHandleMasterGasApiPost_(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const action = String(payload.action || '').trim();
  const apiVersion = String(payload.apiVersion || '').trim();
  const looksLikeMasterRequest = apiVersion === MASTER_GAS_API_VERSION || isMasterGasApiAction_(action);
  if (!looksLikeMasterRequest) return null;
  return handleMasterGasApiRequest_(payload);
}

function handleMasterGasApiRequest_(body) {
  const action = String(body.action || '').trim();
  try {
    if (body && body.__parseError) {
      return masterGasApiErrorResponse_(action, 'INVALID_JSON', 'Request body must be valid JSON.');
    }
    validateMasterGasApiEnvelope_(body);
    ensureMasterGasApiSheets_();
    const handler = getMasterGasApiActionHandler_(action);
    const data = handler(body.payload || {}, body);
    return masterGasApiSuccessResponse_(action, data);
  } catch (err) {
    return masterGasApiExceptionResponse_(action, err);
  }
}

function validateMasterGasApiEnvelope_(body) {
  const action = String(body.action || '').trim();
  const appId = String(body.appId || '').trim();
  const apiVersion = String(body.apiVersion || '').trim();
  const requestId = String(body.requestId || '').trim();
  const payload = body.payload;
  if (!action) throw masterGasApiError_('INVALID_REQUEST', 'action is required.');
  if (!isMasterGasApiAction_(action)) throw masterGasApiError_('UNSUPPORTED_ACTION', `Unsupported action: ${action}`);
  if (!appId) throw masterGasApiError_('INVALID_REQUEST', 'appId is required.');
  if (apiVersion !== MASTER_GAS_API_VERSION) throw masterGasApiError_('INVALID_REQUEST', `apiVersion must be ${MASTER_GAS_API_VERSION}.`);
  if (!requestId) throw masterGasApiError_('INVALID_REQUEST', 'requestId is required.');
  if (payload == null || Array.isArray(payload) || typeof payload !== 'object') {
    throw masterGasApiError_('INVALID_REQUEST', 'payload must be an object.');
  }
}

function getMasterGasApiActionHandler_(action) {
  switch (String(action || '').trim()) {
    case 'PING':
      return handleMasterGasApiPing_;
    case 'APPEND_RECORD':
      return handleMasterGasApiAppendRecord_;
    case 'GET_RECORDS':
      return handleMasterGasApiGetRecords_;
    case 'UPSERT_CONFIG':
      return handleMasterGasApiUpsertConfig_;
    case 'GET_CONFIG':
      return handleMasterGasApiGetConfig_;
    case 'UPSERT_MASTER':
      return handleMasterGasApiUpsertMaster_;
    case 'GET_MASTER':
      return handleMasterGasApiGetMaster_;
    case 'APPEND_LOG':
      return handleMasterGasApiAppendLog_;
    default:
      throw masterGasApiError_('UNSUPPORTED_ACTION', `Unsupported action: ${action}`);
  }
}

function handleMasterGasApiPing_(_payload, body) {
  return {
    message: 'pong',
    requestId: String(body.requestId || '').trim(),
    appId: String(body.appId || '').trim(),
  };
}

function handleMasterGasApiAppendRecord_(payload, body) {
  const row = buildMasterGasApiRecordRow_(payload, body);
  return withMasterGasApiDocumentLock_(function() {
    const sheet = getMasterGasApiSheetByName_(MASTER_GAS_API_SHEETS.RECORDS);
    const rowNumber = appendMasterGasApiRow_(sheet, row);
    return {
      recordId: row[0],
      rowNumber,
    };
  });
}

function handleMasterGasApiGetRecords_(payload, body) {
  const filter = payload && typeof payload === 'object' ? payload : {};
  const appId = String(body.appId || '').trim();
  const hasSpecificFilter = Boolean(
    String(filter.recordType || '').trim()
    || String(filter.classId || '').trim()
    || String(filter.lessonId || '').trim()
    || String(filter.studentId || '').trim()
    || String(filter.studentNo || '').trim()
    || String(filter.since || '').trim()
  );
  if (!hasSpecificFilter) {
    throw masterGasApiError_('VALIDATION_ERROR', 'GET_RECORDS requires at least one specific filter.');
  }
  const limit = normalizeMasterGasApiLimit_(filter.limit);
  const includeDeleted = Boolean(filter.includeDeleted);
  const rows = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.RECORDS, MASTER_GAS_API_HEADERS.Records);
  const items = rows
    .map(mapMasterGasApiRecordRow_)
    .filter(item => item.appId === appId)
    .filter(item => !filter.recordType || item.recordType === String(filter.recordType))
    .filter(item => !filter.classId || item.classId === String(filter.classId))
    .filter(item => !filter.lessonId || item.lessonId === String(filter.lessonId))
    .filter(item => !filter.studentId || item.studentId === String(filter.studentId))
    .filter(item => !filter.studentNo || item.studentNo === String(filter.studentNo))
    .filter(item => !filter.since || String(item.updatedAt || item.createdAt || '') >= String(filter.since))
    .filter(item => includeDeleted || item.deleted !== true)
    .slice(0, limit);
  return {
    items,
    count: items.length,
    limit,
  };
}

function handleMasterGasApiUpsertConfig_(payload, body) {
  const configKey = requireMasterGasApiString_(payload.configKey, 'configKey');
  const classId = nullableMasterGasApiString_(payload.classId);
  const updatedBy = nullableMasterGasApiString_(payload.updatedBy);
  const appId = String(body.appId || '').trim();
  const now = masterGasApiNowIso_();
  const valueJson = stringifyMasterGasApiJson_(payload.configValue == null ? {} : payload.configValue);
  return withMasterGasApiDocumentLock_(function() {
    return upsertMasterGasApiConfigRow_(configKey, classId, valueJson, updatedBy, appId, now);
  });
}

function handleMasterGasApiGetConfig_(payload, body) {
  const filter = payload && typeof payload === 'object' ? payload : {};
  const appId = String(body.appId || '').trim();
  if (!String(filter.configKey || '').trim() && !String(filter.classId || '').trim()) {
    throw masterGasApiError_('VALIDATION_ERROR', 'GET_CONFIG requires configKey or classId.');
  }
  const rows = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.CONFIG, MASTER_GAS_API_HEADERS.Config);
  const items = rows
    .map(mapMasterGasApiConfigRow_)
    .filter(item => item.appId === appId)
    .filter(item => !filter.configKey || item.configKey === String(filter.configKey))
    .filter(item => !filter.classId || item.classId === String(filter.classId));
  return {
    items,
    count: items.length,
  };
}

function handleMasterGasApiUpsertMaster_(payload, body) {
  const masterType = requireMasterGasApiString_(payload.masterType, 'masterType');
  const masterId = requireMasterGasApiString_(payload.masterId, 'masterId');
  const classId = nullableMasterGasApiString_(payload.classId);
  const updatedBy = nullableMasterGasApiString_(payload.updatedBy);
  const appId = String(body.appId || '').trim();
  const now = masterGasApiNowIso_();
  const payloadJson = stringifyMasterGasApiJson_(payload.payload == null ? {} : payload.payload);
  const deleted = payload.deleted === true;
  return withMasterGasApiDocumentLock_(function() {
    return upsertMasterGasApiMasterRow_(masterType, masterId, classId, payloadJson, updatedBy, appId, deleted, now);
  });
}

function handleMasterGasApiGetMaster_(payload, body) {
  const filter = payload && typeof payload === 'object' ? payload : {};
  const appId = String(body.appId || '').trim();
  if (!String(filter.masterType || '').trim() && !String(filter.classId || '').trim() && !String(filter.masterId || '').trim()) {
    throw masterGasApiError_('VALIDATION_ERROR', 'GET_MASTER requires masterType, classId, or masterId.');
  }
  const limit = normalizeMasterGasApiLimit_(filter.limit);
  const includeDeleted = Boolean(filter.includeDeleted);
  const rows = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.MASTER, MASTER_GAS_API_HEADERS.Master);
  const items = rows
    .map(mapMasterGasApiMasterRow_)
    .filter(item => item.appId === appId)
    .filter(item => !filter.masterType || item.masterType === String(filter.masterType))
    .filter(item => !filter.classId || item.classId === String(filter.classId))
    .filter(item => !filter.masterId || item.masterId === String(filter.masterId))
    .filter(item => includeDeleted || item.deleted !== true)
    .slice(0, limit);
  return {
    items,
    count: items.length,
    limit,
  };
}

function handleMasterGasApiAppendLog_(payload, body) {
  const now = masterGasApiNowIso_();
  const row = [
    nullableMasterGasApiString_(payload.logId) || masterGasApiMakeId_('log'),
    requireMasterGasApiString_(payload.level, 'level'),
    requireMasterGasApiString_(payload.eventType, 'eventType'),
    nullableMasterGasApiString_(payload.message),
    stringifyMasterGasApiJson_(payload.payload == null ? {} : payload.payload),
    now,
    String(body.appId || '').trim(),
    nullableMasterGasApiString_(payload.source),
  ];
  return withMasterGasApiDocumentLock_(function() {
    const sheet = getMasterGasApiSheetByName_(MASTER_GAS_API_SHEETS.LOGS);
    const rowNumber = appendMasterGasApiRow_(sheet, row);
    return {
      logId: row[0],
      rowNumber,
      createdAt: now,
    };
  });
}

function buildMasterGasApiRecordRow_(payload, body) {
  const now = masterGasApiNowIso_();
  return [
    nullableMasterGasApiString_(payload.recordId) || masterGasApiMakeId_('rec'),
    requireMasterGasApiString_(payload.recordType, 'recordType'),
    nullableMasterGasApiString_(payload.classId),
    nullableMasterGasApiString_(payload.lessonId),
    nullableMasterGasApiString_(payload.studentId),
    nullableMasterGasApiString_(payload.studentNo),
    nullableMasterGasApiString_(payload.clientSubmitId),
    stringifyMasterGasApiJson_(payload.payload == null ? {} : payload.payload),
    now,
    now,
    nullableMasterGasApiString_(payload.source),
    String(body.appId || '').trim(),
    payload.deleted === true,
  ];
}

function ensureMasterGasApiSheets_() {
  ensureMasterGasApiSheet_(MASTER_GAS_API_SHEETS.RECORDS, MASTER_GAS_API_HEADERS.Records);
  ensureMasterGasApiSheet_(MASTER_GAS_API_SHEETS.CONFIG, MASTER_GAS_API_HEADERS.Config);
  ensureMasterGasApiSheet_(MASTER_GAS_API_SHEETS.MASTER, MASTER_GAS_API_HEADERS.Master);
  ensureMasterGasApiSheet_(MASTER_GAS_API_SHEETS.LOGS, MASTER_GAS_API_HEADERS.Logs);
}

function ensureMasterGasApiSheet_(sheetName, headers) {
  const ss = getTenantSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  const width = headers.length;
  const current = sheet.getLastRow() >= 1
    ? sheet.getRange(1, 1, 1, width).getValues()[0]
    : [];
  const isDifferent = headers.some((header, index) => String(current[index] || '') !== header);
  if (isDifferent) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
  }
  return sheet;
}

function getMasterGasApiSheetByName_(sheetName) {
  ensureMasterGasApiSheets_();
  const sheet = getTenantSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw masterGasApiError_('INTERNAL_ERROR', `Missing sheet: ${sheetName}`);
  return sheet;
}

function readMasterGasApiRows_(sheetName, headers) {
  const sheet = getMasterGasApiSheetByName_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
}

function appendMasterGasApiRow_(sheet, row) {
  const rowNumber = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  return rowNumber;
}

function withMasterGasApiDocumentLock_(callback) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(MASTER_GAS_API_LOCK_TIMEOUT_MS)) {
    throw masterGasApiError_('LOCK_TIMEOUT', 'Could not acquire lock.');
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function mapMasterGasApiRecordRow_(row) {
  return {
    recordId: String(row[0] || ''),
    recordType: String(row[1] || ''),
    classId: String(row[2] || ''),
    lessonId: String(row[3] || ''),
    studentId: String(row[4] || ''),
    studentNo: String(row[5] || ''),
    clientSubmitId: String(row[6] || ''),
    payloadJson: String(row[7] || ''),
    createdAt: String(row[8] || ''),
    updatedAt: String(row[9] || ''),
    source: String(row[10] || ''),
    appId: String(row[11] || ''),
    deleted: row[12] === true || String(row[12] || '').toLowerCase() === 'true',
  };
}

function mapMasterGasApiConfigRow_(row) {
  return {
    configKey: String(row[0] || ''),
    classId: String(row[1] || ''),
    configValueJson: String(row[2] || ''),
    updatedAt: String(row[3] || ''),
    updatedBy: String(row[4] || ''),
    appId: String(row[5] || ''),
  };
}

function mapMasterGasApiMasterRow_(row) {
  return {
    masterType: String(row[0] || ''),
    masterId: String(row[1] || ''),
    classId: String(row[2] || ''),
    payloadJson: String(row[3] || ''),
    updatedAt: String(row[4] || ''),
    updatedBy: String(row[5] || ''),
    appId: String(row[6] || ''),
    deleted: row[7] === true || String(row[7] || '').toLowerCase() === 'true',
  };
}

function upsertMasterGasApiConfigRow_(configKey, classId, valueJson, updatedBy, appId, now) {
  const sheet = getMasterGasApiSheetByName_(MASTER_GAS_API_SHEETS.CONFIG);
  const rows = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.CONFIG, MASTER_GAS_API_HEADERS.Config);
  let existingRowNumber = 0;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '') === configKey && String(rows[i][1] || '') === classId && String(rows[i][5] || '') === appId) {
      existingRowNumber = i + 2;
      break;
    }
  }
  const row = [configKey, classId, valueJson, now, updatedBy, appId];
  if (existingRowNumber > 0) {
    sheet.getRange(existingRowNumber, 1, 1, row.length).setValues([row]);
  } else {
    existingRowNumber = appendMasterGasApiRow_(sheet, row);
  }
  return {
    configKey,
    classId,
    updatedAt: now,
    rowNumber: existingRowNumber,
  };
}

function upsertMasterGasApiMasterRow_(masterType, masterId, classId, payloadJson, updatedBy, appId, deleted, now) {
  const sheet = getMasterGasApiSheetByName_(MASTER_GAS_API_SHEETS.MASTER);
  const rows = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.MASTER, MASTER_GAS_API_HEADERS.Master);
  let existingRowNumber = 0;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '') === masterType
      && String(rows[i][1] || '') === masterId
      && String(rows[i][2] || '') === classId
      && String(rows[i][6] || '') === appId) {
      existingRowNumber = i + 2;
      break;
    }
  }
  const row = [masterType, masterId, classId, payloadJson, now, updatedBy, appId, deleted];
  if (existingRowNumber > 0) {
    sheet.getRange(existingRowNumber, 1, 1, row.length).setValues([row]);
  } else {
    existingRowNumber = appendMasterGasApiRow_(sheet, row);
  }
  return {
    masterType,
    masterId,
    classId,
    deleted,
    updatedAt: now,
    rowNumber: existingRowNumber,
  };
}

function syncGlobalConfigEntryToMaster_(configKey, value, options) {
  const normalizedKey = String(configKey || '').trim();
  if (!normalizedKey) return null;
  const appId = String(options && options.appId || 'hurikaeru').trim() || 'hurikaeru';
  const updatedBy = String(options && options.updatedBy || 'legacy_sync').trim();
  const now = masterGasApiNowIso_();
  const valueJson = stringifyMasterGasApiJson_({ value: value == null ? '' : value });
  if (options && options.noLock) {
    return upsertMasterGasApiConfigRow_(normalizedKey, '', valueJson, updatedBy, appId, now);
  }
  return withMasterGasApiDocumentLock_(function() {
    return upsertMasterGasApiConfigRow_(normalizedKey, '', valueJson, updatedBy, appId, now);
  });
}

function syncGlobalConfigBatchToMaster_(valuesByKey, options) {
  const source = valuesByKey && typeof valuesByKey === 'object' ? valuesByKey : {};
  const keys = Object.keys(source).filter(key => String(key || '').trim());
  if (!keys.length) return { ok: true, updatedCount: 0, items: [] };
  const appId = String(options && options.appId || 'hurikaeru').trim() || 'hurikaeru';
  const updatedBy = String(options && options.updatedBy || 'legacy_sync').trim();
  return withMasterGasApiDocumentLock_(function() {
    const now = masterGasApiNowIso_();
    const items = keys.map(key => upsertMasterGasApiConfigRow_(
      String(key || '').trim(),
      '',
      stringifyMasterGasApiJson_({ value: source[key] == null ? '' : source[key] }),
      updatedBy,
      appId,
      now
    ));
    return {
      ok: true,
      updatedCount: items.length,
      items,
    };
  });
}

function syncRosterEntriesToMaster_(entries, options) {
  const list = Array.isArray(entries) ? entries : [];
  const appId = String(options && options.appId || 'hurikaeru').trim() || 'hurikaeru';
  const updatedBy = String(options && options.updatedBy || 'legacy_sync').trim();
  return withMasterGasApiDocumentLock_(function() {
    const now = masterGasApiNowIso_();
    const items = list
      .filter(entry => Number(entry && entry.number) > 0)
      .map(entry => {
        const studentId = String(entry.studentId || '').trim() || masterGasApiMakeId_('student');
        return upsertMasterGasApiMasterRow_(
          'roster',
          studentId,
          '',
          stringifyMasterGasApiJson_({
            studentId,
            studentNo: Number(entry.number) || 0,
            number: Number(entry.number) || 0,
            name: String(entry.name || '').trim(),
            active: entry.active !== false,
          }),
          updatedBy,
          appId,
          entry.active === false,
          now
        );
      });
    return {
      ok: true,
      updatedCount: items.length,
      items,
    };
  });
}

function syncUnitToMaster_(unit, options) {
  if (!(unit && unit.id)) return null;
  const appId = String(options && options.appId || 'hurikaeru').trim() || 'hurikaeru';
  const updatedBy = String(options && options.updatedBy || 'legacy_sync').trim();
  const payloadJson = stringifyMasterGasApiJson_({
    id: String(unit.id || '').trim(),
    name: String(unit.name || '').trim(),
    subject: String(unit.subject || '').trim(),
    maxPeriod: Number(unit.maxPeriod) || 0,
    createdAt: String(unit.createdAt || '').trim(),
    fields: Array.isArray(unit.fields) ? unit.fields : [],
  });
  if (options && options.noLock) {
    return upsertMasterGasApiMasterRow_(
      'unit',
      String(unit.id || '').trim(),
      '',
      payloadJson,
      updatedBy,
      appId,
      false,
      masterGasApiNowIso_()
    );
  }
  return withMasterGasApiDocumentLock_(function() {
    return upsertMasterGasApiMasterRow_(
      'unit',
      String(unit.id || '').trim(),
      '',
      payloadJson,
      updatedBy,
      appId,
      false,
      masterGasApiNowIso_()
    );
  });
}

function syncDeletedUnitToMaster_(unitId, options) {
  const normalizedUnitId = String(unitId || '').trim();
  if (!normalizedUnitId) return null;
  const appId = String(options && options.appId || 'hurikaeru').trim() || 'hurikaeru';
  const updatedBy = String(options && options.updatedBy || 'legacy_sync').trim();
  if (options && options.noLock) {
    return upsertMasterGasApiMasterRow_(
      'unit',
      normalizedUnitId,
      '',
      stringifyMasterGasApiJson_({ id: normalizedUnitId }),
      updatedBy,
      appId,
      true,
      masterGasApiNowIso_()
    );
  }
  return withMasterGasApiDocumentLock_(function() {
    return upsertMasterGasApiMasterRow_(
      'unit',
      normalizedUnitId,
      '',
      stringifyMasterGasApiJson_({ id: normalizedUnitId }),
      updatedBy,
      appId,
      true,
      masterGasApiNowIso_()
    );
  });
}

function syncUnitSheetDataToMaster_(options) {
  ensureMasterGasApiSheets_();
  const appId = String(options && options.appId || MASTER_GAS_API_APP_ID || 'hurikaeru').trim() || 'hurikaeru';
  const updatedBy = String(options && options.updatedBy || 'legacy_backfill').trim() || 'legacy_backfill';
  const allUnits = readUnitSheetRecords_();
  const deletedUnitIds = listDeletedUnitSheetIds_();
  return withMasterGasApiDocumentLock_(function() {
    const now = masterGasApiNowIso_();
    const unitItems = (Array.isArray(allUnits) ? allUnits : [])
      .filter(unit => String(unit && unit.id || '').trim())
      .map(unit => upsertMasterGasApiMasterRow_(
        'unit',
        String(unit.id || '').trim(),
        '',
        stringifyMasterGasApiJson_({
          id: String(unit.id || '').trim(),
          name: String(unit.name || '').trim(),
          subject: String(unit.subject || '').trim(),
          maxPeriod: Number(unit.maxPeriod) || 0,
          createdAt: String(unit.createdAt || '').trim(),
          fields: Array.isArray(unit.fields) ? unit.fields : [],
        }),
        updatedBy,
        appId,
        false,
        now
      ));
    const deletedUnitItems = deletedUnitIds.map(unitId => upsertMasterGasApiMasterRow_(
      'unit',
      unitId,
      '',
      stringifyMasterGasApiJson_({ id: unitId }),
      updatedBy,
      appId,
      true,
      now
    ));
    removeDomainCacheKeys_(getAllUnitsCacheKeys_());
    return {
      ok: true,
      syncedAt: now,
      unitCount: unitItems.length,
      deletedUnitCount: deletedUnitItems.length,
    };
  });
}

function syncMasterApiFromLegacy() {
  ensureMasterGasApiSheets_();
  const appId = String(MASTER_GAS_API_APP_ID || 'hurikaeru').trim() || 'hurikaeru';
  const legacyConfig = readGlobalConfig();
  const rosterEntries = getRosterEntries_(true);
  const allUnits = readUnitSheetRecords_();
  const deletedUnitIds = listDeletedUnitSheetIds_();
  const responseRows = getResponseSheetData_().rows;
  return withMasterGasApiDocumentLock_(function() {
    const now = masterGasApiNowIso_();
    const configKeys = Object.keys(legacyConfig || {}).filter(key => String(key || '').trim());
    const configItems = configKeys.map(key => upsertMasterGasApiConfigRow_(
      String(key || '').trim(),
      '',
      stringifyMasterGasApiJson_({ value: legacyConfig[key] == null ? '' : legacyConfig[key] }),
      'legacy_backfill',
      appId,
      now
    ));
    const rosterItems = (Array.isArray(rosterEntries) ? rosterEntries : [])
      .filter(entry => Number(entry && entry.number) > 0)
      .map(entry => {
        const studentId = String(entry.studentId || '').trim() || masterGasApiMakeId_('student');
        return upsertMasterGasApiMasterRow_(
          'roster',
          studentId,
          '',
          stringifyMasterGasApiJson_({
            studentId,
            studentNo: Number(entry.number) || 0,
            number: Number(entry.number) || 0,
            name: String(entry.name || '').trim(),
            active: entry.active !== false,
          }),
          'legacy_backfill',
          appId,
          entry.active === false,
          now
        );
      });
    const unitItems = (Array.isArray(allUnits) ? allUnits : [])
      .filter(unit => String(unit && unit.id || '').trim())
      .map(unit => upsertMasterGasApiMasterRow_(
        'unit',
        String(unit.id || '').trim(),
        '',
        stringifyMasterGasApiJson_({
          id: String(unit.id || '').trim(),
          name: String(unit.name || '').trim(),
          subject: String(unit.subject || '').trim(),
          maxPeriod: Number(unit.maxPeriod) || 0,
          createdAt: String(unit.createdAt || '').trim(),
          fields: Array.isArray(unit.fields) ? unit.fields : [],
        }),
        'legacy_backfill',
        appId,
        false,
        now
      ));
    const deletedUnitItems = deletedUnitIds.map(unitId => upsertMasterGasApiMasterRow_(
      'unit',
      unitId,
      '',
      stringifyMasterGasApiJson_({ id: unitId }),
      'legacy_backfill',
      appId,
      true,
      now
    ));
    const recordsSheet = getMasterGasApiSheetByName_(MASTER_GAS_API_SHEETS.RECORDS);
    const existingClientSubmitIds = {};
    readMasterGasApiRows_(MASTER_GAS_API_SHEETS.RECORDS, MASTER_GAS_API_HEADERS.Records)
      .map(mapMasterGasApiRecordRow_)
      .filter(item => item.appId === appId)
      .filter(item => item.recordType === MASTER_RESPONSE_RECORD_TYPE)
      .forEach(item => {
        const clientSubmitId = String(item.clientSubmitId || '').trim();
        if (clientSubmitId) existingClientSubmitIds[clientSubmitId] = true;
      });
    let skippedResponseCount = 0;
    const responseItems = (Array.isArray(responseRows) ? responseRows : [])
      .map(mapResponseRow_)
      .filter(response => String(response && response.lessonId || '').trim())
      .filter(response => String(response && response.studentId || '').trim() || String(response && response.studentNumber || '').trim())
      .filter(response => !isAiLoadTestResponse_(response))
      .map(response => {
        const payload = buildMasterResponseMirrorPayload_(response, 'legacy_backfill');
        const clientSubmitId = String(payload.clientSubmitId || '').trim();
        if (clientSubmitId && existingClientSubmitIds[clientSubmitId]) {
          skippedResponseCount++;
          return null;
        }
        const row = buildMasterGasApiRecordRow_(payload, { appId });
        const rowNumber = appendMasterGasApiRow_(recordsSheet, row);
        if (clientSubmitId) existingClientSubmitIds[clientSubmitId] = true;
        return {
          recordId: row[0],
          rowNumber,
          clientSubmitId,
        };
      })
      .filter(Boolean);
    return {
      ok: true,
      syncedAt: now,
      configCount: configItems.length,
      rosterCount: rosterItems.length,
      unitCount: unitItems.length,
      deletedUnitCount: deletedUnitItems.length,
      responseCount: responseItems.length,
      responseSkippedCount: skippedResponseCount,
    };
  });
}

function listDeletedUnitSheetIds_() {
  const sheet = getUnitSheet();
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const activeIds = {};
  data.slice(1).forEach(row => {
    const id = String(row[0] || '').trim();
    const deletedFlag = String(row[6] || '').trim();
    if (id && deletedFlag !== '削除') activeIds[id] = true;
  });
  return data.slice(1)
    .filter(row => {
      const id = String(row[0] || '').trim();
      return id && String(row[6] || '').trim() === '削除' && !activeIds[id];
    })
    .map(row => String(row[0] || '').trim());
}

function listMasterGasApiConfigItems_(appId, filter) {
  const normalizedAppId = String(appId || '').trim();
  const normalizedFilter = filter && typeof filter === 'object' ? filter : {};
  const rows = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.CONFIG, MASTER_GAS_API_HEADERS.Config);
  return rows
    .map(mapMasterGasApiConfigRow_)
    .filter(item => !normalizedAppId || item.appId === normalizedAppId)
    .filter(item => !normalizedFilter.configKey || item.configKey === String(normalizedFilter.configKey))
    .filter(item => !normalizedFilter.classId || item.classId === String(normalizedFilter.classId));
}

function listMasterGasApiMasterItems_(appId, filter) {
  const normalizedAppId = String(appId || '').trim();
  const normalizedFilter = filter && typeof filter === 'object' ? filter : {};
  const includeDeleted = normalizedFilter.includeDeleted === true;
  const rows = readMasterGasApiRows_(MASTER_GAS_API_SHEETS.MASTER, MASTER_GAS_API_HEADERS.Master);
  return rows
    .map(mapMasterGasApiMasterRow_)
    .filter(item => !normalizedAppId || item.appId === normalizedAppId)
    .filter(item => !normalizedFilter.masterType || item.masterType === String(normalizedFilter.masterType))
    .filter(item => !normalizedFilter.classId || item.classId === String(normalizedFilter.classId))
    .filter(item => !normalizedFilter.masterId || item.masterId === String(normalizedFilter.masterId))
    .filter(item => includeDeleted || item.deleted !== true);
}

function getMasterGasApiRecordSnapshot_(appId, filter) {
  ensureMasterGasApiSheets_();
  return handleMasterGasApiGetRecords_(
    filter && typeof filter === 'object' ? filter : {},
    { appId: String(appId || '').trim() || String(MASTER_GAS_API_APP_ID || 'hurikaeru').trim() || 'hurikaeru' }
  );
}

function getMasterGasApiMasterSnapshot_(appId, filter) {
  ensureMasterGasApiSheets_();
  return handleMasterGasApiGetMaster_(
    filter && typeof filter === 'object' ? filter : {},
    { appId: String(appId || '').trim() || String(MASTER_GAS_API_APP_ID || 'hurikaeru').trim() || 'hurikaeru' }
  );
}

function normalizeMasterGasApiLimit_(raw) {
  const value = Number(raw);
  if (!isFinite(value) || value <= 0) return MASTER_GAS_API_DEFAULT_LIMIT;
  return Math.min(MASTER_GAS_API_MAX_LIMIT, Math.floor(value));
}

function requireMasterGasApiString_(value, fieldName) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) throw masterGasApiError_('VALIDATION_ERROR', `${fieldName} is required.`);
  return normalized;
}

function nullableMasterGasApiString_(value) {
  return String(value == null ? '' : value).trim();
}

function stringifyMasterGasApiJson_(value) {
  try {
    return JSON.stringify(value == null ? null : value);
  } catch (_err) {
    throw masterGasApiError_('VALIDATION_ERROR', 'JSON serialization failed.');
  }
}

function masterGasApiSuccessResponse_(action, data) {
  return {
    ok: true,
    action: String(action || '').trim(),
    apiVersion: MASTER_GAS_API_VERSION,
    serverTime: masterGasApiNowIso_(),
    data: data == null ? {} : data,
    error: null,
  };
}

function masterGasApiErrorResponse_(action, code, message) {
  return {
    ok: false,
    action: String(action || '').trim(),
    apiVersion: MASTER_GAS_API_VERSION,
    serverTime: masterGasApiNowIso_(),
    data: null,
    error: {
      code: String(code || 'INTERNAL_ERROR'),
      message: String(message || 'Unknown error.'),
    },
  };
}

function masterGasApiExceptionResponse_(action, err) {
  if (err && err.masterGasApiCode) {
    return masterGasApiErrorResponse_(action, err.masterGasApiCode, err.message);
  }
  return masterGasApiErrorResponse_(action, 'INTERNAL_ERROR', err && err.message ? err.message : String(err || 'Unknown error.'));
}

function masterGasApiError_(code, message) {
  const err = new Error(message);
  err.masterGasApiCode = code;
  return err;
}

function masterGasApiNowIso_() {
  return new Date().toISOString();
}

function masterGasApiMakeId_(prefix) {
  return `${String(prefix || 'id')}_${Utilities.getUuid()}`;
}

