# 管理用GASを clasp 管理に載せる手順

この手順をやると、今後は管理用登録ページもローカルから更新できます。

## 1. まず 1 回だけ用意するもの

- 管理用GASの `scriptId`
- 管理用GASの `deploymentId`
- テンプレートシートURL

## 2. `admin.config.json` を作る

`admin.config.json.example` をコピーして `admin.config.json` を作ります。

中身の例:

```json
{
  "scriptId": "ここに管理用GASのscriptId",
  "deploymentId": "ここに管理用WebアプリのdeploymentId",
  "rootDir": "admin-src",
  "templateCopyUrlBase": "https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXX/edit",
  "guideModePath": "?mode=guide",
  "templateScriptId": "ここに配布テンプレート側scriptId",
  "templateDeploymentId": "ここに配布テンプレート側deploymentId",
  "templateRootDir": "src"
}
```

## 3. scriptId の取り方

管理用GASをブラウザで開いたときの URL から取れます。

例:

```text
https://script.google.com/home/projects/1ABCDEFxxxx/edit
```

この `1ABCDEFxxxx` が `scriptId` です。

## 4. deploymentId の取り方

Apps Script で:

1. `デプロイ`
2. `デプロイを管理`
3. 対象の Web アプリを開く

ここに出る `AKfycb...` が `deploymentId` です。

## 5. 反映コマンド

ソース同期:

```powershell
npm run sync:admin
```

デプロイ:

```powershell
npm run deploy:admin
```

配布ページまで含めてまとめて更新:

```powershell
npm run deploy:distribution
```

管理用GASをブラウザで開く:

```powershell
npm run open:admin
```

## 6. 何が起きるか

- `onboarding/admin-app.js`
- `onboarding/admin-register.html`
- `onboarding/admin-guide.html`

を元にして、`admin-src/` に push 用ファイルを作ります。

そのあと `deploy:admin` が:

1. `admin-src` を push
2. 新しい version を作成
3. 既存 deploymentId に再デプロイ

までやります。

## 7. これで楽になること

- 管理用GASを Apps Script 画面で毎回手貼りしなくてよくなる
- 登録ページの文言変更や導線修正をローカル管理できる
- 本体アプリと同じノリでデプロイできる
- 配布ページと配布テンプレート元をまとめて更新できる
