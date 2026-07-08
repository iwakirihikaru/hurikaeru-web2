# Portable GAS UI

現行の GAS 版 UI をそのまま静的公開用に切り出したディレクトリです。

## Files

- `index.html`
  - 入口ページ
- `setup.html`
  - 配布ページへの入口と接続補助
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
  - `npm run build:portable`
- Build output directory:
  - `portable`
- Entry:
  - `/`
- Pages の pretty URL をそのまま使う:
  - `/setup`
  - `/student`
  - `/teacher`
