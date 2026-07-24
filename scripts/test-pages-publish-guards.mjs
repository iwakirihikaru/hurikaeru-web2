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

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log('Pages publish guard tests passed');
