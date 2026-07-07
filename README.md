# Portable GAS UI

現行の GAS 版 UI をそのまま静的公開用に切り出したディレクトリです。

## Files

- `index.html`
  - 入口ページ
- `setup.html`
  - GAS URL の保存と接続確認
- `student.html`
  - 児童画面
- `teacher.html`
  - 先生画面
- `runtime-shim.js`
  - `google.script.run` 互換の HTTP ラッパー
- `_headers`
  - no-store 設定

## Build

```powershell
npm run build:portable
```

## Local Serve

```powershell
npm run portable:serve
```

open:

- `http://localhost:4173/`

## Cloudflare Pages

Deploy `portable/` as a static site.

- Build command:
  - none
- Build output directory:
  - `portable`
- Entry:
  - `/`
- Pages の pretty URL をそのまま使う:
  - `/setup`
  - `/student`
  - `/teacher`

Recommended first open:

- `/setup?api=https://script.google.com/macros/s/AKfycbwN4jX_joOcvKQV2Brps5AL3ibLWebem0qd3A0uzRDP8JIyohGhFE3410LLE0eTlEfb/exec`
