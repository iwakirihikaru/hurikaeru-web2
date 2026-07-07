# ふりかえりアプリ FILEMAP

## 使い方

- 新スレでは、まずこのファイルと `HANDOFF.md` だけ渡す。
- 新スレの最初の一言はこれでよい:
  `FILEMAP.md と HANDOFF.md を見て続けて。`
- 依頼は次の4点だけで十分:
  - 対象
  - 現象
  - 期待動作
  - 触らない範囲
- 基本運用は `編集 -> 確認 -> ビルド/デプロイ`。
- この環境では `workdir` や相対パスが不安定なことがあるので、読込・検索は絶対パス優先。

## 最小依頼テンプレ

`FILEMAP.md と HANDOFF.md を見て続けて。`
`対象:`
`現象:`
`期待動作:`
`触らない範囲:`

## 主系の見方

- 児童・先生の配布導線:
  `portable/`, `portable-publish/`
- 保存本体と API:
  `src/00_bootstrap.js` から `src/07_portable_rpc.js`
- 現行の GAS UI:
  `src/index.html`, `src/teacher.html`
  - 互換UI兼、portable 生成元

## Web 配布側

- `portable/`
  - 静的配布版の生成物
  - `teacher.html`, `student.html`, `setup.html`, `runtime-shim.js`
- `portable-publish/`
  - 公開反映用のコピー
  - Pages へ出す前の最終確認先
- `portable-tenant/`
  - 個人配布向け GAS API の作業元
  - `src/` のミラーを含む

## GAS 本体

- `src/00_bootstrap.js`
  定数、ビルド番号、URL、AI関連定数
- `src/01_webapp.js`
  `doGet()`、`doPost()`、bootstrap 注入、web app 入口
- `src/02_setup.js`
  初期設定、導入補助、URL反映、テンプレ更新
- `src/03_domain.js`
  DB、名簿、単元、Lessons/Responses、キャッシュ
- `src/04_student.js`
  児童 API。`studentInit()`、`studentLoadState()`、`getTimeline()`
- `src/05_ai_queue.js`
  AIキュー本体。claim、retry、trigger、batch
- `src/06_teacher.js`
  教師 API。授業状況、集約、CSV、ポートフォリオ、仮評定
- `src/07_portable_rpc.js`
  portable から叩く RPC の allowlist

## GAS UI 側

- 児童画面:
  `src/index.html`
  - portable `student.html` の生成元
- 教師画面親:
  `src/teacher.html`
  - portable `teacher.html` の生成元
- 教師画面互換補助:
  `src/teacher_polyfills.html`, `src/teacher_preflight.html`
- 教師画面セクション:
  `src/teacher_section_*.html`
- 教師画面スクリプト:
  `src/teacher_script_*.html`
  - 実デプロイで読むのは `src/teacher_script_*_legacy.html`
- 教師画面スタイル:
  `src/teacher_styles.html`

## ビルド・反映

- `scripts/build-static-port.ps1`
  `src` から `portable` を再生成
- `scripts/deploy-webapp.ps1`
  本体、テンプレ、admin、provision をまとめて更新
- `scripts/build-update-bundle.js`
  `remote_inspect/update-bundle.json` と `src/99_update_bundle.js` を再生成

## 迷ったときの対応表

- Web配布の導線や `pages.dev` 向け画面:
  `portable/`, `portable-publish/`, `scripts/build-static-port.ps1`
- 児童ページの遅さや提出挙動:
  `src/index.html`, `src/04_student.js`, `src/03_domain.js`
- AIコメントが遅い:
  `src/05_ai_queue.js`
- 授業状況タブ:
  `src/06_teacher.js`, `src/teacher_section_status.html`, `src/teacher_script_units.html`
- ログタブ / AI観測:
  `src/06_teacher.js`, `src/teacher_section_logs.html`, `src/teacher_script_admin.html`
- 記録を見る / 評定する:
  `src/06_teacher.js`, `src/teacher_section_aggregate.html`, `src/teacher_section_grading.html`, `src/teacher_script_reports.html`
- 単元設定:
  `src/03_domain.js`, `src/06_teacher.js`, `src/teacher_section_units.html`, `src/teacher_script_units.html`
- ポートフォリオ:
  `src/06_teacher.js`, `src/teacher_section_portfolio.html`, `src/teacher_script_reports.html`

## 原則

- サーバー側だけの修正なら HTML は読まない。
- Web配布側の挙動修正は、まず `src` を直し、その後 `build:portable` で生成物へ流す。
- `portable/teacher.html` や `portable/student.html` を直接いじらない。
- 教師UI修正後は、`teacher_script_*_legacy.html` を手編集せず、`deploy:webapp` かビルドスクリプトで再生成する。
- AI不具合はまず `src/05_ai_queue.js` を起点にする。
- 詳細な AI 調査は常設UIより `AiEventLog` と `🪵 ログ` タブを優先する。
- 読込失敗を避けるため、`Set-Location` や `.\...` より絶対パス指定を優先する。
- 運用判断が絡むときは `OPERATIONS.md` も見る。
