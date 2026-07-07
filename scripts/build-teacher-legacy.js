const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const workspace = path.resolve(__dirname, '..');
const targets = [
  'src/teacher_script_core.html',
  'src/teacher_script_units.html',
  'src/teacher_script_admin.html',
  'src/teacher_script_reports.html',
];

function transpileHtmlScript(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const match = source.match(/<script>([\s\S]*)<\/script>\s*$/);
  if (!match) {
    throw new Error(`No <script> block found in ${filePath}`);
  }
  const js = match[1];
  const transpiled = ts.transpileModule(js, {
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.None,
      downlevelIteration: false,
      removeComments: false,
    },
  }).outputText.trim();
  const outPath = filePath.replace(/\.html$/, '_legacy.html');
  const wrapped = `<script>\n${transpiled}\n</script>\n`;
  fs.writeFileSync(outPath, wrapped, 'utf8');
  return outPath;
}

targets.forEach(relPath => {
  transpileHtmlScript(path.join(workspace, relPath));
});

