import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const portableDir = path.join(rootDir, 'portable');
const publishDir = path.join(rootDir, 'portable-publish');
const buildScript = path.join(__dirname, 'build-static-port.mjs');
const shouldBuild = process.argv.includes('--build');

const filesToSync = [
  '_headers',
  'README.md',
  'index.html',
  'runtime-shim.js',
  'setup.html',
  'student.html',
  'teacher.html'
];

function ensureDir(dirPath, label) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error(`${label} was not found: ${dirPath}`);
  }
}

function runBuild() {
  const result = spawnSync(process.execPath, [buildScript], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error('portable build failed.');
  }
}

function syncFile(name) {
  const sourcePath = path.join(portableDir, name);
  const targetPath = path.join(publishDir, name);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`source file was not found: ${sourcePath}`);
  }
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`synced ${name}`);
}

ensureDir(portableDir, 'portable directory');
ensureDir(publishDir, 'portable-publish directory');

if (shouldBuild) {
  runBuild();
}

for (const name of filesToSync) {
  syncFile(name);
}

console.log('portable-publish sync completed.');
