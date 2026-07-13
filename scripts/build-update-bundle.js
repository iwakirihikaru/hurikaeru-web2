const fs = require('fs');
const path = require('path');

const workspace = path.resolve(__dirname, '..');
const srcDir = path.join(workspace, 'src');
const outDir = path.join(workspace, 'remote_inspect');
const outPath = path.join(outDir, 'update-bundle.json');
const generatedJsPath = path.join(srcDir, '99_update_bundle.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function listBundleFiles() {
  return fs.readdirSync(srcDir)
    .filter(name => /\.(js|html|json)$/i.test(name))
    .filter(name => name !== '99_update_bundle.js')
    .sort((a, b) => a.localeCompare(b, 'ja'));
}

function normalizeBundleFileName(name) {
  if (name === 'appsscript.json') return 'appsscript';
  return name.replace(/\.(js|html|json)$/i, '');
}

function extractAppBuild(files) {
  const bootstrap = files.find(file => file.name === '00_bootstrap');
  if (!bootstrap) return '';
  const match = String(bootstrap.source || '').match(/const APP_BUILD = '([^']+)'/);
  return match ? String(match[1] || '').trim() : '';
}

function main() {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`src directory was not found: ${srcDir}`);
  }
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const files = listBundleFiles().map(name => ({
    name: normalizeBundleFileName(name),
    type: name.endsWith('.html') ? 'HTML' : (name.endsWith('.json') ? 'JSON' : 'SERVER_JS'),
    source: readText(path.join(srcDir, name)),
  }));

  const bundle = {
    generatedAt: new Date().toISOString(),
    bundleVersion: '1',
    appBuild: extractAppBuild(files),
    fileCount: files.length,
    files,
  };

  try {
    fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
    process.stdout.write(`Wrote ${outPath}\n`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    process.stderr.write(`Warning: could not write ${outPath}: ${message}\n`);
  }
  fs.writeFileSync(
    generatedJsPath,
    `const SELF_UPDATE_BUNDLE = ${JSON.stringify(bundle, null, 2)};\n`,
    'utf8'
  );
  process.stdout.write(`Wrote ${generatedJsPath}\n`);
}

main();
