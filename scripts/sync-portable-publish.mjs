import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const portableDir = path.join(rootDir, 'portable');
const publishDir = path.join(rootDir, 'portable-publish');
const filesToCopy = [
  '_headers',
  'README.md',
  'index.html',
  'runtime-shim.js',
  'setup.html',
  'student.html',
  'teacher.html',
];

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
  fs.copyFileSync(sourcePath, destinationPath);
}

const shouldBuild = process.argv.includes('--build');

ensureDir(portableDir);
ensureDir(publishDir);

if (shouldBuild) {
  run(process.execPath, [path.join(__dirname, 'build-static-port.mjs')]);
}

for (const fileName of filesToCopy) {
  copyFile(fileName);
}

console.log('Synced portable artifacts into portable-publish');
