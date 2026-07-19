import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const portableDir = path.join(rootDir, 'portable');

function readFile(name) {
  const filePath = path.join(portableDir, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: portable/${name}`);
  }
  const value = fs.readFileSync(filePath, 'utf8');
  if (!value.trim()) {
    throw new Error(`Empty file: portable/${name}`);
  }
  return value;
}

function extractSourceCommit(html, name) {
  const metaMatch = html.match(/<meta\s+name="x-source-commit"\s+content="([^"]+)">/i);
  if (!metaMatch) {
    throw new Error(`Missing source commit meta tag in ${name}`);
  }
  const scriptMatch = html.match(/window\.__SOURCE_COMMIT__\s*=\s*"([^"]+)";/i);
  if (!scriptMatch) {
    throw new Error(`Missing window.__SOURCE_COMMIT__ in ${name}`);
  }
  if (metaMatch[1] !== scriptMatch[1]) {
    throw new Error(`Source commit meta/script mismatch in ${name}`);
  }
  return metaMatch[1];
}

function verifyRuntimeShimReference(html, name) {
  if (!/<script\s+src="\.\/runtime-shim\.js\?v=[a-f0-9]{10}"><\/script>/i.test(html)) {
    throw new Error(`Missing runtime-shim versioned script reference in ${name}`);
  }
}

const studentHtml = readFile('student.html');
const teacherHtml = readFile('teacher.html');
const runtimeShim = readFile('runtime-shim.js');

if (!runtimeShim.trim()) {
  throw new Error('runtime-shim.js is empty');
}

verifyRuntimeShimReference(studentHtml, 'student.html');
verifyRuntimeShimReference(teacherHtml, 'teacher.html');

const studentCommit = extractSourceCommit(studentHtml, 'student.html');
const teacherCommit = extractSourceCommit(teacherHtml, 'teacher.html');
const expectedCommit = String(process.env.SOURCE_COMMIT || process.env.GITHUB_SHA || '').trim();

if (studentCommit !== teacherCommit) {
  throw new Error(`student/teacher source commit mismatch: ${studentCommit} vs ${teacherCommit}`);
}
if (expectedCommit && studentCommit !== expectedCommit) {
  throw new Error(`Built source commit mismatch: expected ${expectedCommit}, got ${studentCommit}`);
}

console.log(`Portable build verification passed for ${studentCommit}`);
