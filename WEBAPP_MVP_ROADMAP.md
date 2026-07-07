# ふりかえり配布版 Web/PWA ロードマップ

## 位置づけ

- `GAS版`
  - 岩切先生の現場運用版
  - 仕様検証・授業実験・新機能試作の母体
- `Web/PWA版`
  - 他の先生へ配布して広げる本命版
  - URL配布、認証、更新、学校端末対応を優先

この2つは同じアプリではなく、役割を分けて進める。

## 判断

- ふりかえり機能そのものは、すでに `MVPとして通用`
- 詰まっている本丸は `配布 / 認証 / 更新 / デプロイ`
- この領域は GAS より Web/PWA の方が相性がよい

結論:

- GAS版は捨てない
- 配布版だけ別基盤で作る
- 移植対象は `コード` より `業務フローと画面構成`

## 配布版MVPの目的

最初の配布版で解決する課題は絞る。

- 他の先生が URL だけで始められる
- 児童が迷わず入力できる
- 教師が授業開始から返却まで回せる
- 配布後の更新が GAS より軽い

最初のMVPでは、教育OS構想の全部は追わない。

## MVPで残す機能

### 児童

- 出席番号選択
- その時間の入力
- 提出
- 自分の過去記録の簡易表示
- 返却コメントの表示

### 教師

- ログイン
- クラス作成
- 名簿管理
- 単元作成
- 授業開始 / 授業終了
- 児童提出一覧の確認
- 個別返却
- この時間の簡易レポート

### AI

- 返却コメント下書き
- 単元レポート下書き

## 最初のMVPでは削るもの

- GAS配布テンプレート連動
- 自己更新 / 版戻し
- Apps Script API ベースの更新機能
- 教科デフォルトの細かい運用UI
- 仮評定の高度機能
- 保守ログの詳細画面
- AIキュー可視化

## 技術スタック案

第一候補:

- `Next.js`
- `Supabase`
- `Vercel`
- `PWA`

理由:

- URL配布しやすい
- ログインとDBが素直
- iPad / Chromebook で扱いやすい
- 将来 `宿題AI` `教材共有` `動画` へ広げやすい

## 画面一覧

### 先生側

1. ログイン
2. 初回セットアップ
3. ホーム
4. 授業スタート
5. 授業中モニタ
6. 単元設定
7. 名簿
8. 記録一覧
9. 児童別ポートフォリオ
10. 返却 / 所見
11. 設定

### 児童側

1. 出席番号選択
2. 時間選択
3. 入力
4. 提出完了 / 返却確認
5. これまでの記録

## DB最小設計

### organizations

- id
- name
- owner_user_id
- created_at

### classes

- id
- organization_id
- school_year
- grade
- class_name
- teacher_name
- created_at

### students

- id
- class_id
- attendance_number
- display_name
- active

### units

- id
- class_id
- subject
- name
- periods_count
- fields_json
- archived

### lessons

- id
- class_id
- unit_id
- period_number
- status
- started_at
- ended_at
- fields_json

### responses

- id
- lesson_id
- student_id
- draft_json
- submitted_json
- submitted_at
- feedback_text
- feedback_handwriting_url
- feedback_returned_at
- ai_comment
- ai_status

### response_history

- id
- response_id
- snapshot_json
- event_type
- created_at

### memberships

- id
- organization_id
- user_id
- role

## GAS版からの移植順

### Phase 0

- 仕様の固定
- GAS版の画面と運用ルールの棚卸し

### Phase 1

- 先生ログイン
- クラス / 名簿
- 単元作成

### Phase 2

- 児童の出席番号選択
- 児童入力
- 提出保存

### Phase 3

- 授業開始 / 終了
- 教師の一覧確認
- 個別返却

### Phase 4

- 過去記録
- 単元別レポート
- AI下書き

### Phase 5

- 端末検証
- PWA調整
- 配布導線の整備

## まず作るべき縦切り

最初の「通る一本」はこれ。

1. 先生がログイン
2. クラスを作る
3. 名簿を入れる
4. 単元を作る
5. 授業開始
6. 児童が番号を選んで入力
7. 先生が提出一覧を見て返却

この一本が通れば、配布版MVPとして成立する。

## UI方針

- GAS版の操作感はできるだけ残す
- GAS都合の複雑さは持ち込まない
- 児童画面は大きいボタンと少ない選択肢
- 教師画面は `授業開始` を最優先導線にする

詳細は `WEBAPP_SCREEN_MAP.md` を参照。

## 直近タスク

1. Web版MVPの画面一覧を確定
2. DBテーブル名と責務を確定
3. Next.js のひな形を切る
4. `先生ログイン -> 授業開始 -> 児童提出 -> 返却` まで先に通す

## やらないこと

- GAS版の完全互換を最初から目指さない
- 更新システムを最初から凝らない
- 配布テンプレート文化をそのまま移さない
- いきなり教材マーケットまで広げない

## 成功条件

- 他の先生が URL を開いて始められる
- GASの配布 / 認可 / 更新地獄を回避できる
- 岩切先生の授業で通った動線が壊れない
