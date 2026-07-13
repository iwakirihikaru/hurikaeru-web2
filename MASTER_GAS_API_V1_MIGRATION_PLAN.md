# Master GAS API v1.0 移行計画

## 0. 目的

現行のふりかえり GAS を、現場運用を止めずに `Master GAS API v1.0` へ段階移行する。

この文書は「何をいつ止めるか」「どこを先に並走させるか」を固定するための計画書であり、一気の全面置換を前提にしない。

## 1. 移行の原則

- 既存 UI をすぐ壊さない。
- 既存 deployment を即時一本化しない。
- 先に契約を固定し、その後に実装を寄せる。
- GAS は薄く、Cloudflare は厚くする。
- 新旧シートはしばらく並走を許容する。
- 旧系撤去は最後に行う。

## 2. 到達イメージ

到達形は次とする。

- 先生ごとの環境はデータと設定を持つ
- GAS は固定 action の共通 API と最小管理処理だけを持つ
- UI、集計、最新判定、重複除去、表示整形は Cloudflare Pages 側が持つ
- 本体ロジック更新は Web 側と共通 API 側で吸収する

## 3. スコープ

### 3.1 今回の主スコープ

- `MASTER_GAS_API_V1_SPEC.md`
- `MASTER_GAS_API_V1_AUDIT.md`
- `MASTER_GAS_API_V1_MIGRATION_PLAN.md`
- `src/10_master_gas_api_v1.js` の最小 action 群
- `src/01_webapp.js` での v1 入口維持

### 3.2 今回の非スコープ

- 旧教師 UI の全面作り直し
- 旧児童 UI の全面作り直し
- AI キューの即時移管完了
- 配布運用の全面再設計

## 4. keep / stop / wrap の方針

### 4.1 残すもの

- `src/10_master_gas_api_v1.js`
- `doPost()` の JSON 入口
- `getTenantSpreadsheet_()` などの基盤
- 固定 4 シートの初期化

### 4.2 先にラップするもの

- 旧 `Responses` 読取
- 旧 `設定` 読取
- 旧 `Students` / `Lessons` / `単元一覧` 読取
- 旧 UI から新 API を呼ぶ橋渡し

### 4.3 止めるもの

- `rpc` の本線利用
- `globalThis[method]` 公開
- `doGet()` の JSON / HTML 多用途返却
- `onOpen`
- Sidebar / Dialog
- 旧 `はじめに` / `つぎへ`

## 5. フェーズ定義

### Phase A 設計固定

目的:

- 契約を先に固定する

実施内容:

- `MASTER_GAS_API_V1_SPEC.md` を正仕様化
- `action` 一覧を固定
- 固定 4 シートを固定
- `POST` 統一を固定
- `error.code` を固定
- `limit` ルールを固定
- `deleted` の意味を固定
- `clientSubmitId` の扱いを固定
- 「GAS は土管、業務判断は Cloudflare」を明文化

完了条件:

- 仕様の解釈ブレがなくなる

2026-07-11 時点:

- 文書更新済み
- 実装は `src/10_master_gas_api_v1.js` と概ね整合
- `doGet()` の接続確認専用化は未完了だが、管理用 GET 例外は外し始めている

### Phase B 現行監査

目的:

- 旧責務を棚卸しして、移すものと残すものを分ける

実施内容:

- `MASTER_GAS_API_V1_AUDIT.md` を作成・更新
- 機能別関数を keep / wrap / move / retire に分類
- 画面依存、`onOpen`、Sidebar、旧導線を洗い出す
- 任意シートではなく「多シート依存」である実態を整理
- 上書き系ロジックを洗い出す
- `Records / Config / Master / Logs` に落とせるものを分ける

完了条件:

- 移行境界が文書で共有できる

2026-07-11 時点:

- 文書更新済み
- `src/01_webapp.js` / `src/07_portable_rpc.js` / `src/03_domain.js` の主論点を反映済み

### Phase C 移行計画

目的:

- 並走前提で順序を固定する

実施内容:

