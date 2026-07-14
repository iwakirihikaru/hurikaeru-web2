# 初期ロード契約・自動更新・背景取得 棚卸し

最終更新: 2026-07-14

## 目的

- 児童画面と教師画面の初期ロード責務を重ねない。
- 自動更新の取得単位、周期、古いレスポンス破棄方法をそろえる。
- 背景取得を `初期必須` / `遅延取得` / `タブ表示時のみ` の3段階に整理する。

今回の文書は、いきなり全面リライトするためではなく、以後の最小差分修正の基準を先に固定するための棚卸し。

## 現状の観察

### 教師側

- `teacherStatusSnapshot()` は `active` だけを軽く返す想定だが、クライアント側では `status` を受ける前提も残っている。
  - 参照: [src/06_teacher.js](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/06_teacher.js:159)
  - 参照: [src/teacher_script_core.html](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/teacher_script_core.html:226)
- `teacherInit()` は units / active / roster / cached unitProgress を返していて初期ロード本体に近い。
  - 参照: [src/06_teacher.js](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/06_teacher.js:4)
- `getLessonStatus()` は status タブの本体データだが、初期ロードの流れでも暗黙に期待されやすい。
  - 参照: [src/06_teacher.js](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/06_teacher.js:1275)
- `scheduleTeacherPreload()` で名簿、記録、ヘルプ、プロンプト、集約取得が並列に走り、優先順位がコード上で見えづらい。
  - 参照: [src/teacher_script_core.html](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/teacher_script_core.html:476)

### 児童側

- `studentInit()` が、入口選択・時間選択・現在授業の初期 state・前時ふりかえり込み state の複数責務を持っている。
  - 参照: [src/04_student.js](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/04_student.js:4)
- `studentLoadState()` も current state を返し、`studentInit()` とかなり重なる。
  - 参照: [src/04_student.js](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/04_student.js:144)
- `loadMain()` 後に `studentLoadState()` / `getStudentPreviousReview()` / `getTimeline()` / `getStudentPastRecords()` が別々に走る。
  - 参照: [src/index.html](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/index.html:937)
- portable 側の bootstrap では `getStudentEntryOptions({ lightweight: true })` を先に取っており、GAS 本体の `studentInit()` と入口責務が二層になっている。
  - 参照: [portable-src/runtime-shim.js](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/portable-src/runtime-shim.js:441)

### portable 契約層

- `teacherInit` / `teacherStatusSnapshot` / `studentInit` / `studentLoadState` は `portableContractVersion: 1` で正規化済み。
  - 参照: [src/07_portable_rpc.js](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/07_portable_rpc.js:102)
  - 参照: [portable-src/runtime-shim.js](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/portable-src/runtime-shim.js:144)
- ただし、返り値の形はそろっても「どの API が何を返すべきか」の責務境界はまだ文書化されていない。

## 役割の再定義案

### 教師 API

`teacherStatusSnapshot`

- 役割: 今この瞬間の授業ポインタ確認だけ。
- 返すもの:
  - `active`
  - `build`
  - `timing`
  - `errors`
- 原則返さないもの:
  - `units`
  - `roster`
  - `unitProgress`
  - 重い `status.students`

`teacherInit`

- 役割: 教師画面の初期 shell を立ち上げる。
- 返すもの:
  - `units`
  - `unitsReadMeta`
  - `active`
  - `roster`
  - `unitProgress` のキャッシュ
  - `progressNeedsRefresh`
  - `build` / deployment 表示情報 / `errors`
- 原則返さないもの:
  - `status.students`
  - 集約記録
  - ヘルプ、プロンプト、ポートフォリオ本体

`getLessonStatus`

- 役割: status タブ専用の授業中一覧データ取得。
- 返すもの:
  - `meta`
  - `students`
- 呼ぶ条件:
  - status タブ初回表示
  - status タブ表示中の polling
  - start/end lesson 後の明示再取得

### 児童 API

`studentInit`

- 役割: 入室判断と初回表示に必要な最小データ。
- 返すもの:
  - `needPeriodSelect`
  - `unit`
  - `units`
  - `period`
  - `students`
  - `teacherSetPeriod`
  - `teacherTimelineFieldKey`
  - `studentAiEnabled`
  - `studentAiAutoSubmitEnabled`
  - `shell`
  - `num` / `name` / `fields` / `customs` / `submitted` など current state 一式
- 補足:
  - 入口 API と current state API を完全分離する案もあるが、現段階では差分を増やしすぎる。
  - まずは `studentInit = 入口 + 最初の1画面に必要な state` に固定する。

`studentLoadState`

- 役割: current state の再取得専用。
- 返すもの:
  - `fields`
  - `num`
  - `name`
  - `customs`
  - `submitted`
  - `comment`
  - `rank`
  - `medal`
  - `medalColor`
  - `aiStatus`
  - `prevReview`
  - `previousNextGoal`
  - `responseReadMeta`
  - `studentAiEnabled`
  - `studentAiAutoSubmitEnabled`
  - `shell`
