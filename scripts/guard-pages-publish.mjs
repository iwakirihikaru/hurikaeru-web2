import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(process.env.PAGES_REPO_ROOT || path.resolve(__dirname, '..'));

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }
    args.set(key, next);
    i += 1;
  }
  return args;
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(stderr || `git ${args.join(' ')} failed`);
  }
  return String(result.stdout || '').trim();
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readText(filePath) {
  if (!fileExists(filePath)) {
    throw new Error(`Missing file: ${path.relative(rootDir, filePath)}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeStudentHtml(html) {
  return String(html)
    .replace(/<meta\s+name="x-source-commit"\s+content="[^"]+">\r?\n?/i, '')
    .replace(/<script>window\.__SOURCE_COMMIT__\s*=\s*"[^"]+";<\/script>\r?\n?/i, '');
}

function isTeacherOnlyChange(changedFiles) {
  if (!changedFiles.length) return false;
  return changedFiles.every(file => /^src\/teacher[^/]*\.html$/i.test(file));
}

function resolveChangedFiles(sourceCommit, beforeSha) {
  if (!sourceCommit) {
    throw new Error('SOURCE_COMMIT is required');
  }
  if (beforeSha && !/^0+$/.test(beforeSha)) {
    const output = runGit(['diff', '--name-only', `${beforeSha}..${sourceCommit}`]);
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
  }
  const output = runGit(['diff-tree', '--no-commit-id', '--name-only', '-r', sourceCommit]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function verifyTeacherOnlyStudentDiff(publishDir) {
  const builtStudentPath = path.join(rootDir, 'portable', 'student.html');
  const publishedStudentPath = path.join(rootDir, publishDir, 'student.html');
  const builtStudent = readText(builtStudentPath);
  const publishedStudent = readText(publishedStudentPath);
  if (normalizeStudentHtml(builtStudent) !== normalizeStudentHtml(publishedStudent)) {
    throw new Error(
      'Teacher-only change modified portable/student.html beyond source commit markers'
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const publishDir = args.get('publish-dir') || 'portable-publish';
  const sourceCommit = String(args.get('source-commit') || process.env.SOURCE_COMMIT || '').trim();
  const beforeSha = String(args.get('before') || process.env.SOURCE_BEFORE_SHA || '').trim();
  const changedFiles = resolveChangedFiles(sourceCommit, beforeSha);

  if (!isTeacherOnlyChange(changedFiles)) {
    console.log('Pages publish guard: teacher-only student diff check skipped');
    return;
  }

  verifyTeacherOnlyStudentDiff(publishDir);
  console.log('Pages publish guard: teacher-only student diff check passed');
}

main();