- `MASTER_GAS_API_V1_MIGRATION_PLAN.md` を正計画化
- 残す関数、止める関数、先にラップする箇所、最後に消す箇所を段階化
- 既存 UI を壊さない並走期間を明記

完了条件:

- 実装前に「どの順で切るか」が共有される

2026-07-11 時点:

- 本文書を更新済み

### Phase D API 実装

目的:

- v1 の最小本体を別系統で成立させる

実施内容:

- `doPost()` に v1 共通ルータを置く
- `PING`
- `APPEND_RECORD`
- `GET_RECORDS`
- `UPSERT_CONFIG`
- `GET_CONFIG`
- `UPSERT_MASTER`
- `GET_MASTER`
- `APPEND_LOG`
- `doGet()` は接続確認テキストだけに寄せる

完了条件:

- 旧 UI / `rpc` と独立して v1 action が使える

2026-07-11 時点:

- action 本体は `src/10_master_gas_api_v1.js` に実装済み
- `doPost()` 冒頭ルーティングも実装済み
- main webapp の `updateBundle` GET は撤去済み
- main webapp の旧管理 POST から `createDistributionTemplateNoUi` / `refreshTemplateMaster` / `refreshShellConfigCache` は撤去済み
- main webapp の旧管理 POST から `tenantSetup` も撤去済み。自己更新時の tenant 設定再反映は内部関数 `reapplyCurrentTenantDeploymentConfig_()` に置き換えた
- `src/07_portable_rpc.js` は `PORTABLE_ACTION_HANDLERS_` ベースへ寄せ始め、portable `runtime-shim` は `action: "<method>"` の直接送信へ切り替え開始
- ただし `doGet()` は互換のため `teacher` / `student` HTML をまだ持つ

### Phase E Cloudflare 側移行

目的:

- 業務判断を Cloudflare 側へ移す

実施内容:

- UI 取得を `GET_RECORDS / GET_CONFIG / GET_MASTER` ベースへ寄せる
- 最新判定を Cloudflare 側へ移す
- `clientSubmitId` 重複除去を Cloudflare 側へ移す
- 表示整形を Cloudflare 側へ移す
- 集計を Cloudflare 側へ移す
- GAS 直結の画面処理を順次外す

完了条件:

- GAS が「保存と取得の土管」として機能し始める

### Phase F 並走運用と回帰確認

目的:

- 新旧経路を併走させつつ、実データで破綻しないことを確認する

実施内容:

- 旧経路と新 API 経路をしばらく並走
- 児童送信の回帰確認
- 先生閲覧の回帰確認
- 集計の回帰確認
- 名簿、設定、ログの回帰確認
- append-only 運用で現場上問題ないか確認

完了条件:

- 旧経路なしでも移れる見通しが立つ

### Phase G 旧系縮退

目的:

- 旧構造を本線から外す

実施内容:

- 旧 GAS UI を止める
- `onOpen` 依存を止める
- Sidebar / Dialog を止める
- `rpc` を止める
- 任意の旧業務シート更新を止める
- 機能別 GAS を整理して Master GAS API へ集約する

完了条件:

- GAS 本体が共通 API と最小運用処理だけになる

## 6. 現実的な実行順

最優先は次の 3 段とする。

1. `SPEC / AUDIT / MIGRATION_PLAN` の 3 本を固定する
2. Master GAS API v1.0 の最小実装を別系統で成立させる
3. Cloudflare 側から一部機能だけ先に新 API へ載せ替える

## 7. 段階移行の具体策

### 7.1 先に切り替える候補

- `PING`
- `GET_CONFIG`
- `GET_MASTER`
- 一部の append-only な送信保存

理由:

- UI 依存が比較的少ない
- `Records / Config / Master` の契約確認に向く

### 7.2 後ろに回す候補

- AI キュー
- 評定整形
- ポートフォリオ集計
- 配布テンプレ運用
- Spreadsheet UI 導線

理由:

- 業務意味が重い
- 旧 UI 依存が強い