- 原則返さないもの:
  - `students`
  - `units`
  - `presets`
  - 入口判定情報

## 背景取得の3段階

基本方針:

- よく使うページは、タブを開く前に裏で温める。
- タブを開いた時は、まずキャッシュや直近データを即表示し、最新化だけ裏で走らせる。
- 低頻度で重いページも、完全に「開いてから初取得」にはせず、軽い初期材料だけは先に持っておく。
- ただし AI ログ、CSV、AI 生成、更新系操作のように明示操作でよいものは先読みしない。

## ページ別の必要性と取得方針

### 教師ページ

`授業状況`

- 使用頻度: 最高。授業中に常時見る前提。
- 期待: 画面を開いた時点で表示済み、以後は自動更新。
- 方針:
  - 初期表示直後に `getLessonStatus` を先読みして cache を作る。
  - status タブ表示中は polling。
  - 古いレスポンスは requestSeq と unit/period で破棄。

`単元設定 / 授業開始`

- 使用頻度: 高。授業開始前と単元編集時に使う。
- 期待: タブを開いたら単元一覧と名簿前提の選択肢がすぐ出る。
- 方針:
  - `teacherInit` の units を即表示。
  - `teacherUnitProgressRefresh` は後追い。
  - editor presets / subject defaults は初期描画後に preload。

`名簿編集`

- 使用頻度: 中。毎時間ではないが、年度初めや調整時に使う。
- 期待: キャッシュ即表示、最新名簿は裏で更新。
- 方針:
  - `teacherInit` の roster と localStorage cache を使う。
  - タブ表示時は全体初期化を待たず `teacherRosterInit` だけ更新。

`記録閲覧`

- 使用頻度: 中から高。授業後や成績処理で使う。
- 期待: タブを開いた時に空待ちしない。
- 方針:
  - 現在授業の unit scope を優先 preload。
  - full aggregate は idle 後。
  - タブ表示時は scope cache を即表示し、必要なら最新化。

`ポートフォリオ`

- 使用頻度: 中。児童面談や所見時。
- 期待: 児童選択までは即表示、選択後も既存 aggregate から先に出す。
- 方針:
  - roster / units は初期 preload の対象。
  - full aggregate が取れていれば、最初の児童分を cache 化。
  - 全児童分を先読みしない。

`評定`

- 使用頻度: 低から中。授業中ではなく後処理。
- 期待: selector はすぐ出る。AI 仮評定など重い処理は明示操作。
- 方針:
  - units / aggregate cache を流用。
  - AI 生成は先読みしない。

`設定・AIプロンプト`

- 使用頻度: 低。ただし AI 有効状態は他ページにも影響する。
- 期待: タブを開いたら現設定がすぐ見える。
- 方針:
  - `teacherPromptInit` は初期描画後に preload。
  - API キー表示やキュー状態は cache 表示後に最新化。

`使い方`

- 使用頻度: 低から中。配布URLやQRで必要。
- 期待: タブを開いたらURL・QRがすぐ出る。
- 方針:
  - help 情報は初期描画後に preload。
  - 更新確認や詳細版情報は必要時だけ。

`AI保守・ログ`

- 使用頻度: 低。トラブル対応用。
- 期待: 開いた時に取得でよいが、待ち中の見せ方は明確にする。
- 方針:
  - ログ本文は先読みしない。
  - AI キュー概要は prompts preload で拾う。

### 児童ページ

`番号選択`

- 使用頻度: 最高。全児童が最初に触る。
- 期待: 番号一覧を最優先で出す。
- 方針:
  - portable は `getStudentEntryOptions({ lightweight: true })` を先に取る。
  - classSnapshot のような重い情報は初期必須にしない。

`入力画面`

- 使用頻度: 最高。
- 期待: 番号押下後、すぐ現在授業と入力欄を出す。
- 方針:
  - `studentInit` で最初の1画面を作る。
  - `studentLoadState` は後続の最新化。
  - `getTimeline` と前時情報は並列で裏取得。

`履歴`

- 使用頻度: 低から中。提出後に見る。
- 期待: 履歴タブを開いた時にできるだけ待たない。
- 方針:
  - 提出後だけ idle preload。
  - タブ表示時は cache を即表示し、未取得なら foreground 取得。

### 1. 初期必須

画面を成立させるために await する取得。

教師:

- `teacherStatusSnapshot`
- `teacherInit`
- 既定表示が授業状況のため、active lesson がある場合の `getLessonStatus` は初期描画後すぐ先読み

児童:

- portable の `getStudentEntryOptions({ lightweight: true })`
- 番号決定後の `studentInit`

### 2. 遅延取得

初期描画後、idle または短い delay で自動取得するもの。

教師:

