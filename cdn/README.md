# CDN Shell Config

このフォルダは `ShellConfig` の静的配信用です。

## いちばん簡単なやり方

### 1. JSONを書き出す

```powershell
npm run sync:admin-shell
npm run export:admin-shell-static
```

生成物:

- `cdn/shell-config.json`
- `cdn/maintenance-status.json`
- `cdn/index.html`
- `cdn/.nojekyll`

### 2. GitHub Pages に置く

新しい公開リポジトリを作り、この `cdn` フォルダの中身だけを置く。

### 3. 公開URLを admin.config.json に反映する

GitHub Pages のURLが

`https://YOURNAME.github.io/jibun-matome-shell-config/`

なら、次を実行する。

```powershell
npm run set:admin-primary-shell -- https://YOURNAME.github.io/jibun-matome-shell-config/
```

### 4. admin と tenant を再反映する

```powershell
npm run deploy:admin
npm run deploy:tenant -- iwakiri-hikaru
```

## 想定URL例

- `https://YOURNAME.github.io/jibun-matome-shell-config/shell-config.json`
- `https://YOURNAME.github.io/jibun-matome-shell-config/maintenance-status.json`

## 成功確認

先生画面で次が出ればOK:

- `config元 cdn_primary`
- `保守元 cdn_primary`
