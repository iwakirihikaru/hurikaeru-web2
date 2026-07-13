# Master GAS API v1.0 現行監査

## 0. 監査の目的

この文書は、現行ふりかえり GAS が `Master GAS API v1.0` の「土管」設計とどこでズレているかを整理し、移行対象を keep / wrap / move / retire に分けるための監査結果である。

## 1. 監査対象

- `src/00_bootstrap.js`
- `src/01_webapp.js`
- `src/02_setup.js`
- `src/03_domain.js`
- `src/04_student.js`
- `src/05_ai_queue.js`
- `src/06_teacher.js`
- `src/07_portable_rpc.js`
- `src/10_master_gas_api_v1.js`

非対象:

- Cloudflare Pages 側の詳細実装
- 他 repo の Circle 系アプリ

## 2. 総論

現行 GAS には次が混在している。

- Web API
- HTML 画面返却
- Spreadsheet UI 導線
- 導入補助
- 教師ロジック
- 児童ロジック
- AI キュー
- 更新バンドル
- 配布テンプレ運用

`Master GAS API v1.0` が目指す形は「固定 action の薄い API」であり、現状はその逆である。したがって、全面改修ではなく、責務ごとに切り離す段階移行が前提になる。

## 3. 現行の主な事実

### 3.1 API 入口と UI が混在

対象:

- [src/01_webapp.js](D:/Iwaki/Documents/ふりかえり/src/01_webapp.js:4)
- [src/01_webapp.js](D:/Iwaki/Documents/ふりかえり/src/01_webapp.js:163)

確認:

- `doGet()` は `teacher` / `student` HTML を返す。
- `doGet()` は 2026-07-11 時点で管理用 JSON ルートを持たず、`teacher` / `student` HTML のみを返す。
- `doPost()` は 2026-07-11 時点で v1 action のほか `rpc` / `teacherDiag` を抱えている。

評価:

- v1 の入口としては責務過多。
- API と UI と運用処理の分離が必要。

補足:

- `copyChooser` は 2026-07-11 時点で admin webapp 側へ移し、main webapp の GET 依存から外した。
- `updateBundle` も 2026-07-11 時点で main webapp の GET 依存から外し、管理 webapp の `releaseManifest` が外部 bundle URL を返す形へ寄せた。
- `createDistributionTemplateNoUi` / `refreshTemplateMaster` / `refreshShellConfigCache` は 2026-07-11 時点で main webapp の POST 公開面から外した。
- `tenantSetup` も 2026-07-11 時点で main webapp の POST 公開面から外し、自己更新時の再反映は tenant 内部関数へ閉じた。

### 3.2 `rpc` 方式が広すぎる

対象:

- [src/07_portable_rpc.js](D:/Iwaki/Documents/ふりかえり/src/07_portable_rpc.js:1)
- [src/07_portable_rpc.js](D:/Iwaki/Documents/ふりかえり/src/07_portable_rpc.js:58)

確認:

- 2026-07-11 時点の `src/07_portable_rpc.js` は、公開面を明示ハンドラ表 `PORTABLE_ACTION_HANDLERS_` に寄せ始めている。
- `dispatchPortableRpc_()` は後方互換で残るが、内部では固定 action dispatcher を経由する。
- portable 側 `runtime-shim` も `action: "<method>"` の直接送信へ切替を始めている。

評価:

- 固定 action 設計と不一致。
- 公開面が広く、監査しづらい。
- ただし `rpc` 文字列入口自体はまだ残っており、完全停止までは未到達。

### 3.3 `onOpen` / Sidebar / Spreadsheet UI 依存が強い

対象:

- [src/01_webapp.js](D:/Iwaki/Documents/ふりかえり/src/01_webapp.js:268)
- `src/02_setup.js`

確認:

- `onOpen()` がメニュー生成、導入トースト、配布導線を持つ。
- `SpreadsheetApp.getUi()` を前提にした導入・配布導線が残る。
- Sidebar / Dialog 系が継続利用されている。

評価:

- Master API 本体責務ではない。
- スプレッドシート UI 依存は Cloudflare 主導構成の障害になる。

### 3.4 旧導線がまだ残る

対象:

- [src/00_bootstrap.js](D:/Iwaki/Documents/ふりかえり/src/00_bootstrap.js:19)
- `src/02_setup.js`

確認:

- `SHEET_INTRO = 'はじめに'`
- `SHEET_NEXT = 'つぎへ'`
- `cleanupLegacyGuideSheets_(ss)` が残る

評価:

- 旧 UI 遺産。
- v1 本体へ持ち込むべきではない。

### 3.5 シート責務が細かく分かれすぎている

対象:

- [src/00_bootstrap.js](D:/Iwaki/Documents/ふりかえり/src/00_bootstrap.js:14)

現行主要シート:

- `設定`
- `教科デフォルト`
- `単元一覧`
- `単元集約`
- `項目プリセット`
- `Students`
- `Lessons`
- `Responses`
- `ResponseHistory`
- `AuditLog`
- `TeacherAssessments`
- `AiEventLog`

評価:

- アプリ専用構造としては自然だが、共通 API としては肥大。
- `Records / Config / Master / Logs` への再配置が必要。

### 3.6 上書き系ロジックが多い

対象:

- [src/03_domain.js](D:/Iwaki/Documents/ふりかえり/src/03_domain.js:113)
- [src/03_domain.js](D:/Iwaki/Documents/ふりかえり/src/03_domain.js:187)
- [src/03_domain.js](D:/Iwaki/Documents/ふりかえり/src/03_domain.js:1371)
- [src/03_domain.js](D:/Iwaki/Documents/ふりかえり/src/03_domain.js:1840)
- [src/06_teacher.js](D:/Iwaki/Documents/ふりかえり/src/06_teacher.js:2643)