### 7.3 最後に消すもの

- `onOpen()`
- `PORTABLE_RPC_ALLOWLIST_`
- `globalThis[method]`
- `copyChooser`
- 旧 `teacher` / `student` HTML 返却

補足:

- `teacherDiag` と `refreshTemplateMaster` は 2026-07-11 時点で GET から外した。
- `copyChooser` は 2026-07-11 時点で admin webapp 側へ移し、main webapp の GET から外した。
- `updateBundle` は 2026-07-11 時点で main webapp の GET から外し、admin webapp の `releaseManifest` が外部 bundle URL を返す形へ寄せた。
- `tenantSetup` は 2026-07-11 時点で main webapp の POST から外し、tenant 内部の自己更新処理でだけ再利用する形へ寄せた。
- ただし自己更新を本当に成立させるには、`latestTenantBundlePath` 先へ `update-bundle.json` を配信し続ける運用が別途必要である。

## 8. 新旧データの扱い

### 8.1 `Responses` から `Records` へ

- 旧 `Responses` は snapshot / upsert 型
- 新 `Records` は append-only 型

対処:

- 移行中は旧 read をラップして残す
- 新 write は可能なところから `Records` へ寄せる
- 最新採用は Cloudflare 側で行う

### 8.2 `設定` から `Config` へ

- 旧設定群は key 単位へ整理する
- 一括上書き前提の箇所は細粒度化する

### 8.3 `Students / Lessons / 単元一覧` から `Master` へ

- `masterType` を導入して意味を分離する
- 旧表現の読み方は移行期だけアダプタで吸収する

### 8.4 `AuditLog / AiEventLog` から `Logs` へ

- `level`
- `eventType`
- `message`

この 3 つを標準面として寄せる

## 9. 回帰確認観点

### 9.1 API 基本

- `PING` が POST で通る
- `INVALID_JSON` が返る
- `UNSUPPORTED_ACTION` が返る
- `LOCK_TIMEOUT` が返る

### 9.2 記録系

- `APPEND_RECORD` が追記だけ行う
- `deleted = true` を保持できる
- 同一 `clientSubmitId` でも保存自体は止めない

### 9.3 設定系

- `UPSERT_CONFIG / GET_CONFIG` が key 単位で整合する

### 9.4 マスタ系

- `UPSERT_MASTER / GET_MASTER` が type 単位で整合する

### 9.5 並走互換

- 現行 Pages / GAS 画面が即死しない
- 旧シートを残したまま新 4 シートを併設できる

## 10. リスクと抑え方

### 10.1 データモデル差分

- 旧は snapshot
- 新は append-only

抑え方:

- Cloudflare 側に最新判定を先に持たせる

### 10.2 現場の接続先混在

- 先生ごとに別 deployment を見ている可能性がある

抑え方:

- 切替対象 URL と `appId` を明示する

### 10.3 シート肥大

- `Records` に集約すると件数が増える

抑え方:

- `GET_RECORDS` の絞り込み必須
- `limit` 上限固定
- 全件取得禁止

## 11. 直近の次アクション

この計画に基づく直近の作業順は次とする。

1. 3 文書を正として固定し、以後の実装判断の基準にする
2. `doGet()` を接続確認専用へ寄せるため、旧 HTML / 診断 / copyChooser の退避先を決める
3. Cloudflare 側で先行移行する機能を 1 つ選ぶ
4. その機能だけ `GET_*` / `APPEND_*` ベースへ差し替える
5. 並走確認後、旧 `rpc` の該当面を縮める

## 12. 2026-07-11 時点の判断

フェーズ進捗は次の通り。

- Phase A: 文書固定まで到達
- Phase B: 主要論点の監査まで到達
- Phase C: 移行順序の固定まで到達
- Phase D: 最小実装は着手済み、`doGet()` 縮退が残り
- Phase E-G: これから

したがって、次の実作業は「新機能を増やす」より、

- v1 本線の入口整理
- Cloudflare 側の先行 1 機能移行

を優先するのが妥当である。
