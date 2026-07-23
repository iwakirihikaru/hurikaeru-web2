# AGENTS

## 作業方針
- GitHub App が使える作業では GitHub を優先し、PR / branch / diff を根拠に判断する。
- 見えていない GAS / API / Spreadsheet 状態は断定しない。
- 最小差分で進め、無関係なリファクタと無関係なコード整形はしない。
- 必要な確認だけ行い、未確認事項は報告する。
- レビューは P1 / P2 のみ確認し、P3 は追わない。
- 重点確認は今回の変更に直接関係する範囲だけで行う。
  データ安全性、権限、個人情報、tenant 境界、GAS、Spreadsheet、teacher 画面、aggregate、portfolio、runtime-shim、iPad / Safari、性能。

## 初期読み込み
- 作業開始時に原則として読むのは `AGENTS.md`、今回のユーザー指示、`git status --short`、今回の対象 diff または対象ファイルだけ。
- 次は必要な場合だけ読む。
  `HANDOFF.md`: 継続作業、前回状態の確認。
  `FILEMAP.md`: 対象ファイルが分からないとき。
  `package.json` の関連 scripts: 本番公開時。
  失敗した該当 script: デプロイ失敗時。
  直接関係するコード: 権限 / tenant / 個人情報変更時。

## 禁止事項
- 毎回のリポジトリ全体読込、全ファイル一覧取得、全デプロイスクリプト再読込をしない。
- 完了済み履歴の大量読込、同じファイルの繰り返し読込、念のためだけの全体レビューをしない。
- P3 を探さない。

## 指示の解釈
- `修正して`: 修正と必要確認まで。コミット、push、本番反映はしない。
- `コミットして`: 修正、必要確認、コミットまで。本番反映はしない。
- `pushして`: 指定または適切な branch への push まで。本番反映とは扱わない。
- `本番反映して` / `公開して` / `本番に出して` / `本番へ出して` / `リリースして` / `デプロイして` / `反映して` / `公開まで` / `本番まで` / `利用者が使える状態にして`: 文脈上、実利用環境へ変更を出す意図が明確なら本番公開指示として扱う。
- 明示的な停止条件を優先する。
  `本番反映はしないで`、`公開せず確認だけ`、`コミットまで`、`pushまで`。
- ユーザーが最初から本番公開を指示している場合、修正とコミット後に本番反映確認で止めない。

## 本番反映先の判定
- GAS サーバー側のみの変更: `npm run deploy:script` を使う。Pages、`pages-release`、Cloudflare は更新しない。
- Pages 配信側のみの変更: `npm run publish:portable-publish` を使う。GAS production version は更新しない。
- GAS と Pages の両方に影響する変更: `npm run deploy:full` を使う。
- `pages-release` が GitHub Pages の本番成果物 branch。
- 次だけでは Pages 本番反映完了と扱わない。
  `main` への push のみ、`codex/main-publish` への push のみ、portable build のみ、GAS deployment のみ。
- `codex/main-publish` は作業または公開準備用であり、Pages 本番の最終反映先ではない。

## 本番前に停止してよい条件
- 無関係な差分を安全に分離できない。
- 必要なテスト、構文確認、build、生成処理が失敗する。
- 権限不足。
- deployment 先を一意に特定できない。
- 本番が別の新しい commit へ進んでいて上書きの危険がある。
- データ破損、権限漏れ、個人情報漏えいにつながる P1 / P2 懸念がある。
- 強制 push、履歴改変、データ削除などの不可逆操作が必要。
- 正式な deploy script が失敗する。
- 単に本番操作であることだけを理由に停止しない。

## Git / source commit / deploy
- `source commit` は今回の変更を含む新規 commit のみを指す。作業開始時点の commit や、今回の変更を含まない commit を `source commit` として報告しない。
- 調査のみで commit を作っていない場合は、`新規 source commit なし` と明記する。
- 修正時は今回対象の差分だけを stage する。無関係な差分を含めて commit しない。
- 無関係な差分は混ぜない。破棄もしない。必要なら分離方法を検討し、分離できない場合は停止条件を優先する。
- 修正内容を commit する前に `git show --stat --name-only HEAD` または今回作成した commit に対する `git show` で変更ファイルを確認する。
- 修正を伴う作業で commit / push / deploy が許可されている場合は、`test` → `commit` → `push` → `deploy` の順を守る。
- 個別指示で `commit` や `deploy` が禁止されている場合は、その個別指示を優先する。
- push 前の commit や未 push の HEAD を `source commit` として完了報告しない。`source commit` は push 済み commit のみとする。
- deploy を行う場合は、deploy description と push 済み HEAD が同じ commit を指すことを照合してから完了報告する。
- 未commit 差分が残った状態で、修正済み・反映済みとして完了報告しない。

## 完了報告
- `修正元 commit` と書いている箇所は、今回の変更を含む push 済み新規 `source commit` を指す。作業開始 commit を使わない。
- GAS のみ: 修正元 commit、push 先 branch、GAS production version、GAS deployment description、Pages 未更新の理由、未確認事項。
- Pages のみ: 修正元 commit、push 先 branch、Pages workflow ID、Pages workflow 結果、`pages-release` commit、Cloudflare Production source commit、GAS 未更新の理由、未確認事項。
- 両方: 修正元 commit、push 先 branch、GAS production version、GAS deployment description、Pages workflow ID、Pages workflow 結果、`pages-release` commit、Cloudflare Production source commit、各反映先が修正元 commit 由来であること、未確認事項。
