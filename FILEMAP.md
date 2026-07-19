# FILEMAP

生成物は直接編集しない。`portable/`、`portable-publish/`、ルートの `index.html` / `teacher.html` / `student.html` / `setup.html` / `runtime-shim.js` は生成反映先として扱う。

## 入口
- teacher画面UI: 正規ソースは `src/teacher.html` と `src/teacher_*.html`。関連ロジックは `src/06_teacher.js`。
- teacherお気に入り: 正規ソースは `src/06_teacher.js`。必要時のみ `src/teacher_section_*` / `src/teacher_subsection_*` を見る。
- teacher RPC: 正規ソースは `src/07_portable_rpc.js`。
- student画面: 正規ソースは `src/04_student.js`。関連テンプレートは `src/index.html`。
- aggregate: 正規ソースは `src/teacher_section_aggregate.html` と `src/teacher_subsection_aggregate.html`。関連ロジックは `src/06_teacher.js`。
- portfolio: 正規ソースは `src/teacher_section_portfolio.html` と `src/teacher_subsection_portfolio.html`。関連ロジックは `src/06_teacher.js`。
- runtime-shim: 正規ソースは `portable-src/runtime-shim.js`。生成物の `portable/runtime-shim.js` とルート `runtime-shim.js` は直接編集しない。
- GAS / Spreadsheet: 正規ソースは `src/10_master_gas_api_v1.js`。初期化とドメイン境界は `src/00_bootstrap.js` と `src/03_domain.js`。
- portable build: 正規ソースは `scripts/build-static-port.mjs` と `scripts/sync-portable-publish.mjs`。生成物の `portable/` と `portable-publish/` は直接編集しない。
- Pages公開: 使用コマンドは `npm run publish:portable-publish`。実体 script は `scripts/publish-portable-publish.ps1`。`scripts/publish-pages-worktree.ps1` はそのラッパー。
- GAS deploy: 使用コマンドは `npm run deploy:script`。実体 script は `scripts/deploy-script.ps1`。
- full deploy: 使用コマンドは `npm run deploy:full`。実体 script は `scripts/deploy-full.ps1`。
- tenant / permission: 正規ソースは `src/03_domain.js`。teacher 側の関連表示や操作は必要時のみ `src/teacher_script_admin.html` を見る。
