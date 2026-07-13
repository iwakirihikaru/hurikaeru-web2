# Master GAS API v1.0 仕様書

## 0. この文書の位置づけ

- この文書は `Master GAS API v1.0` の正仕様とする。
- 対象は `src/10_master_gas_api_v1.js` で実装する固定 action API である。
- 現行 repo では `src/01_webapp.js` の `doGet()` / `doPost()` に旧 UI や `rpc` が同居しているが、それらは互換維持中の旧系であり、本仕様の本体責務には含めない。

## 1. 目的

`Master GAS API v1.0` は、先生ごとのスプレッドシートにデータを残しつつ、複数アプリから共通利用できる最小 API とする。

- 主用途
  - 記録の追記
  - 設定の保存と取得
  - 基礎マスタの保存と取得
  - 操作ログの追記
- 対象アプリ例
  - ふりかえり
  - Circle 系の他 Web アプリ
- 役割外
  - UI 返却
  - 集計
  - 最新判定
  - 重複除去の最終判断
  - 表示用整形
  - AI キュー
  - 授業進行や画面状態管理

本 API は「GAS は土管、業務判断は Cloudflare」の境界を固定するためのものとする。

## 2. 設計原則

- API の本線は `doPost(e)` のみとする。
- すべての action は `POST + application/json` で受ける。
- 外部入力で任意のシート名、セル範囲、列名を指定させない。
- 固定 4 シートのみを使用する。
- `Records` は append-only を原則とし、既存行の物理更新や削除をしない。
- `Config` と `Master` は key 単位 upsert を許可する。
- `deleted` は物理削除ではなく論理削除フラグとする。
- `clientSubmitId` の重複排除は保存時に GAS が確定しない。最終判断は Cloudflare 側で行う。
- ロック取得は短時間で失敗させ、長待機しない。

## 3. HTTP エントリポイント

### 3.1 `doPost(e)`

- Content-Type
  - `application/json`
- Body
  - JSON object
- 用途
  - `PING`
  - `APPEND_RECORD`
  - `GET_RECORDS`
  - `UPSERT_CONFIG`
  - `GET_CONFIG`
  - `UPSERT_MASTER`
  - `GET_MASTER`
  - `APPEND_LOG`

### 3.2 `doGet(e)`

- 用途
  - 接続確認テキストのみ
- 返却文言
  - `Circle Master GAS API v1.0 is running. Use POST request.`
- 禁止
  - 一覧取得
  - 詳細取得
  - 設定取得
  - UI HTML 返却
  - 診断 JSON 返却

補足:

- 現行 `src/01_webapp.js` は互換維持のため `teacher` / `student` と一部管理導線をまだ返す。
- それらは v1 完了状態では別系統へ退避する前提とする。
- `teacherDiag` は 2026-07-11 時点で GET から外し、必要時は POST action で扱う。
- `refreshTemplateMaster` は 2026-07-11 時点で GET から外し、main webapp の POST 公開面からも外した。必要時は直接関数実行または別管理系で扱う。
- `copyChooser` は 2026-07-11 時点で admin webapp 側へ移し、main webapp の GET から外した。
- `updateBundle` は 2026-07-11 時点で main webapp の GET から外し、管理 webapp の manifest が `latestTenantBundlePath` ベースの外部 bundle URL を返す形へ切り替えた。
- `createDistributionTemplateNoUi` と `refreshShellConfigCache` も 2026-07-11 時点で main webapp の POST 公開面から外した。
- `tenantSetup` も 2026-07-11 時点で main webapp の POST 公開面から外し、自己更新時の tenant 設定再反映は内部関数 `reapplyCurrentTenantDeploymentConfig_()` で扱う。
- 自己更新 bundle の公開自体は管理系の配信物更新が前提であり、配信先へ `update-bundle.json` を載せる運用は別途必要。

## 4. 使用シート

外部指定は禁止し、次の固定 4 シートのみを使用する。

1. `Records`
2. `Config`
3. `Master`
4. `Logs`

### 4.1 `Records`

用途:

- 児童提出
- 教師記録
- AI 結果イベント
- 手動返却イベント
- 論理削除イベント

列定義:

1. `recordId`
2. `recordType`
3. `classId`
4. `lessonId`
5. `studentId`
6. `studentNo`
7. `clientSubmitId`
8. `payloadJson`
9. `createdAt`
10. `updatedAt`
11. `source`
12. `appId`
13. `deleted`

運用規則:

