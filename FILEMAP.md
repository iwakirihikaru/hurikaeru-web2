# ふりかえりアプリ FILEMAP

## 使い方
- 新スレでは、まずこのファイルと `HANDOFF.md` を読む。
- 作業ルールは `AGENTS.md`、長期前提は `memory.md`、作業モード別の手順は `skills/` を見る。
- 新スレの最初の一言はこれでよい:
  `FILEMAP.md と HANDOFF.md を見て続けて。`
- 依頼は次の4点だけで十分:
  - 対象
  - 現象
  - 期待動作
  - 触らない範囲

## 最小依頼テンプレ
`FILEMAP.md と HANDOFF.md を見て続けて。`
`対象:`
`現象:`
`期待動作:`
`触らない範囲:`

## トップレベルの役割
- `src/`
  GAS 本体と基準UI。児童画面、教師画面、API、AI キューの主作業場所。
- `portable/`
  Web 配布用の生成物。直接編集しない。
- `portable-publish/`
  公開反映用のコピー置き場。公開前の最終確認先。
- `portable-tenant/`
  個人配布向け GAS API の作業元。
- `onboarding/`
  導入管理まわりの元ファイル。
- `admin-src/`
  導入管理画面の生成物。原則直接編集しない。
- `provision-src/`
  provision 用の GAS ソース。
- `remote_inspect/`
  更新バンドルや遠隔確認用の補助資材。
- `scripts/`
  ビルド、再生成、デプロイ用スクリプト。
- `webapp/`
  Next.js ベースの試作系。現行主線ではない。
- `mvp/`
  旧 MVP 系の試作。
- `cdn/`
  静的配布補助ファイル。
- `supabase/`
  Webapp 試作用の SQL。

## 主系の見方
- 保存本体と API:
  `src/00_bootstrap.js` から `src/07_portable_rpc.js`
- 現行の GAS UI:
  `src/index.html`, `src/teacher.html`
- Web 配布の導線:
  `portable/`, `portable-publish/`
- 導入管理:
  `onboarding/`, `admin-src/`, `provision-src/`

## `src/` の役割
- `src/00_bootstrap.js`
  定数、ビルド番号、URL、AI関連定数。
- `src/01_webapp.js`
  `doGet()`、`doPost()`、bootstrap 注入、Web app 入口。
- `src/02_setup.js`
  初期設定、導入補助、URL反映、テンプレ更新。
- `src/03_domain.js`
  データ層。名簿、単元、Lessons、Responses、キャッシュ。
- `src/04_student.js`
  児童 API。`studentInit()`、`studentLoadState()`、`getTimeline()`。
- `src/05_ai_queue.js`
  AI キュー本体。claim、retry、trigger、batch。
- `src/06_teacher.js`
  教師 API。授業状況、集約、CSV、ポートフォリオ、仮評定。
- `src/07_portable_rpc.js`
  portable から叩く RPC の allowlist。
- `src/08_data_migration.js`
  データ移行処理。
- `src/10_master_gas_api_v1.js`
  Master GAS API v1.0 の固定4シート API。`PING`、`APPEND_RECORD`、`GET_RECORDS`、`UPSERT_CONFIG`、`GET_CONFIG`、`UPSERT_MASTER`、`GET_MASTER`、`APPEND_LOG` を扱う。
- `portable-src/runtime-shim.js`
  Web 配布版の接続補助ランタイム元。`localStorage.GAS_API_URL` を扱い、GAS本体には push しない。
- `src/99_update_bundle.js`
  更新バンドルの生成先。

## UI テンプレート
- 児童画面:
  `src/index.html`
- 教師画面親:
  `src/teacher.html`
- 教師画面補助:
  `src/teacher_modal.html`, `src/teacher_nav.html`, `src/teacher_polyfills.html`, `src/teacher_preflight.html`
- 教師画面セクション:
  `src/teacher_section_*.html`
  - `src/teacher_section_help.html` は、先生URL・児童URL・接続補助URL・登録ページの配布導線を持つ。
- 教師画面サブセクション:
  `src/teacher_subsection_*.html`
- 教師画面スクリプト:
  `src/teacher_script_*.html`
- legacy 生成物:
  `src/teacher_script_*_legacy.html`
- 教師画面スタイル:
  `src/teacher_styles.html`

## Phase F の整理観点
- `legacy` 命名:
  名前は古いが、現時点では生成フロー名として残しているもの。
  代表:
  `src/teacher_script_*_legacy.html`, `scripts/build-teacher-legacy.js`
