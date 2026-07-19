# HANDOFF

## 現在状態
- 作業 branch: `codex/main-publish`
- 最新の関連 commit: `e73adf64`
- 今回の運用ファイル整理では本番反映を行わない。

## 未反映変更
- 既存の作業差分が多数ある。
  `src/`、`portable/`、`portable-src/`、`scripts/` 配下の変更。
  `.clasp.json`、`deploy.config.json`、`admin.config.json` などの未追跡設定。
  `node_modules/`、`test-results/`、`tmp_*`、`.codex-*` などの未追跡生成物。
- 上記は今回の運用ファイル整理とは分離して扱う。

## 現在残っている問題
- 作業ツリーが大きく汚れているため、本番反映前は対象差分の切り分け確認が必要。
- Cloudflare / Pages / GAS の実運用状態は、このファイルだけでは保証しない。

## 次に行う作業
- 次回の依頼で対象 diff を確認し、今回の運用ルールに沿って必要最小限のファイルだけ読む。
- 本番反映が必要になったら、変更内容に応じて `deploy:script` / `publish:portable-publish` / `deploy:full` のどれを使うか判定する。

## 未確認事項
- 現在の Cloudflare Production source commit。
- 現在の Pages workflow 実行結果。
- 現在の GAS production version と deployment description。