- 1 action で 1 行追記する。
- `payloadJson` は JSON 文字列のまま保存する。
- `createdAt` と `updatedAt` は保存時刻を同値で入れる。
- 既存行更新はしない。
- `deleted = true` は「この record が論理削除イベントである」ことを表す。

### 4.2 `Config`

用途:

- アプリ設定
- クラス設定
- 接続設定
- 全体設定

列定義:

1. `configKey`
2. `classId`
3. `configValueJson`
4. `updatedAt`
5. `updatedBy`
6. `appId`

運用規則:

- 主キー相当は `configKey + classId + appId` とする。
- 一致行があれば上書き更新、一致しなければ追加する。
- `classId` は空欄可。

### 4.3 `Master`

用途:

- 名簿
- クラス定義
- 単元
- 項目プリセット
- その他の基礎情報

列定義:

1. `masterType`
2. `masterId`
3. `classId`
4. `payloadJson`
5. `updatedAt`
6. `updatedBy`
7. `appId`
8. `deleted`

運用規則:

- 主キー相当は `masterType + masterId + classId + appId` とする。
- `deleted` は論理削除フラグとする。

### 4.4 `Logs`

用途:

- エラー記録
- 操作ログ
- システムイベント

列定義:

1. `logId`
2. `level`
3. `eventType`
4. `message`
5. `payloadJson`
6. `createdAt`
7. `appId`
8. `source`

## 5. 共通リクエスト形式

```json
{
  "action": "APPEND_RECORD",
  "appId": "hurikaeru",
  "apiVersion": "1.0",
  "requestId": "req_20260711_001",
  "clientTime": "2026-07-11T09:00:00+09:00",
  "payload": {}
}
```

### 5.1 必須項目

- `action`
- `appId`
- `apiVersion`
- `requestId`
- `payload`

### 5.2 任意項目

- `clientTime`

### 5.3 共通ルール

- `apiVersion` は文字列 `"1.0"` 固定。
- `payload` は object 必須。配列や文字列は不可。
- `requestId` はクライアント側で一意生成する。
- `clientTime` は監査補助用であり、保存判定の正本時刻には使わない。
- GAS は `payloadJson` / `configValueJson` の業務意味を解釈しない。

## 6. 共通レスポンス形式

正常:

```json
{
  "ok": true,
  "action": "APPEND_RECORD",
  "apiVersion": "1.0",
  "serverTime": "2026-07-11T00:00:00.000Z",
  "data": {},
  "error": null
}
```

異常:

```json
{
  "ok": false,
  "action": "APPEND_RECORD",
  "apiVersion": "1.0",
  "serverTime": "2026-07-11T00:00:00.000Z",
  "data": null,
  "error": {
    "code": "LOCK_TIMEOUT",
    "message": "Could not acquire lock."
  }
}
```

## 7. エラーコード

固定エラーコードは次を正とする。

- `INVALID_JSON`
  - JSON parse 失敗
- `INVALID_REQUEST`
  - envelope 不備
- `UNSUPPORTED_ACTION`
  - 未対応 action
- `VALIDATION_ERROR`
  - payload 検証エラー
- `LOCK_TIMEOUT`
  - ロック取得失敗
- `INTERNAL_ERROR`
  - 想定外エラー

補足:

- 文言は将来微修正可だが、`code` は固定する。
- Cloudflare 側は文言でなく `code` を見る。

## 8. Action 仕様

### 8.1 `PING`

用途:

- 疎通確認

request payload:

```json
{}
```

response data:

```json
{
  "message": "pong",
  "requestId": "req_20260711_001",
  "appId": "hurikaeru"
}
```

### 8.2 `APPEND_RECORD`

用途:

- append-only の記録追記

request payload:

```json
{
  "recordId": "rec_001",
  "recordType": "student_review",
  "classId": "class_a",
  "lessonId": "lesson_001",
  "studentId": "student_001",
  "studentNo": "12",
  "clientSubmitId": "submit_001",
  "payload": {
    "comment": "たしざんをがんばった"
  },
  "source": "pages_student",
  "deleted": false
}
```

ルール:

- `recordType` は必須。
- `recordId` 未指定時は GAS が採番してよい。
- `payload` は `payloadJson` に JSON 文字列で保存する。
- `deleted = true` を許可する。
- 同一 `clientSubmitId` の重複保存を GAS は拒否しない。
- 最終的な最新採用、重複除去、整形は Cloudflare 側で行う。

response data:

```json
{
  "recordId": "rec_001",
  "rowNumber": 2
}
```

### 8.3 `GET_RECORDS`

