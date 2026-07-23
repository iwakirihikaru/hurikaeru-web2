const POC_SHARED_SECRET = __POC_SHARED_SECRET_JSON__;
const POC_TEST_SHEET_NAME = __POC_TEST_SHEET_NAME_JSON__;
const POC_SERVICE_NAME = 'hurikaeru-onboarding-poc';

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseJsonBody(event) {
  const body = event?.postData?.contents;
  if (!body) {
    return {};
  }
  return JSON.parse(body);
}

function sanitizeTestValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, 64);
}

function doGet() {
  return jsonResponse({
    ok: true,
    service: POC_SERVICE_NAME,
  });
}

function doPost(event) {
  let payload;
  try {
    payload = parseJsonBody(event);
  } catch (error) {
    return jsonResponse({ ok: false, error: 'invalid_json' });
  }

  if (payload?.secret !== POC_SHARED_SECRET) {
    return jsonResponse({ ok: false, error: 'unauthorized' });
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet ? spreadsheet.getSheetByName(POC_TEST_SHEET_NAME) : null;
  if (!sheet) {
    return jsonResponse({ ok: false, error: 'sheet_not_found' });
  }

  sheet.appendRow([
    new Date().toISOString(),
    'poc',
    sanitizeTestValue(payload?.testValue),
  ]);

  return jsonResponse({ ok: true });
}