- `teacherUnitProgressRefresh`
- 現在授業の集約記録 preload
- editor / prompts / help preload
- records 背景 preload
- portfolio の最小 cache 作成

児童:

- `studentLoadState` の再同期
- `getTimeline`
- `getStudentPreviousReview`
- 提出後の履歴 preload

### 3. タブ表示時のみ

開かなければ取らないもの。ただし、タブを開いた時に空待ちにならないよう、selector や cache の材料は事前に持つ。

教師:

- grading
- logs
- help の詳細更新

児童:

- `getStudentPastRecords` の foreground 表示

## 自動更新の統一ルール

### 取得ストリーム単位

以下を独立した stream として扱う。

- `teacher-active`
- `teacher-status`
- `teacher-current-aggregate`
- `student-state`
- `student-timeline`
- `student-history`

### ルール

1. 同一 stream は常に最新1件だけ有効。
2. 新しい request を投げた時点で、以前の request は UI 反映権を失う。
3. 破棄判定は `requestSeq` または `epoch` を stream ごとに持って行う。
4. 可能なら `AbortController` を使うが、まずは UI 反映前の token 判定だけでも統一する。
5. stream ごとに `key` を持つ。
   - 例: `student-timeline:${unitId}:${period}:${num}`
   - 例: `teacher-status:${unitId}:${period}`
6. key が変わったら旧レスポンスは必ず破棄する。

### この repo で既にある実装パターン

- 教師全体 epoch:
  - [src/teacher_script_core.html](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/teacher_script_core.html:209)
- レポート系 requestSeq:
  - [src/teacher_script_reports.html](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/teacher_script_reports.html:519)
- 児童 timeline の in-flight 制御:
  - [src/index.html](C:/Users/Iwaki/codex-workspaces/hurikaeru-web2/src/index.html:1634)

### 次の整理方針

- 既存の `teacherDataEpoch` と個別 `requestSeq` を消すのではなく、命名を `stream token` に寄せる。
- 新規 helper を足すなら、まずは共通 util ではなく各画面の script 内で薄く始める。
- `pollBusy` だけでは「前の遅いレスポンスが後から勝つ」問題を抑えきれないため、timeline と status には token 判定を追加する。

## 画面ごとの目標フロー

### 教師初期ロード

1. `teacherStatusSnapshot`
2. `active` を描画
3. `teacherInit`
4. units / roster / cached unitProgress 反映
5. idle 後に `teacherUnitProgressRefresh`
6. status タブ表示中だけ `getLessonStatus`

### 児童初期ロード

1. portable 入口 bootstrap
2. 出席番号表示
3. `studentInit`
4. current state で main 描画
5. 遅延で `studentLoadState`
6. 並列で `getTimeline` と `getStudentPreviousReview`
7. 提出後だけ idle preload で `getStudentPastRecords`

## 半日から1日の作業順

### 先にやる

1. 契約コメントを `src/04_student.js` と `src/06_teacher.js` に追加する。
2. `teacher_script_core.html` の `loadInit` / `loadStatusInit` で、snapshot と status fetch の責務を分ける。
3. `src/index.html` の `studentInit` 後続取得を `初期必須 / 遅延 / タブ時のみ` にコメントで明示する。
4. `teacher-status` と `student-timeline` に token 判定を追加する。

### 後回しでよい

1. API 名の変更
2. 新しい master API への全面移行
3. portable `rpc` 互換の縮小

## 非目標

- 今回の棚卸しでは全面リファクタしない。
- server API の返り値を破壊的に変えない。
- 旧クライアント互換をこの段階では落とさない。

## 判断基準

- 初期描画が 1 回でも早く出るか。
- そのために別 API を増やさず、既存 API の責務だけ整理できるか。
- 重い取得が status タブや history タブを開く前に走っていないか。
- 古いレスポンスが最後に UI を上書きしないか。

## 授業記録の軽量化方針

授業記録は「通信で送る量」と「サーバーが読む量」を分けて考える。

### 先に効くもの

- 同じ `fields` を各行へ繰り返し入れず、field set 辞書として1回だけ送る。
- compact 行は `rowSchema` で列名を持たせ、クライアントでは schema を見て従来の `rows` 形へ展開する。
- compact 時の `fields` は表示・評定で使う属性だけに絞り、`answersMap` は空値を落として送る。
- `getAggregateDataJson(..., { compact:true })` を既定にし、旧形式も残す。

### 次に効くもの

- 初期 preload は `unit` scope を優先し、`full` は idle 後。
- 表示プリセットが `standard` のときは、必要項目だけを返す `view` option を追加する。
- 評定用、ポートフォリオ用、CSV用で必要な列が違うため、用途別 payload を分ける。

### 後回し

- Base64 / gzip 相当の文字列圧縮。
  - GAS / `google.script.run` では展開コストと実装複雑度が増えやすい。
  - まずは「重複を送らない」「不要列を送らない」方が安全で効果が読みやすい。