用途:

- `Records` の条件取得

request payload:

```json
{
  "recordType": "student_review",
  "classId": "class_a",
  "lessonId": "lesson_001",
  "studentId": "student_001",
  "studentNo": "12",
  "since": "2026-07-01T00:00:00+09:00",
  "limit": 100,
  "includeDeleted": false
}
```

ルール:

- `appId` に加え、次のいずれか 1 つ以上を必須とする。
  - `recordType`
  - `classId`
  - `lessonId`
  - `studentId`
  - `studentNo`
  - `since`
- `limit` 未指定時は `100`。
- `limit` 最大は `500`。
- `limit <= 0` または不正値は `100` 扱い。
- `includeDeleted = false` なら `deleted = true` を除外する。
- `since` は ISO 8601 文字列比較で扱う。

response data:

```json
{
  "items": [],
  "count": 0,
  "limit": 100
}
```

### 8.4 `UPSERT_CONFIG`

用途:

- 設定の保存

request payload:

```json
{
  "configKey": "active_class",
  "classId": "class_a",
  "configValue": {
    "value": "3-1"
  },
  "updatedBy": "teacher_001"
}
```

ルール:

- `configKey` は必須。
- キーは `configKey + classId + appId`。
- `configValue` は `configValueJson` に JSON 文字列で保存する。

### 8.5 `GET_CONFIG`

用途:

- 設定の条件取得

request payload:

```json
{
  "configKey": "active_class",
  "classId": "class_a"
}
```

ルール:

- `configKey` または `classId` のどちらかを必須とする。
- 将来 paging を入れる余地はあるが、v1.0 では `limit` 未導入とする。

### 8.6 `UPSERT_MASTER`

用途:

- 基礎マスタの保存

request payload:

```json
{
  "masterType": "roster",
  "masterId": "student_001",
  "classId": "class_a",
  "payload": {
    "studentNo": "12",
    "name": "山田"
  },
  "updatedBy": "teacher_001",
  "deleted": false
}
```

ルール:

- `masterType` と `masterId` は必須。
- キーは `masterType + masterId + classId + appId`。
- `deleted = true` を許可する。

### 8.7 `GET_MASTER`

用途:

- 基礎マスタの条件取得

request payload:

```json
{
  "masterType": "roster",
  "classId": "class_a",
  "limit": 100,
  "includeDeleted": false
}
```

ルール:

- `masterType` / `classId` / `masterId` のいずれか 1 つ以上を必須とする。
- `limit` 未指定時は `100`。
- `limit` 最大は `500`。

### 8.8 `APPEND_LOG`

用途:

- ログ追記

request payload:

```json
{
  "logId": "log_001",
  "level": "error",
  "eventType": "api_failure",
  "message": "submit failed",
  "payload": {
    "reason": "timeout"
  },
  "source": "pages_teacher"
}
```

ルール:

- `level` と `eventType` は必須。
- `logId` 未指定時は GAS が採番してよい。
- `payload` は `payloadJson` に JSON 文字列保存する。

## 9. ロック方針

- `APPEND_RECORD`
- `UPSERT_CONFIG`
- `UPSERT_MASTER`
- `APPEND_LOG`

上記の書き込み系は DocumentLock を使う。

要件:

- `tryLock(...)` を使う。
- 長待機しない。
- 取得失敗時は `LOCK_TIMEOUT` を返す。
- `waitLock(10000)` のような長待機は v1 方針外とする。

## 10. Cloudflare 側の責務

Cloudflare Pages 側で担う責務を固定する。

- `clientSubmitId` の重複排除
- append-only 記録からの最新採用
- `deleted` を踏まえた有効レコード判定
- 画面表示用の集計
- 表示順やページング
- 業務ルール判定
- AI 実行制御

## 11. 現実装との対応

2026-07-11 時点で `src/10_master_gas_api_v1.js` に次が実装済み。

- `PING`
- `APPEND_RECORD`
- `GET_RECORDS`
- `UPSERT_CONFIG`
- `GET_CONFIG`
- `UPSERT_MASTER`
- `GET_MASTER`
- `APPEND_LOG`

未完了扱い:

- `doGet()` の完全縮退
- 旧 `rpc` の停止
- Cloudflare 側の本格切替

## 12. v1.0 の完了条件

- 固定 8 action が安定稼働する。
- `doGet()` は接続確認テキスト専用に縮退する。
- Cloudflare 側が UI / 集計 / 最新判定を持つ。
- 旧 `rpc` と画面依存処理を本線から外せる。
