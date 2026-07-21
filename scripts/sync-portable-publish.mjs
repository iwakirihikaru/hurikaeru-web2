import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const portableDir = path.join(rootDir, 'portable');
const publishDirArgIndex = process.argv.indexOf('--publish-dir');
const publishDirArg = publishDirArgIndex >= 0 ? String(process.argv[publishDirArgIndex + 1] || '').trim() : '';
if (publishDirArgIndex >= 0 && !publishDirArg) throw new Error('--publish-dir requires a path.');
const publishDir = publishDirArg ? path.resolve(rootDir, publishDirArg) : path.join(rootDir, 'portable-publish');
const filesToCopy = [
  '_headers',
  'README.md',
  'index.html',
  'runtime-shim.js',
  'setup.html',
  'student.html',
  'teacher.html',
];
const sourceFilesToCheck = [
  'src/teacher_section_status.html',
  'src/teacher_styles.html',
  'src/teacher_script_units.html',
  'src/teacher_script_units_legacy.html',
  'src/06_teacher.js',
  'src/07_portable_rpc.js',
  'portable-src/runtime-shim.js',
  'scripts/sync-portable-publish.mjs',
  'scripts/publish-portable-publish.ps1',
  'scripts/deploy-full.ps1',
];
const portableArtifactNames = ['index.html', 'student.html', 'teacher.html', 'setup.html', 'runtime-shim.js'];
const conflictMarkerPattern = /^(<<<<<<< .+|=======|>>>>>>> .+)$/;
const teacherRequiredIds = [
  'statusSortSelect',
  'statusDensityButtons',
  'statusDensityValue',
  'statusCardModalTitle',
  'statusCardModalNumber',
  'statusCardModalMeta',
  'statusCardModalFavoriteBtn',
  'statusFeedbackJumpBtn',
  'statusCardModalBody',
  'statusCardModalPrevBtn',
  'statusCardModalNextBtn',
];
const studentRequiredIds = ['screen-select', 'numGrid', 'screen-main', 'fieldContainer', 'submitBtn'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }
}

function copyFile(name) {
  const sourcePath = name === '_headers'
    ? path.join(rootDir, name)
    : path.join(portableDir, name);
  const destinationPath = path.join(publishDir, name);
  if (/\.html$/i.test(name)) {
    const sourceCommit = readSourceCommit();
    const html = fs.readFileSync(sourcePath, 'utf8');
    const stamped = html.replace(/<meta name="source-commit" content="[^"]*">\s*/i, '')
      .replace('<head>', `<head>\n<meta name="source-commit" content="${sourceCommit}">`);
    fs.writeFileSync(destinationPath, stamped, 'utf8');
    return;
  }
  fs.copyFileSync(sourcePath, destinationPath);
}

function readSourceCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error('Unable to resolve source commit.');
  return String(result.stdout || '').trim();
}

function assertFilesExistAndNonEmpty(filePaths, label) {
  const invalid = filePaths.filter(filePath => {
    const absolutePath = path.resolve(rootDir, filePath);
    return !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile() || fs.statSync(absolutePath).size <= 0;
  });
  if (invalid.length) {
    console.error(`${label}: missing or empty files:`);
    invalid.forEach(filePath => console.error(`- ${filePath}`));
    process.exit(1);
  }
}

function assertNoConflictMarkers(filePaths, label) {
  const matches = [];
  filePaths.forEach(filePath => {
    const absolutePath = path.resolve(rootDir, filePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return;
    fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (conflictMarkerPattern.test(line)) matches.push(`${filePath}:${index + 1}: ${line}`);
    });
  });
  if (matches.length) {
    console.error(`${label}: conflict markers found:`);
    matches.forEach(match => console.error(`- ${match}`));
    process.exit(1);
  }
}

function assertHtmlIds(filePath, requiredIds, label) {
  const html = fs.readFileSync(path.resolve(rootDir, filePath), 'utf8');
  const missing = requiredIds.filter(id => !new RegExp(`\\bid=["']${id}["']`).test(html));
  const duplicates = requiredIds.filter(id => (html.match(new RegExp(`\\bid=["']${id}["']`, 'g')) || []).length !== 1);
  if (missing.length || duplicates.length) {
    if (missing.length) console.error(`${label}: missing IDs: ${missing.join(', ')}`);
    if (duplicates.length) console.error(`${label}: IDs must occur exactly once: ${duplicates.join(', ')}`);
    process.exit(1);
  }
}

function assertRuntimeShimReferences(baseDir) {
  const missing = ['student.html', 'teacher.html', 'setup.html'].filter(name => {
    const html = fs.readFileSync(path.join(baseDir, name), 'utf8');
    return !/<script\s+src=["']\.\/runtime-shim\.js(?:\?[^"']*)?["']><\/script>/i.test(html);
  });
  if (missing.length) {
    console.error(`runtime-shim.js reference missing: ${missing.map(name => path.relative(rootDir, path.join(baseDir, name))).join(', ')}`);
    process.exit(1);
  }
}

const shouldBuild = process.argv.includes('--build');

ensureDir(portableDir);
ensureDir(publishDir);

assertFilesExistAndNonEmpty(sourceFilesToCheck, 'Source validation');
assertNoConflictMarkers(sourceFilesToCheck, 'Source validation');

if (shouldBuild) {
  run(process.execPath, [path.join(__dirname, 'build-static-port.mjs')]);
}

const portablePaths = portableArtifactNames.map(name => path.relative(rootDir, path.join(portableDir, name)));
assertFilesExistAndNonEmpty(portablePaths, 'Portable validation');
assertNoConflictMarkers(portablePaths, 'Portable validation');
assertHtmlIds(path.relative(rootDir, path.join(portableDir, 'teacher.html')), teacherRequiredIds, 'portable/teacher.html');
assertHtmlIds(path.relative(rootDir, path.join(portableDir, 'student.html')), studentRequiredIds, 'portable/student.html');
assertRuntimeShimReferences(portableDir);

for (const fileName of filesToCopy) {
  copyFile(fileName);
}

const publishPaths = portableArtifactNames.map(name => path.relative(rootDir, path.join(publishDir, name)));
assertFilesExistAndNonEmpty(publishPaths, 'Publish validation');
assertNoConflictMarkers(publishPaths, 'Publish validation');
assertHtmlIds(path.relative(rootDir, path.join(publishDir, 'teacher.html')), teacherRequiredIds, 'portable-publish/teacher.html');
assertHtmlIds(path.relative(rootDir, path.join(publishDir, 'student.html')), studentRequiredIds, 'portable-publish/student.html');
assertRuntimeShimReferences(publishDir);
const sourceCommit = readSourceCommit();
['index.html', 'student.html', 'teacher.html', 'setup.html'].forEach(name => {
  const html = fs.readFileSync(path.join(publishDir, name), 'utf8');
  if (!html.includes(`<meta name="source-commit" content="${sourceCommit}">`)) {
    console.error(`Source commit stamp missing: portable-publish/${name}`);
    process.exit(1);
  }
});

console.log(`Synced portable artifacts into ${publishDir} from ${sourceCommit}`);
