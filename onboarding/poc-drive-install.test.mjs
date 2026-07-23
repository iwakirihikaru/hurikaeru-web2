import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractWebAppUrl,
  parseDesktopCredentials,
} from './poc-drive-install.mjs';

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
