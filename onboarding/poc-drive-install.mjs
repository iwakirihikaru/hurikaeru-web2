#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const SCRIPT_PROJECTS_SCOPE = 'https://www.googleapis.com/auth/script.projects';
const SCRIPT_DEPLOYMENTS_SCOPE = 'https://www.googleapis.com/auth/script.deployments';
const DEFAULT_SCOPES = [DRIVE_SCOPE, SCRIPT_PROJECTS_SCOPE, SCRIPT_DEPLOYMENTS_SCOPE];
const SCRIPT_API_BASE = 'https://script.googleapis.com/v1';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DEFAULT_AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DEFAULT_TIMEOUT_MS = 180000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    dryRun: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(`Unknown argument: ${token}`);
    }
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    if (token === '--config') {
      options.configPath = value;
    } else if (token === '--credentials') {
      options.credentialsPath = value;
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
    index += 1;
  }

  return { command, options };
}

export async function loadJsonFile(targetPath) {
  const raw = await readFile(targetPath, 'utf8');
  return JSON.parse(raw);
}

export function parseDesktopCredentials(json) {
  const installed = json?.installed;
  if (!installed?.client_id) {
    throw new Error('Desktop app OAuth credentials are missing installed.client_id');
  }
  return {
    clientId: installed.client_id,
    clientSecret: installed.client_secret ?? '',
    authUri: installed.auth_uri ?? DEFAULT_AUTH_URI,
    tokenUri: installed.token_uri ?? DEFAULT_TOKEN_URI,
  };
}

export async function loadScriptTemplateFiles() {
  const [codeSource, manifestSource] = await Promise.all([
    readFile(path.join(__dirname, 'poc-script', 'Code.js'), 'utf8'),
    readFile(path.join(__dirname, 'poc-script', 'appsscript.json'), 'utf8'),
  ]);

  return [
    {
      name: 'Code',
      type: 'SERVER_JS',
      source: codeSource,
    },
    {
      name: 'appsscript',
      type: 'JSON',
      source: manifestSource,
    },
  ];
}

export function extractWebAppUrl(deployment) {
  const entryPoint = deployment?.entryPoints?.find(
    (item) => item?.entryPointType === 'WEB_APP' && item?.webApp?.url,
  );
  if (!entryPoint) {
    throw new Error('WEB_APP entry point was not returned by Apps Script deployment');
  }
  return entryPoint.webApp.url;
}

function ensureInstallCommand(command) {
  if (command !== 'install') {
    throw new Error('Usage: node onboarding/poc-drive-install.mjs install --config <path> --credentials <path> [--dry-run]');
  }
}

function validateConfig(config) {
  if (!config?.templateSpreadsheetId) {
    throw new Error('Config is missing templateSpreadsheetId');
  }
}

function createPkcePair() {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function startLoopbackListener(timeoutMs) {
  const state = randomBytes(24).toString('hex');
  let resolveCode;
  let rejectCode;
  let timer;
  const waitForCode = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (requestUrl.pathname !== '/oauth2callback') {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const receivedState = requestUrl.searchParams.get('state');
      const code = requestUrl.searchParams.get('code');
      const error = requestUrl.searchParams.get('error');

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<html><body><p>認証を受け取りました。ブラウザを閉じてターミナルへ戻ってください。</p></body></html>');

      clearTimeout(timer);
      server.close();

      if (error) {
        rejectCode(new Error(`OAuth authorization failed: ${error}`));
        return;
      }
      if (!code) {
        rejectCode(new Error('OAuth authorization did not return code'));
        return;
      }
      if (receivedState !== state) {
        rejectCode(new Error('OAuth state mismatch'));
        return;
      }
      resolveCode(code);
    } catch (error) {
      clearTimeout(timer);
      server.close();
      rejectCode(error);
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      timer = setTimeout(() => {
        server.close();
        rejectCode(new Error('Timed out waiting for OAuth redirect'));
      }, timeoutMs);

      resolve({
        state,
        redirectUri: `http://127.0.0.1:${server.address().port}/oauth2callback`,
        waitForCode,
      });
    });
  });
}

function openBrowser(url) {
  let child;
  const platform = process.platform;
  if (platform === 'win32') {
    child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
  } else if (platform === 'darwin') {
    child = spawn('open', [url], { detached: true, stdio: 'ignore' });
  } else {
    child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  }
  child.on('error', () => {});
  return child;
}

async function authorizeUser(credentials, scopes) {
  const { verifier, challenge } = createPkcePair();
  const loopback = await startLoopbackListener(DEFAULT_TIMEOUT_MS);
  const authUrl = new URL(credentials.authUri);
  authUrl.searchParams.set('client_id', credentials.clientId);
  authUrl.searchParams.set('redirect_uri', loopback.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', loopback.state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  try {
    const child = openBrowser(authUrl.toString());
    child.unref();
    console.error('Opened browser for Google OAuth. If it did not open, use this URL:');
  } catch (error) {
    console.error('Failed to open browser automatically. Use this URL:');
  }
  console.error(authUrl.toString());

  const code = await loopback.waitForCode;
  const tokenBody = new URLSearchParams({
    client_id: credentials.clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: loopback.redirectUri,
  });
  if (credentials.clientSecret) {
    tokenBody.set('client_secret', credentials.clientSecret);
  }

  const tokenResponse = await fetch(credentials.tokenUri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenBody,
  });
  const tokenJson = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`OAuth token exchange failed: ${JSON.stringify(tokenJson)}`);
  }
  if (!tokenJson.access_token) {
    throw new Error('OAuth token exchange did not return access_token');
  }
  return tokenJson.access_token;
}

