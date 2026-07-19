import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workflowPath = path.join(rootDir, '.github', 'workflows', 'publish-pages.yml');

function readWorkflowPaths() {
  const lines = fs.readFileSync(workflowPath, 'utf8').split(/\r?\n/);
  const paths = [];
  let inPush = false;
  let inPaths = false;
  for (const line of lines) {
    if (/^on:\s*$/.test(line)) {
      continue;
    }
    if (/^  push:\s*$/.test(line)) {
      inPush = true;
      continue;
    }
    if (inPush && /^    paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths) {
      const match = line.match(/^      -\s+(.+?)\s*$/);
      if (match) {
        paths.push(match[1].replace(/^['"]|['"]$/g, ''));
        continue;
      }
      if (!/^      /.test(line)) {
        break;
      }
    }
  }
  if (!paths.length) {
    throw new Error('Could not read workflow paths');
  }
  return paths;
}

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matches(pathname, patterns) {
  return patterns.some(pattern => globToRegExp(pattern).test(pathname));
}

const patterns = readWorkflowPaths();
const shouldMatch = [
  'src/index.html',
  'src/teacher.html',
  'src/teacher_styles.html',
  'portable-src/runtime-shim.js',
  'scripts/build-static-port.mjs',
  'scripts/sync-portable-publish.mjs',
  'package.json',
  'package-lock.json',
  '_headers',
  '.github/workflows/publish-pages.yml',
];
const shouldNotMatch = [
  'src/00_bootstrap.js',
  'src/appsscript.json',
  'scripts/deploy-script.ps1',
  'deploy.config.json',
  'README.md',
];

for (const item of shouldMatch) {
  if (!matches(item, patterns)) {
    throw new Error(`Expected workflow path match: ${item}`);
  }
}

for (const item of shouldNotMatch) {
  if (matches(item, patterns)) {
    throw new Error(`Unexpected workflow path match: ${item}`);
  }
}

console.log(`Workflow path checks passed for ${patterns.length} patterns`);
