import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

import {
  buildCodeSource,
  buildManifestSource,
  extractWebAppUrl,
  parseDesktopCredentials,
  validateConfig,
} from './poc-drive-install.mjs';

const codeTemplatePath = new URL('./poc-script/Code.js', import.meta.url);
const manifestTemplatePath = new URL('./poc-script/appsscript.json', import.meta.url);

async function loadTemplate(url) {
  return readFile(url, 'utf8');
}

function runGasFunction(source, functionName, { event } = {}) {
  const appendedRows = [];
  const sandbox = {
    JSON,
    Date,
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) {
        return {
          text,
          mimeType: null,
          setMimeType(value) {
            this.mimeType = value;
            return this;
          },
        };
      },
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName(name) {
            if (name !== 'PoCTest') {
              return null;
            }
            return {
              appendRow(row) {
                appendedRows.push(row);
              },
            };
          },
        };
      },
    },
  };

  vm.runInNewContext(source, sandbox);
  const result = sandbox[functionName](event);
  return { result, appendedRows };
}

test('parseDesktopCredentials reads installed desktop client fields', () => {
  const credentials = parseDesktopCredentials({
    installed: {
      client_id: 'client-id.apps.googleusercontent.com',
      client_secret: 'client-secret',
      auth_uri: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
    },
  });

  assert.equal(credentials.clientId, 'client-id.apps.googleusercontent.com');
  assert.equal(credentials.clientSecret, 'client-secret');
  assert.equal(credentials.authUri, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(credentials.tokenUri, 'https://oauth2.googleapis.com/token');
});

test('extractWebAppUrl returns WEB_APP url from deployment', () => {
  const url = extractWebAppUrl({
    entryPoints: [
      {
        entryPointType: 'WEB_APP',
        webApp: {
          url: 'https://script.google.com/macros/s/example/exec',
        },
      },
    ],
  });

  assert.equal(url, 'https://script.google.com/macros/s/example/exec');
});

test('validateConfig fails when required PoC fields are missing', () => {
  assert.throws(() => validateConfig({ templateSpreadsheetId: 'sheet-id' }), /testSheetName/);
  assert.throws(
    () => validateConfig({ templateSpreadsheetId: 'sheet-id', testSheetName: 'PoCTest' }),
    /sharedSecret/,
  );
  assert.throws(
    () => validateConfig({
      templateSpreadsheetId: 'sheet-id',
      testSheetName: 'PoCTest',
      sharedSecret: 'secret',
    }),
    /webappAccess/,
  );
});

test('validateConfig fails when webappAccess is not ANYONE_ANONYMOUS', () => {
  assert.throws(
    () =>
      validateConfig({
        templateSpreadsheetId: 'sheet-id',
        testSheetName: 'PoCTest',
        sharedSecret: 'secret',
        webappAccess: 'MYSELF',
      }),
    /ANYONE_ANONYMOUS/,
  );
});

test('validateConfig fails when sharedSecret is REPLACE_ME', () => {
  assert.throws(
    () =>
      validateConfig({
        templateSpreadsheetId: 'sheet-id',
        testSheetName: 'PoCTest',
        sharedSecret: 'REPLACE_ME',
        webappAccess: 'ANYONE_ANONYMOUS',
      }),
    /REPLACE_ME/,
  );
});

test('extractWebAppUrl fails when WEB_APP entry point is missing', () => {
  assert.throws(() => extractWebAppUrl({ entryPoints: [] }), /WEB_APP entry point/);
});

test('generated doGet returns JSON service status', async () => {
  const source = buildCodeSource(await loadTemplate(codeTemplatePath), {
    sharedSecret: 'top-secret',
    testSheetName: 'PoCTest',
  });

  const { result } = runGasFunction(source, 'doGet');
  assert.equal(result.mimeType, 'application/json');
  assert.deepEqual(JSON.parse(result.text), {
    ok: true,
    service: 'hurikaeru-onboarding-poc',
  });
});

test('generated doPost does not append when secret mismatches', async () => {
  const source = buildCodeSource(await loadTemplate(codeTemplatePath), {
    sharedSecret: 'top-secret',
    testSheetName: 'PoCTest',
  });

  const { result, appendedRows } = runGasFunction(source, 'doPost', {
    event: {
      postData: {
        contents: JSON.stringify({
          secret: 'wrong-secret',
          testValue: 'abc',
          email: 'user@example.com',
          token: 'token',
        }),
      },
    },
  });

  assert.equal(result.mimeType, 'application/json');
  assert.deepEqual(JSON.parse(result.text), { ok: false, error: 'unauthorized' });
  assert.equal(appendedRows.length, 0);
});

test('generated doPost appends only timestamp, source tag, and short testValue', async () => {
  const source = buildCodeSource(await loadTemplate(codeTemplatePath), {
    sharedSecret: 'top-secret',
    testSheetName: 'PoCTest',
  });

  const { result, appendedRows } = runGasFunction(source, 'doPost', {
    event: {
      postData: {
        contents: JSON.stringify({
          secret: 'top-secret',
          testValue: `  ${'x'.repeat(80)}  `,
          email: 'user@example.com',
          token: 'token',
        }),
      },
    },
  });

  assert.deepEqual(JSON.parse(result.text), { ok: true });
  assert.equal(appendedRows.length, 1);
  assert.equal(appendedRows[0].length, 3);
  assert.match(appendedRows[0][0], /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(appendedRows[0][1], 'poc');
  assert.equal(appendedRows[0][2], 'x'.repeat(64));
});

test('generated sources do not contain secret logging', async () => {
  const codeSource = buildCodeSource(await loadTemplate(codeTemplatePath), {
    sharedSecret: 'top-secret',
    testSheetName: 'PoCTest',
  });
  const manifestSource = buildManifestSource(await loadTemplate(manifestTemplatePath), {
    webappAccess: 'ANYONE_ANONYMOUS',
  });

  assert.doesNotMatch(codeSource, /console\.(log|error|warn|info).*top-secret/s);
  assert.doesNotMatch(codeSource, /Logger\.log.*top-secret/s);
  assert.doesNotMatch(manifestSource, /top-secret/);
});