- 現役 fallback:
  いまも実行経路として意味がある分岐や互換処理。
  名前だけで削除候補と決めず、実際の呼び出し有無と運用導線で判断する。
- 互換資産:
  すぐ本線で触らなくても、配布・再生成・比較確認のため残しているもの。
  代表:
  `portable-publish/`, `admin-src/`, `scripts/build-static-port.ps1`

## Web 配布側
- `portable/index.html`
  Web 版児童画面の生成物。
- `portable/teacher.html`
  Web 版教師画面の生成物。
- `portable/student.html`
  Web 版児童導線の補助ページ。
- `portable/setup.html`
  初回接続用ページ。
- `portable/runtime-shim.js`
  静的配布の実行補助。

## 導入管理と配布
- `onboarding/admin-app.js`, `onboarding/admin-guide.html`, `onboarding/admin-register.html`
  導入管理 UI の元。
- `admin-src/admin-app.js`, `admin-src/admin-guide.html`, `admin-src/admin-register.html`
  生成済みの admin 配布物。
- `provision-src/provision-app.js`
  provision 用アプリ本体。

## ビルド・反映
- `scripts/build-static-port.mjs`
  `src/` から `portable/` を再生成する現行 Node 版ビルド。
- `scripts/sync-portable-publish.mjs`
  `portable/` の公開対象を `portable-publish/` へ同期する。
- `scripts/publish-portable-publish.ps1`
  `portable/` 再生成、`portable-publish/` 同期、commit、push をまとめて行う。
- `scripts/build-static-port.ps1`
  旧 PowerShell 版ビルド。
- `scripts/build-teacher-legacy.js`
  teacher legacy スクリプト再生成。
- `scripts/build-update-bundle.js`
  `remote_inspect/update-bundle.json` と `src/99_update_bundle.js` を再生成。
- `scripts/test-master-gas-api.ps1`
  Master GAS API v1.0 を `POST` で叩く確認用スクリプト。既定は `PING`。
- `scripts/deploy-webapp.ps1`
  本体、テンプレ、admin、provision のまとめ更新。
- `scripts/deploy-script.ps1`
  任意の `scriptId` へ `src/` を push して Webアプリを新規作成または再デプロイする汎用スクリプト。

## 迷ったときの対応表
- Web 配布の導線や `pages.dev` 向け画面:
  `src/` と `portable/` の両方を確認する。
- 児童ページの遅さや提出挙動:
  `src/index.html`, `src/04_student.js`, `src/03_domain.js`
- AI コメントが遅い:
  `src/05_ai_queue.js`
- 授業状況タブ:
  `src/06_teacher.js`, `src/teacher_section_status.html`, `src/teacher_script_units.html`
- ログタブや AI 観測:
  `src/06_teacher.js`, `src/teacher_section_logs.html`, `src/teacher_script_admin.html`
- 記録閲覧や評定:
  `src/06_teacher.js`, `src/teacher_section_aggregate.html`, `src/teacher_section_grading.html`, `src/teacher_script_reports.html`
- 単元設定:
  `src/03_domain.js`, `src/06_teacher.js`, `src/teacher_section_units.html`, `src/teacher_script_units.html`
- ポートフォリオ:
  `src/06_teacher.js`, `src/teacher_section_portfolio.html`, `src/teacher_script_reports.html`

## 原則
- サーバー側だけの修正なら HTML は必要箇所だけ読む。
- 反映は個別コマンドをばらばらに打つより、基本 `C:\Program Files\nodejs\npm.cmd run deploy:webapp` で一気に進める。
- Web 配布の挙動修正は、まず `src/` を直し、その後ビルドで生成物へ流す。
- 長期運用では `portable/` を本線として `main` へ取り込み、本番公開は `main` 側で行う。
- `portable-publish/` への反映は互換用途だけに使い、恒常的な本番公開導線にはしない。
- `portable/teacher.html` や `portable/student.html` を直接いじらない。
- `teacher_script_*_legacy.html` は手編集せず、生成フローで再作成する。
- AI 不具合はまず `src/05_ai_queue.js` を起点にする。
- 変わりやすい URL、deploymentId、version、直近変更は `HANDOFF.md` を正とする。



## ユーザー案内
- ユーザーに依頼が必要なときは、「開く画面」「押す場所」「返してほしい文字列」を順に書く。
- branch や deploy 状態の確認依頼は、専門用語だけで投げず、そのまま読める返答例も添える。
