# Portable Tenant GAS

現行の `src/` を、別スプレッドシートにぶら下がった Apps Script へそのまま載せるための束です。

## 用途

- 現行 GAS 版の見た目と挙動を維持したまま、別スプレッドシートで動かす
- `portable/teacher.html` / `portable/student.html` から HTTP RPC で呼ぶ
- 本体運用中の GAS とは切り離して検証する

## 対象スクリプト

- スプレッドシート付属 Apps Script
- scriptId: `1i0fDWhwn6-Wizv9n8t8VYWCDb-6FSlENkuNHnrFgEgaNZLdNtXQ5fZyD`

## 構成

- `src/`
  - 現行 `src/` の複製
- `appsscript.json`
  - Apps Script manifest
- `.clasp.json`
  - 上記 scriptId 向け設定

## 反映

```powershell
Set-Location -LiteralPath 'D:\Iwaki\Documents\ふりかえり\portable-tenant'
clasp push --force
```

その後、Apps Script 側で新しい Web アプリ deployment を作成し、その URL を `GAS_API_URL` に使います。
