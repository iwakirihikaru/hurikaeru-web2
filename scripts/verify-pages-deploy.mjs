import process from 'node:process';

const baseUrl = String(process.env.PAGES_BASE_URL || 'https://hurikaeru-web2.pages.dev').replace(/\/+$/, '');
const expectedCommit = String(process.env.SOURCE_COMMIT || process.env.GITHUB_SHA || '').trim();
const timeoutMs = Number(process.env.PAGES_VERIFY_TIMEOUT_MS || 300000);
const intervalMs = Number(process.env.PAGES_VERIFY_INTERVAL_MS || 10000);
const startAt = Date.now();

if (!expectedCommit) {
  throw new Error('SOURCE_COMMIT or GITHUB_SHA is required');
}

const checks = [
  { key: 'studentPretty', label: '/student', path: '/student', role: 'student' },
  { key: 'studentHtml', label: '/student.html', path: '/student.html', role: 'student' },
  { key: 'teacherPretty', label: '/teacher', path: '/teacher', role: 'teacher' },
  { key: 'teacherHtml', label: '/teacher.html', path: '/teacher.html', role: 'teacher' },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCommit(html, label) {
  const metaMatch = html.match(/<meta\s+name="x-source-commit"\s+content="([^"]+)">/i);
  const scriptMatch = html.match(/window\.__SOURCE_COMMIT__\s*=\s*"([^"]+)";/i);
  if (!metaMatch || !scriptMatch) {
    throw new Error(`${label}: missing source commit markers`);
  }
  if (metaMatch[1] !== scriptMatch[1]) {
    throw new Error(`${label}: source commit markers disagree`);
  }
  return metaMatch[1];
}

function verifyRuntimeShim(html, label) {
  if (!/<script\s+src="\.\/runtime-shim\.js\?v=[a-f0-9]{10}"><\/script>/i.test(html)) {
    throw new Error(`${label}: missing runtime-shim reference`);
  }
}

async function fetchCheck(entry) {
  const requestUrl = `${baseUrl}${entry.path}?__verify_commit=${encodeURIComponent(expectedCommit)}&__ts=${Date.now()}`;
  const response = await fetch(requestUrl, {
    headers: {
      'cache-control': 'no-cache, no-store, max-age=0',
      pragma: 'no-cache',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`${entry.label}: HTTP ${response.status}`);
  }
  const html = await response.text();
  const commit = extractCommit(html, entry.label);
  verifyRuntimeShim(html, entry.label);
  if (commit !== expectedCommit) {
    throw new Error(`${entry.label}: expected ${expectedCommit}, got ${commit}`);
  }
  return commit;
}

let lastError = null;

while (Date.now() - startAt <= timeoutMs) {
  try {
    const results = {};
    for (const entry of checks) {
      results[entry.key] = await fetchCheck(entry);
    }
    if (results.studentPretty !== results.studentHtml) {
      throw new Error(`student routes disagree: ${results.studentPretty} vs ${results.studentHtml}`);
    }
    if (results.teacherPretty !== results.teacherHtml) {
      throw new Error(`teacher routes disagree: ${results.teacherPretty} vs ${results.teacherHtml}`);
    }
    if (results.studentPretty !== results.teacherPretty) {
      throw new Error(`student/teacher routes disagree: ${results.studentPretty} vs ${results.teacherPretty}`);
    }
    console.log(`Cloudflare Pages verification passed for ${expectedCommit} at ${baseUrl}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    const elapsedSec = Math.round((Date.now() - startAt) / 1000);
    console.log(`Pages verification pending after ${elapsedSec}s: ${error.message}`);
    if (Date.now() - startAt > timeoutMs) {
      break;
    }
    await sleep(intervalMs);
  }
}

throw lastError || new Error('Pages verification timed out');