確認:

- `saveTeacherAssessment()`
- `upsertTeacherAssessments_()`
- `upsertResponse_()`
- `updateResponseAiResult_()`
- `writeGlobalConfig()`
- `writeGlobalConfigBatch()`
- `updateSubjectDefault()`

評価:

- `Records` append-only 方針と正面衝突する。
- 最新状態を GAS 内で直接保持する構造が強い。

### 3.7 ロック方針が揺れている

対象:

- [src/04_student.js](D:/Iwaki/Documents/ふりかえり/src/04_student.js:438)
- [src/05_ai_queue.js](D:/Iwaki/Documents/ふりかえり/src/05_ai_queue.js:173)
- [src/03_domain.js](D:/Iwaki/Documents/ふりかえり/src/03_domain.js:2230)
- [src/03_domain.js](D:/Iwaki/Documents/ふりかえり/src/03_domain.js:2391)

確認:

- `tryLock(...)` を使う系と `waitLock(10000)` を使う系が混在する。

評価:

- v1 の短時間失敗方針と不一致。
- 将来の API 面では `LOCK_TIMEOUT` に揃える必要がある。

### 3.8 GAS が業務意味を理解しすぎている

対象:

- `src/04_student.js`
- `src/05_ai_queue.js`
- `src/06_teacher.js`
- `src/03_domain.js`

確認:

- 授業中判定
- 再提出判定
- メダル集計
- AI コメント生成
- ポートフォリオ集計
- 評定ドラフト
- 画面向けデータ整形

評価:

- v1 本体では持たない責務。
- Cloudflare 側へ移すべき領域が大きい。

## 4. 機能別の棚卸し

### 4.1 keep: v1 本体に残す

- `src/10_master_gas_api_v1.js`
  - 固定 action ルータ
  - 固定 4 シート作成
  - append / get / upsert / log の最小操作
- `src/01_webapp.js`
  - `doPost()` の JSON 入口
  - 将来的な `doGet()` の接続確認テキスト
- スプレッドシート接続基盤
  - `getTenantSpreadsheet_()` など

### 4.2 wrap: 移行期間だけラップして残す

- 旧 `Responses` 読取アダプタ
- 旧 `設定` 読取アダプタ
- 旧 `Students` / `Lessons` / `単元一覧` 読取アダプタ
- 既存 UI が壊れないための暫定変換層

### 4.3 move: Cloudflare 側へ移す

- 児童 UI 状態管理
- 教師 UI 状態管理
- 最新レコード判定
- `clientSubmitId` 重複除去
- 授業状況集約
- ポートフォリオ整形
- 評定整形
- AI オーケストレーション

### 4.4 retire: 最終的に止める

- `rpc` allowlist 公開
- `globalThis[method]` 実行
- `onOpen()`
- Sidebar / Dialog
- `copyChooser`
- `teacherDiag`
- 旧 `はじめに` / `つぎへ` 導線

## 5. 4 シートへの落とし込み

### 5.1 `Records` に寄せるもの

- `Responses`
- `ResponseHistory`
- 教師返却
- AI 結果
- メダル付与イベント
- 論理削除イベント

注意:

- 現行 `Responses` は latest snapshot 的に使われている。
- v1 では「何が起きたか」を追記し、最新選定は Cloudflare 側で行う。

### 5.2 `Config` に寄せるもの

- `設定`
- 一部の `教科デフォルト`
- active unit / active period
- 各種フラグや prompt 設定

注意:

- `writeGlobalConfigBatch()` の一括再書き込みは v1 設計と相性が悪い。
- key 単位の保存へ寄せる必要がある。

### 5.3 `Master` に寄せるもの

- `Students`
- `Lessons`
- `単元一覧`
- `項目プリセット`
- クラス定義

候補 `masterType`:

- `roster`
- `lesson`
- `unit`
- `fieldPreset`
- `class`

### 5.4 `Logs` に寄せるもの

- `AuditLog`
- `AiEventLog`
- 配布や接続に関する操作ログのうち残したいもの

## 6. 画面依存と旧導線の監査

Master API 観点では次は本線外と判断する。

- HTML を返す `doGet()`
- `include(filename)`
- `openTeacherPage_()`
- `openStudentPage_()`
- `showWebAppDeploySidebar()`
- `showWebAppUrlCaptureSidebar()`
- 導入パネル系
- `createDistributionTemplate*`
- `refreshTemplateMaster*`
- `updateBundle`

理由:

- どれも API の固定 action 契約に不要。
- 画面や運用の都合であり、共通 API 本体の責務ではない。

## 7. 現時点の結論

### 7.1 監査結論

- `src/10_master_gas_api_v1.js` は方向として正しい。
- ただし repo 全体の主系はまだ旧構造で、v1 は同居中の別系統である。
- そのため、次に必要なのは新機能追加ではなく境界固定である。

### 7.2 優先度

1. `SPEC` を正として固定する
2. `AUDIT` で旧責務を keep / wrap / move / retire に分ける
3. `MIGRATION_PLAN` で並走移行の順序を固定する
4. その後に v1 の最小実装と Cloudflare 側切替を進める

## 8. 監査に基づく次アクション

- `doGet()` を最終的に接続確認テキスト専用へ縮退させる準備をする
- `rpc` の利用面を把握し、新 API action へ置き換える単位を決める
- `Responses` 系の append-only 移行ルールを Cloudflare 側前提で確定する
- 旧 UI / `onOpen` / Sidebar をいつ止めるかを移行計画に明記する
