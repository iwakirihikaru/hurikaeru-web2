import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const scriptPath = path.join(repoRoot, 'scripts', 'guard-pages-publish.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-guard-'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || '').trim() || `${command} failed`);
  }
  return String(result.stdout || '').trim();
}

function write(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function execGuard(env) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

function writeCmdWrapper(filePath, targetScript) {
  write(
    filePath,
    `@echo off\r\n"${process.execPath}" "${targetScript}" %*\r\n`
  );
}

run('git', ['init'], tempRoot);
run('git', ['config', 'user.name', 'Codex Test'], tempRoot);
run('git', ['config', 'user.email', 'codex@example.com'], tempRoot);

write(path.join(tempRoot, 'src', 'teacher_sample.html'), '<div>teacher v1</div>\n');
write(path.join(tempRoot, 'portable', 'student.html'), '<head>\n<meta name="x-source-commit" content="new">\n<script>window.__SOURCE_COMMIT__ = "new";</script>\n<body>same</body>\n');
write(path.join(tempRoot, 'portable-publish', 'student.html'), '<head>\n<meta name="x-source-commit" content="old">\n<script>window.__SOURCE_COMMIT__ = "old";</script>\n<body>same</body>\n');

run('git', ['add', '.'], tempRoot);
run('git', ['commit', '-m', 'initial'], tempRoot);

write(path.join(tempRoot, 'src', 'teacher_sample.html'), '<div>teacher v2</div>\n');
run('git', ['add', 'src/teacher_sample.html'], tempRoot);
run('git', ['commit', '-m', 'teacher only'], tempRoot);
const teacherOnlyCommit = run('git', ['rev-parse', 'HEAD'], tempRoot);
const teacherOnlyBefore = run('git', ['rev-parse', 'HEAD^'], tempRoot);

let result = execGuard({
  PAGES_REPO_ROOT: tempRoot,
  SOURCE_COMMIT: teacherOnlyCommit,
  SOURCE_BEFORE_SHA: teacherOnlyBefore,
});
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /teacher-only student diff check passed/i);

write(path.join(tempRoot, 'portable', 'student.html'), '<head>\n<meta name="x-source-commit" content="newer">\n<script>window.__SOURCE_COMMIT__ = "newer";</script>\n<body>changed</body>\n');
result = execGuard({
  PAGES_REPO_ROOT: tempRoot,
  SOURCE_COMMIT: teacherOnlyCommit,
  SOURCE_BEFORE_SHA: teacherOnlyBefore,
});
assert.notEqual(result.status, 0, 'guard should fail when student body changes');
assert.match(result.stderr || result.stdout, /modified portable\/student\.html beyond source commit markers/i);

write(path.join(tempRoot, 'portable-publish', 'student.html'), '<head>\n<meta name="x-source-commit" content="newer">\n<script>window.__SOURCE_COMMIT__ = "newer";</script>\n<body>changed</body>\n');
result = execGuard({
  PAGES_REPO_ROOT: tempRoot,
  SOURCE_COMMIT: teacherOnlyCommit,
  SOURCE_BEFORE_SHA: teacherOnlyBefore,
});
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /teacher-only student diff check passed/i);

write(path.join(tempRoot, 'portable', 'student.html'), '<head>\n<meta name="x-source-commit" content="rollback">\n<script>window.__SOURCE_COMMIT__ = "rollback";</script>\n<body>rolled back</body>\n');
write(path.join(tempRoot, 'portable-publish', 'student.html'), '<head>\n<meta name="x-source-commit" content="rollback">\n<script>window.__SOURCE_COMMIT__ = "rollback";</script>\n<body>rolled back</body>\n');
result = execGuard({
  PAGES_REPO_ROOT: tempRoot,
  SOURCE_COMMIT: teacherOnlyCommit,
  SOURCE_BEFORE_SHA: teacherOnlyBefore,
});
assert.equal(result.status, 0, result.stderr || result.stdout, 'post-sync identical files would bypass the guard');

write(path.join(tempRoot, 'portable-publish', 'student.html'), '<head>\n<meta name="x-source-commit" content="newer">\n<script>window.__SOURCE_COMMIT__ = "newer";</script>\n<body>changed</body>\n');
result = execGuard({
  PAGES_REPO_ROOT: tempRoot,
  SOURCE_COMMIT: teacherOnlyCommit,
  SOURCE_BEFORE_SHA: teacherOnlyBefore,
});
assert.notEqual(result.status, 0, 'guard must compare against the pre-sync published student.html');
assert.match(result.stderr || result.stdout, /modified portable\/student\.html beyond source commit markers/i);

write(path.join(tempRoot, 'portable', 'student.html'), '<head>\n<meta name="x-source-commit" content="newest">\n<script>window.__SOURCE_COMMIT__ = "newest";</script>\n<body>changed</body>\n');
write(path.join(tempRoot, 'src', 'index.html'), '<div>student source changed</div>\n');
run('git', ['add', 'src/index.html'], tempRoot);
run('git', ['commit', '-m', 'student source'], tempRoot);
const nonTeacherCommit = run('git', ['rev-parse', 'HEAD'], tempRoot);
const nonTeacherBefore = run('git', ['rev-parse', 'HEAD^'], tempRoot);
result = execGuard({
  PAGES_REPO_ROOT: tempRoot,
  SOURCE_COMMIT: nonTeacherCommit,
  SOURCE_BEFORE_SHA: nonTeacherBefore,
});
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /check skipped/i);

const publishTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-publish-'));
const binDir = path.join(publishTempRoot, 'bin');
const scriptsDir = path.join(publishTempRoot, 'scripts');
const publishDir = path.join(publishTempRoot, 'portable-publish');
const gitDir = path.join(publishTempRoot, '.git-publish');
const callLogPath = path.join(publishTempRoot, 'call-log.txt');

fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(scriptsDir, { recursive: true });
fs.mkdirSync(publishDir, { recursive: true });
fs.mkdirSync(gitDir, { recursive: true });
write(path.join(publishDir, 'student.html'), '<body>published</body>\n');
write(path.join(scriptsDir, 'publish-portable-publish.ps1'), fs.readFileSync(path.join(repoRoot, 'scripts', 'publish-portable-publish.ps1'), 'utf8'));

const gitStubPath = path.join(binDir, 'git-stub.js');
write(
  gitStubPath,
  `const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const logPath = process.env.CALL_LOG_PATH;
fs.appendFileSync(logPath, \`git \${args.join(' ')}\\n\`);
function out(value) {
  process.stdout.write(String(value));
}
const publishDir = process.env.PUBLISH_DIR;
const gitDir = process.env.PUBLISH_GIT_DIR;
if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
  out('source-head\\n');
  process.exit(0);
}
if (args[0] === 'rev-parse' && args[1] === 'source-head^') {
  out('before-head\\n');
  process.exit(0);
}
if (args[0] === 'diff' && args[1] === '--check') {
  process.exit(0);
}
if (args[0] === '-C' && args[1] === publishDir && args[2] === 'rev-parse' && args[3] === '--show-toplevel') {
  out(\`\${publishDir}\\n\`);
  process.exit(0);
}
if (args[0] === '-C' && args[1] === publishDir && args[2] === 'rev-parse' && args[3] === '--abbrev-ref' && args[4] === 'HEAD') {
  out('pages-release\\n');
  process.exit(0);
}
if (args[0] === '-C' && args[1] === publishDir && args[2] === 'rev-parse' && args[3] === '--path-format=absolute' && args[4] === '--git-dir') {
  out(\`\${gitDir}\\n\`);
  process.exit(0);
}
if (args[0] === '-C' && args[1] === publishDir && args[2] === 'status' && args[3] === '--porcelain') {
  process.exit(0);
}
if (args[0] === '-C' && args[1] === publishDir && args[2] === 'fetch') {
  process.exit(0);
}
if (args[0] === '-C' && args[1] === publishDir && args[2] === 'rev-parse' && args[3] === 'HEAD') {
  out('publish-head\\n');
  process.exit(0);
}
if (args[0] === '-C' && args[1] === publishDir && args[2] === 'rev-parse' && args[3] === 'refs/remotes/origin/pages-release') {
  out('publish-head\\n');
  process.exit(0);
}
if (args[0] === '-C' && args[1] === publishDir && args[2] === 'diff' && args[3] === '--check') {
  process.exit(0);
}
if (
  args[0] === '-C' &&
  args[1] === publishDir &&
  args[2] === 'status' &&
  args[3] === '--porcelain' &&
  args[4] === '--'
) {
  process.exit(0);
}
process.stderr.write(\`Unexpected git args: \${args.join(' ')}\\n\`);
process.exit(1);
`
);

const nodeStubPath = path.join(binDir, 'node-stub.js');
write(
  nodeStubPath,
  `const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG_PATH, \`node \${args.join(' ')}\\n\`);
process.exit(0);
`
);

writeCmdWrapper(path.join(binDir, 'git.cmd'), gitStubPath);
writeCmdWrapper(path.join(binDir, 'node.cmd'), nodeStubPath);

result = spawnSync(
  'powershell',
  [
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(scriptsDir, 'publish-portable-publish.ps1'),
    '-PublishDir',
    'portable-publish',
    '-Build',
  ],
  {
    cwd: publishTempRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir};${process.env.PATH || ''}`,
      CALL_LOG_PATH: callLogPath,
      PUBLISH_DIR: publishDir,
      PUBLISH_GIT_DIR: gitDir,
    },
  }
);
assert.equal(result.status, 0, result.stderr || result.stdout);
const logLines = fs.readFileSync(callLogPath, 'utf8').trim().split(/\r?\n/);
assert.deepEqual(
  logLines.filter(line => line.startsWith('node ')),
  [
    'node .\\scripts\\build-static-port.mjs',
    'node .\\scripts\\guard-pages-publish.mjs --publish-dir portable-publish --source-commit source-head --before',
    'node .\\scripts\\sync-portable-publish.mjs',
  ]
);
assert.ok(
  !logLines.some(line => line === 'node .\\scripts\\sync-portable-publish.mjs --build'),
  'sync step must not trigger a second build'
);
assert.deepEqual(
  logLines.filter(line => line.startsWith('node ')).map(line => line.split(' ')[1]),
  [
    '.\\scripts\\build-static-port.mjs',
    '.\\scripts\\guard-pages-publish.mjs',
    '.\\scripts\\sync-portable-publish.mjs',
  ]
);

fs.rmSync(tempRoot, { recursive: true, force: true });
fs.rmSync(publishTempRoot, { recursive: true, force: true });
console.log('Pages publish guard tests passed');
