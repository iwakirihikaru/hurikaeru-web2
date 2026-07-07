# Onboarding Portal Skeleton

このフォルダは、先生向け導入導線のたたき台です。

狙い:

- `QR -> 登録ページ -> テンプレートシートコピー -> 初期設定`
- 先生に `spreadsheetId` や `scriptId` を手入力させない
- 先生の Drive に先生自身のシートを置く
- 管理側は登録台帳を見て `deploy:tenant` へつなぐ

## ファイル

- `admin-app.js`
  - 管理用 GAS Web アプリのサーバー側
- `admin-register.html`
  - QR の飛び先となる登録フォーム
- `admin-guide.html`
  - 登録後に開ける先生向け説明書
- `template-setup.js`
  - 先生がコピーしたテンプレートシート側の初期設定コード
- `TEACHER_SETUP.md`
  - 先生向けの配布用手順書

## 最小構成

### 管理用スプレッドシート

シート名:

- `Registrations`

1行目のヘッダー:

```text
registrationId,createdAt,updatedAt,status,teacherName,teacherEmail,schoolName,grade,className,tenantId,spreadsheetId,spreadsheetUrl,scriptId,scriptUrl,deploymentId,notes,errorMessage
```

### 管理用 GAS Web アプリ

1. 新しい Apps Script プロジェクトを作る
2. `admin-app.js` と `admin-register.html` を入れる
   - 説明書も使うなら `admin-guide.html` も入れる
3. `CONFIG` の各値を埋める
4. `デプロイ -> ウェブアプリ`
5. その URL を QR コード化する

### テンプレートシート

1. 先生にコピーしてもらう元の Spreadsheet を1つ用意する
2. その Apps Script に `template-setup.js` を入れる
3. `ADMIN_WEBAPP_URL` を管理用 Web アプリ URL に置き換える
4. 先生は `コピーを作成` 後に `初期設定 -> 登録を完了する`

## 今後つなぐ先

登録が `sheet_connected` になったら、次を人または補助スクリプトで実行します。

1. `tenantId` を決める
2. `tenants.json` に登録する
3. `npm run deploy:tenant -- -TenantId <tenantId>`

次の自動化候補:

- `Registrations` から `tenants.json` を作る補助 CLI
- `deploymentId` を反映後に管理台帳へ戻す補助 CLI

## ローカル CLI との接続

`sheet_connected` になった登録情報を JSON に落とせれば、ローカル側でそのまま tenant 登録できます。

サンプル:

- `registration-sample.json`

コマンド:

```powershell
npm run register:connected -- `
  -RegistrationFile .\onboarding\registration-sample.json `
  -TenantId t_sato `
  -Group 2026
```

このコマンドは内部で `bootstrap-tenant.ps1` を呼びます。

## 管理 Web アプリとの往復

登録台帳から 1 件を JSON に落とす:

```powershell
npm run fetch:registration -- `
  -AdminWebAppUrl "https://script.google.com/macros/s/XXX/exec" `
  -RegistrationId "REGISTRATION_ID"
```

配布完了を管理台帳へ戻す:

```powershell
npm run mark:deployed -- `
  -AdminWebAppUrl "https://script.google.com/macros/s/XXX/exec" `
  -RegistrationId "REGISTRATION_ID" `
  -TenantId "t_sato" `
  -DeploymentId "AKfycb..."
```
