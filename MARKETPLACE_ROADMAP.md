# ふりかえりアプリ Marketplace ロードマップ

## 目的

- 既存利用者と既存データを守りながら、Google Workspace Marketplace 公開に耐える構成へ寄せる。
- 「現行安定版」と「Marketplace 準備版」を混ぜない。

## 大前提

- 既存の先生URL、児童URL、既存シート、既存データは壊さない。
- Marketplace 向け変更は、まず新規導入向け導線に限定する。
- 旧方式はしばらく残し、既存利用者には必須化しない。

## Phase 1 安定化

### 目的

- 配布済み環境を壊さない。
- 回帰チェックを毎回同じ粒度で回す。

### 完了条件

- `REGRESSION_CHECKLIST.md` で最低限の回帰確認が回る
- 本番 / 開発 / 配布用マスターの役割が固定されている
- 既存データ形式を読める状態を維持している

### 主対象

- `src/03_domain.js`
- `src/04_student.js`
- `src/06_teacher.js`
- `src/teacher_script_core.html`
- `src/teacher_script_units.html`

## Phase 2 導入改善

### 目的

- 先生の導入負荷を減らす。
- Apps Script やブラウザ依存の詰まりを減らす。

### 改善対象

- 登録ページ
- 配布ガイド
- 初期設定の見せ方
- 開けないときの対処案内

### 完了条件

- 新規導入フローが短くなる
- 「Chrome でだめ / Edge で通る」などの詰まりに対して標準対処がある
- 既存利用者は旧方式でも使い続けられる

### 主対象

- `onboarding/admin-app.js`
- `onboarding/admin-register.html`
- `onboarding/admin-guide.html`
- `src/02_setup.js`
- `src/01_webapp.js`

## Phase 3 Marketplace 対応

### 目的

- Google Workspace Marketplace 審査を通せる要件を満たす。

### 必須項目

- アプリ名、説明、ロゴ、スクリーンショット整備
- サポートページ整備
- プライバシーポリシー整備
- OAuth 同意画面整備
- スコープ最小化
- リンク切れゼロ
- テスト中の挙動や未完成導線を排除

### 完了条件

- 一般公開に必要な掲載素材がそろう
- OAuth / 認可フローが説明可能
- 1回認証前提に近い UX へ寄っている

### 主対象

- `onboarding/*`
- `src/appsscript.json`
- `admin-src/appsscript.json`
- サポート / ポリシー用の外部ページ

## Marketplace 用に分離して進めるもの

- 導入導線の短縮
- 説明文・スクショ・ロゴ
- サポートページ
- プライバシーポリシー
- OAuth 同意画面
- 先生向けセットアップ改善

## 現行安定版で最優先するもの

- 授業開始
- 単元表示
- 保存
- 既存記録の読込
- AI未設定時の手動運用
- 配布済み先生URLの継続利用

## やってはいけない変更

- 既存列の意味変更
- 既存キー削除
- 既存URL生成の全面置換
- 旧フローを即廃止する変更
- 配布済みテナントへ未確認のまま強制反映

## 毎回の判断

- 今の作業が「安定化」か「導入改善」か「Marketplace 対応」かを先に決める
- 安定化以外の変更は、既存利用者に必須化しない
- 本番反映前は `REGRESSION_CHECKLIST.md` を通す

## 次にやる候補

1. 登録ページ / ガイドの標準対処文言を整理する
2. Marketplace 掲載に必要な素材一覧を作る
3. OAuth と公開範囲の現状を棚卸しする
4. 先生に `deploy` させる前提を減らす案を設計する

## 参照ファイル

- 標準対処文言
  `ONBOARDING_STANDARD_COPY.md`
- Marketplace 素材一覧
  `MARKETPLACE_ASSETS.md`
