# Codex作業ルール

## 基本方針
- 日本語で回答する。
- 既存の仕様・デザイン・命名規則を優先する。
- 大きく作り直さず、必要最小限の差分で修正する。
- 実装前に関連ファイルを確認する。
- 変更後は、変更内容・確認方法・次の課題を簡潔にまとめる。

## プロジェクト構成
- GAS / Googleスプレッドシート / HTML / CSS / JavaScript を使用。
- 小学校教師が授業終盤に使う、児童ふりかえり支援Webアプリ。
- 児童は出席番号で入力する。
- 教師は授業状況、ふりかえり、AIコメント生成などを扱う。
- Web 配布では `portable/` と `portable-publish/` を使う。

## 作業時に必ず見るもの
- `memory.md`
- `FILEMAP.md`
- `HANDOFF.md`

## 禁止
- 不要な全面リファクタ
- 仕様確認なしの大幅UI変更
- 既存データ構造の破壊
- APIキーや個人情報の直書き

## このリポジトリ固有の注意
- `portable/` は生成物なので直接編集しない。
- Web 配布の画面修正は、原則 `src/` 側を直してからビルドで反映する。
- `teacher_script_*_legacy.html` は手編集せず、生成フローに従う。

## 会話運用ルール
- 同じ不具合や同じ改修筋をそのまま続ける間は、原則として同一スレを継続する。
- 変更テーマが切り替わるときは、新スレを推奨してよい。
- 長いログ、経緯、URL、version の再参照が増えたときは、新スレを推奨してよい。
- 探索範囲が広がり、過去文脈を毎回圧縮し直している感触が出たときは、新スレを推奨してよい。
- HANDOFF.md を更新して区切りが良いときは、新スレを推奨してよい。
- キリの良いところで作業を終えるときは、継続推奨なら次スレ開始用の文言は書かない。
- キリの良いところで作業を終えるときは、新スレ推奨の場合だけ最後に次スレ開始用の文言を1本書く。
- HANDOFF.md を更新したときも、次スレ用の短い依頼文は新スレ推奨の場合だけ添える。
- 普段は現在のモデルで進める前提とし、不要に上位モデルを前提化しない。
- ただし、次の条件では「上位モデルを使うとよい」と簡潔に提案してよい。
  - 複数ファイルをまたぐ大規模変更
  - 設計見直しや移行方針の再整理
  - 難しい不具合調査や原因切り分け
  - 長文仕様の整理や比較検討
- モデル提案は必要なときだけ行い、毎回は言わない。

## Windows Codex 実行環境・権限・シェル運用

このリポジトリでは、Codex の作業範囲を現在の Git リポジトリ内に限定する。

対象リポジトリの想定パス:

- `C:\Users\Iwaki\codex-workspaces\hurikaeru-web2`

Windows版Codexの通常サンドボックスで、次のようなエラーが出る場合がある。

- `windows sandbox: helper_unknown_error: apply deny-read ACLs`

この場合、通常サンドボックスで原因追跡を繰り返さない。まず `workspace-write` + `on-request` + `network_access = true` のカスタム設定を使う。それでもACLエラーが出る場合だけ、ユーザー確認のうえ `danger-full-access` + `on-request` を検討する。

フルアクセス環境またはカスタム権限環境でも、作業対象は現在の Git リポジトリ内に限定すること。

禁止事項:

- リポジトリ外のファイル読み取り
- リポジトリ外への書き込み
- 秘密情報、APIキー、認証トークン、SSHキー、`.env` の表示
- `takeown`
- `icacls`
- 広範囲の `Remove-Item`
- `rm -rf`
- 無断の `git reset --hard`
- 無断の `git clean`
- 権限変更
- OS設定変更

上記が必要に見える場合は、実行前に停止し、理由・対象パス・実行予定コマンドをユーザーに確認すること。

## 日本語Markdownとシェルの扱い

統合ターミナルが Git Bash の場合、日本語Markdownは原則として `cat` で確認する。

- `cat AGENTS.md`
- `cat memory.md`
- `cat FILEMAP.md`
- `cat HANDOFF.md`

PowerShellで日本語Markdownを読む場合は、必ず UTF-8 を明示すること。

- `Get-Content .\AGENTS.md -Encoding UTF8`
- `Get-Content .\memory.md -Encoding UTF8`
- `Get-Content .\FILEMAP.md -Encoding UTF8`
- `Get-Content .\HANDOFF.md -Encoding UTF8`

`type` や `Get-Content` の既定動作で日本語が文字化けした場合、それをACLエラー、ファイル破損、読み取り失敗と判断しないこと。

Markdown本文をPowerShellの文字列として直接編集しないこと。Markdownのバッククォート `` ` `` はPowerShellのエスケープ文字と衝突しやすいため、追記・置換・整形は原則として `python` または `node` で行うこと。

PowerShellは、`.ps1` スクリプトの実行やWindows固有の確認に限定する。PowerShellスクリプトを実行する必要がある場合は、Git Bash上から `powershell.exe` を明示して呼び出す。

例:

- `powershell.exe -ExecutionPolicy Bypass -File scripts/deploy-webapp.ps1`

読み込みや編集に失敗した場合は、絶対パスでの再試行、別コマンドの連発、権限昇格、`takeown`、`icacls /reset /T` を繰り返さず、次だけを表示して停止すること。

- 実行したコマンド
- 対象ファイルのパス
- エラー全文
- `pwd` または `Get-Location` の結果

## deploy 時のルール

`deploy:webapp` は、ユーザーが明示的に「deploy」「本番反映」「公開」まで求めた場合だけ実行すること。

deploy 前に確認すること。

- `git status --short`
- 構文チェックまたは既定の確認コマンドの結果
- 実行予定コマンド
- deploy先が本番かどうか

未コミット差分があることだけを理由に deploy を停止しないこと。

次の差分は、通常は deploy 停止理由にしない。

- `AGENTS.md`
- `HANDOFF.md`
- `.codex/`
- `README.md`
- ドキュメント
- ローカル設定
- 生成済みの `portable/*`

deploy を停止するのは次の場合だけ。

- 構文チェックまたは既定の確認が失敗している
- 今回の依頼と無関係なコード変更が deploy対象に混ざっている
- deploy先が確認できない
- 秘密情報を表示する必要がある
- ユーザーが deploy しないよう明示している

deployで使うコマンドは原則として次に限定する。

- `npm run deploy:webapp`
- `powershell.exe -ExecutionPolicy Bypass -File scripts/deploy-webapp.ps1`

deploy後は、成否、反映先、実行した確認、残る課題を簡潔に報告すること。
