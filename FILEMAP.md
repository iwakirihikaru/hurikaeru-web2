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
- 基本運用は `編集 -> 確認 -> デプロイ`。
- この環境では `workdir` や相対パスが不安定なことがあるので、読込・検索は絶対パス優先。

## 最小依頼テンプレ

`FILEMAP.md と HANDOFF.md を見て続けて。`
`対象:`
`現象:`
`期待動作:`
`触らない範囲:`

## サーバー側

- `src/00_bootstrap.js`
  定数、シート名、AI関連定数、プリセット
- `src/01_webapp.js`
  `doGet()`、メニュー、`include()`
- `src/02_setup.js`
  初期化、設定、教科デフォルト、項目プリセット
- `src/03_domain.js`
  DB、名簿、単元、回答保存、履歴、監査ログ
- `src/04_student.js`
  児童API。`studentInit()`、`studentLoadState()`、`getTimeline()`、`autoSave()`、`submitReview()`
- `src/05_ai_queue.js`
  AIキュー本体。claim、retry、trigger、persist retry、集約キュー
- `src/06_teacher.js`
  教師API。授業状況、集約、CSV、ポートフォリオ、仮評定、AIログ取得

## 画面側

- 児童画面:
  `src/index.html`
- 教師画面親:
  `src/teacher.html`
- 教師画面互換補助:
  `src/teacher_polyfills.html`, `src/teacher_preflight.html`
- 教師画面セクション:
  `src/teacher_section_*.html`
- 教師画面スクリプト:
  `src/teacher_script_*.html`
  - 実デプロイで読むのは `src/teacher_script_*_legacy.html`
- 教師画面スタイル:
  `src/teacher_styles.html`
- 変換スクリプト:
  `scripts/build-teacher-legacy.js`

## 迷ったときの対応表

- AIコメントが遅い:
  `src/05_ai_queue.js`
- 提出や保存の挙動:
  `src/04_student.js`, `src/03_domain.js`
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
- 教師UI修正は対象タブの `section` と `script` を先に読む。
- 教師UI修正後は、`teacher_script_*_legacy.html` を手編集せず、`deploy:webapp` か `scripts/build-teacher-legacy.js` で再生成する。
- AI不具合はまず `src/05_ai_queue.js` を起点にする。
- 詳細な AI 調査は常設UIより `AiEventLog` と `🪵 ログ` タブを優先する。
- 読込失敗を避けるため、`Set-Location` や `.\...` より絶対パス指定を優先する。
- 運用判断が絡むときは `OPERATIONS.md` も見る。