async function fetchJson(url, { method = 'GET', accessToken, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function copySpreadsheet(accessToken, config) {
  const copyUrl = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(config.templateSpreadsheetId)}/copy`);
  copyUrl.searchParams.set('fields', 'id,webViewLink');

  return fetchJson(copyUrl, {
    method: 'POST',
    accessToken,
    body: {
      name: config.copiedSpreadsheetName ?? `hurikaeru-poc-${Date.now()}`,
      ...(config.destinationFolderId ? { parents: [config.destinationFolderId] } : {}),
    },
  });
}

async function createBoundScriptProject(accessToken, spreadsheetId, config) {
  return fetchJson(`${SCRIPT_API_BASE}/projects`, {
    method: 'POST',
    accessToken,
    body: {
      title: config.scriptTitle ?? 'hurikaeru-poc-bound-script',
      parentId: spreadsheetId,
    },
  });
}

async function updateProjectContent(accessToken, scriptId, files) {
  return fetchJson(`${SCRIPT_API_BASE}/projects/${encodeURIComponent(scriptId)}/content`, {
    method: 'PUT',
    accessToken,
    body: { files },
  });
}

async function createVersion(accessToken, scriptId, config) {
  return fetchJson(`${SCRIPT_API_BASE}/projects/${encodeURIComponent(scriptId)}/versions`, {
    method: 'POST',
    accessToken,
    body: {
      description: config.versionDescription ?? 'Phase 1 PoC version',
    },
  });
}

async function createDeployment(accessToken, scriptId, versionNumber, config) {
  return fetchJson(`${SCRIPT_API_BASE}/projects/${encodeURIComponent(scriptId)}/deployments`, {
    method: 'POST',
    accessToken,
    body: {
      versionNumber,
      manifestFileName: 'appsscript',
      description: config.deploymentDescription ?? 'Phase 1 PoC web app deployment',
    },
  });
}

function printInstallResult(result) {
  console.log(`copied spreadsheet ID: ${result.spreadsheetId}`);
  console.log(`copied spreadsheet URL: ${result.spreadsheetUrl}`);
  console.log(`script ID: ${result.scriptId}`);
  console.log(`version number: ${result.versionNumber}`);
  console.log(`deployment ID: ${result.deploymentId}`);
  console.log(`web app URL: ${result.webAppUrl}`);
}

export async function runInstall({ configPath, credentialsPath, dryRun }) {
  if (!configPath) {
    throw new Error('Missing --config');
  }
  if (!credentialsPath) {
    throw new Error('Missing --credentials');
  }

  const resolvedConfigPath = path.resolve(configPath);
  const resolvedCredentialsPath = path.resolve(credentialsPath);
  const [config, credentialsJson, files] = await Promise.all([
    loadJsonFile(resolvedConfigPath),
    loadJsonFile(resolvedCredentialsPath),
    loadScriptTemplateFiles(),
  ]);

  validateConfig(config);
  const credentials = parseDesktopCredentials(credentialsJson);

  if (dryRun) {
    console.error('Dry run completed. OAuth and Google API calls were skipped.');
    console.error(`Config: ${resolvedConfigPath}`);
    console.error(`Credentials: ${resolvedCredentialsPath}`);
    console.error(`Prepared script files: ${files.map((file) => `${file.name}.${file.type}`).join(', ')}`);
    return null;
  }

  const accessToken = await authorizeUser(credentials, DEFAULT_SCOPES);
  const copiedSpreadsheet = await copySpreadsheet(accessToken, config);
  const createdProject = await createBoundScriptProject(accessToken, copiedSpreadsheet.id, config);
  const scriptId = createdProject.scriptId;
  if (!scriptId) {
    throw new Error('projects.create did not return scriptId');
  }

  await updateProjectContent(accessToken, scriptId, files);
  const version = await createVersion(accessToken, scriptId, config);
  const deployment = await createDeployment(accessToken, scriptId, version.versionNumber, config);
  const webAppUrl = extractWebAppUrl(deployment);

  const result = {
    spreadsheetId: copiedSpreadsheet.id,
    spreadsheetUrl: copiedSpreadsheet.webViewLink ?? `https://docs.google.com/spreadsheets/d/${copiedSpreadsheet.id}/edit`,
    scriptId,
    versionNumber: version.versionNumber,
    deploymentId: deployment.deploymentId,
    webAppUrl,
  };
  printInstallResult(result);
  return result;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  ensureInstallCommand(command);
  await runInstall(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
