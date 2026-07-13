# 各々アップデート案

## 目標

- 各先生が **自分の先生アプリ** から `更新` を押す
- その先生のアプリだけが最新版へ更新される
- 管理者が毎回 `deploy:tenant` を叩かなくてもよい
- 既存データと URL は極力そのまま維持する

## 先に結論

- 体験としては `先生アプリ内の更新ボタン` にできる
- ただし中身は単純な UI ボタンではなく、**その先生の Apps Script を本人権限で更新する更新処理** が必要
- いちばん理想に近い構成は:
  - 先生アプリで `更新`
  - 中央の最新版 manifest を取得
  - 自分の script project を上書き
  - 新 version 作成
  - 既存 deploymentId を再デプロイ
  - tenant 設定を内部関数で再反映

## 実装の本命構成

### 1. 中央に「最新版 manifest」を持つ

- 導入管理または本体 master から、最新版のメタ情報を返す
- 返すもの:
  - `build`
  - `versionLabel`
  - `sourceBundleUrl` または `sourceSnapshot`
  - `minimumUpdaterVersion`
  - `releasedAt`

### 2. 各 tenant に updater 関数を持つ

- 各先生アプリの GAS に専用関数を入れる
  - `getSelfUpdateInfo()`
  - `runSelfUpdate()`
- これは **teacher UI から呼ばれる**

### 3. `runSelfUpdate()` がやること

1. 中央 manifest を取得
2. 今の `APP_BUILD` と比較
3. 新しければ最新版 source を取得
4. Apps Script API で **自分自身のプロジェクト内容** を更新
5. Apps Script API で version 作成
6. 既存 `DEPLOYMENT_ID` をその version に差し替え
7. tenant 内部の設定再反映関数を再実行
8. `lastSelfUpdatedAt` と `lastSelfUpdatedBuild` を保存

## 重要な前提

### 前提1: 更新は「本人権限」で走る

- その先生が owner/editor の script である必要がある
- 他人の script は更新できない
- ここは「各々アップデート」の思想と一致する

### 前提2: 初回認可が必要

- Apps Script API を叩くなら追加 scope が要る
- 初回だけ認可ダイアログが出る可能性が高い
- ここは避けにくい

### 前提3: updater 自体は古すぎると自己更新不能

- かなり昔の tenant には updater 関数が入っていない可能性がある
- その場合は一度だけ従来手段で底上げが必要

## 画面の見え方

### 先生アプリ側

- `更新を確認`
- `更新する`
- 表示:
  - `このアプリ: build ...`
  - `最新版: build ...`
  - `更新中`
  - `更新完了`
  - `このページを再読み込みしてください`

### 更新中の挙動

- すぐには同じリクエスト内で新コードへ切り替わらない
- 更新後は
  - 「更新が終わりました。30秒後に再読み込みしてください」
  - または `location.reload()` の案内
  が必要

## 技術的な本丸

### A. source をどう配るか

候補は2つ。

#### 案A-1: 中央 script の content を API で取得

- 1つの master script を正本とする
- tenant updater が Apps Script API で master の content を読む
- そのまま自分へ `updateContent`

利点:
- source の正本が1つ
- 今の開発フローに近い

弱点:
- 読み取り権限の扱いを整理する必要がある

#### 案A-2: JSON bundle を Web 配信

- デプロイ時に `files[]` の snapshot JSON を生成
- 中央 URL から tenant が取得
- その bundle を自分へ適用

利点:
- API 読み取り権限が軽い
- 配布物が固定される

弱点:
- bundle 生成工程が1つ増える

## おすすめ

- 最初は **JSON bundle 配信** が安定
- 理由:
  - 「最新版のファイル一式」が固定される
  - 取得元が単純
  - 差分ではなく全量更新で済む

## B. 自分自身の再デプロイ

- `DEPLOYMENT_ID` はすでに script properties にある
- なので updater は
  - 現 deploymentId
  - 新 version number
  を使って差し替えればよい
- URL を変えずに更新できる

## 既存構成との相性

- 良い点:
  - tenant ごとの URL を維持できる
  - 既存の spreadsheet / data をそのまま使える
  - 共通アプリ化しなくてよい

- 注意点:
  - `build-teacher-legacy.js` 相当を tenant 側でも再現できる状態にする必要がある
  - つまり tenant に渡す source は **すでに完成済みの deploy 用 source** でなければいけない

## いまの repo で必要な追加

### 1. deploy 時に source bundle を出力

- `src` の deploy 用完成形を JSON 化
- `teacher_script_*_legacy.html` まで含めた最終形を bundle にする

### 2. updater 用 server 関数を追加

- `getSelfUpdateInfo`
- `runSelfUpdate`
- `getSelfUpdateProgress`

### 3. Apps Script API 呼び出しラッパ

- content 更新
- version 作成
- deployment 更新

### 4. 状態保存

- ScriptProperties:
  - `LAST_SELF_UPDATE_BUILD`
  - `LAST_SELF_UPDATE_AT`
  - `SELF_UPDATE_STATUS`
  - `SELF_UPDATE_ERROR`

## 最初の現実ライン

### Phase 1

- `更新確認` だけ本物にする
- 中央 manifest と現在 build を比較

### Phase 2

- `更新する` で source bundle を適用
- ただし最初は version 作成まで

### Phase 3

- deployment 差し替えまで実装
- 更新完了 UI を出す

## 一番大きいリスク

- Apps Script API で **自分自身を書き換えて、そのまま再デプロイする** ところ
- ここは理屈上はいけるが、失敗時の戻しを考える必要がある

## 失敗時の保険

- 更新前に現 content snapshot を取る
- 更新失敗なら rollback 用 snapshot を保持
- 少なくとも
  - 旧 version は残る
  - 旧 deploymentId も残る
  ので、最悪は手動復旧可能にする

## 現実的な提案

- 理想に一番近いのはこの `self update` 構成
- ただし最初の一歩は大きい
- だから順番はこうする:

1. bundle 配信を作る
2. tenant で build 比較を実装
3. tenant の self update 実行を作る
4. 最後に deployment 差し替えをつなぐ

この順なら、途中で止めても壊れにくい。
