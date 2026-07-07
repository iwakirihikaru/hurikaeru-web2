# ふりかえりアプリ HANDOFF

## 最初に読む範囲

- 新スレでは `FILEMAP.md` とこの `HANDOFF.md` だけ読む。
- 基本運用は `編集 -> 確認 -> ビルド/デプロイ`。
- この環境では相対パスや `workdir` が不安定なことがあるので、読込・検索は絶対パス優先。

## いまの主系

- 主配布導線は Web 版。
  - 児童:
    `https://hurikaeru-web2.pages.dev/student`
  - 初回接続:
    `https://hurikaeru-web2.pages.dev/setup`
  - 先生:
    `https://hurikaeru-web2.pages.dev/teacher`
- GAS は廃止ではなく、保存本体・API・導入管理の母体として残している。
- `src/index.html` / `src/teacher.html` は現場の主入口というより、
  - GAS互換UI
  - portable 生成元
  - 開発時の基準UI
  の位置づけ。

## 現在の正

- 本体 Webアプリ URL
  `https://script.google.com/macros/s/AKfycbxNEShjIPMsE8s7xXTMYByNI-DGxgQJyMH-Tp1FvKw2/exec`
- 本体 deploymentId
  `AKfycbxNEShjIPMsE8s7xXTMYByNI-DGxgQJyMH-Tp1FvKw2`
- 個人検証用 deploymentId
  `AKfycbyEzVppHpjODvOPi7Ko3FfZwVxMI1LKdO3UInQz8Gyy0tbBJZFP--5x_QBw5KV1fRytIQ`
- 導入管理 URL
  `https://script.google.com/macros/s/AKfycbyIxBewjHHF2JLlGbI6yuDfdMM7l_AkvY1QRlclIM0uR_nOGa_NXNcAZXY9Jl_g973G/exec`
- provision URL
  `https://script.google.com/macros/s/AKfycbxCO7At4So96DUASA3kQGpGZwBHSJyaU00ET4C56tgdpOyfbT7rfhAIAI9QhSGpRlWtag/exec`
- 配布用テンプレート URL
  `https://docs.google.com/spreadsheets/d/1rW5FPPwmlfXbfAIxmVBzMRd8oB0_R4Hb5LOfCF8Jgzk/edit`
- 配布用マスター名
  `ふりかえりアプリ_配布用マスター_20260708`

## 現在の最新版

- 2026-07-08 時点
  - 本体 version `311`
  - 配布テンプレート version `41`
  - 導入管理 version `135`
  - provision version `71`
  - shell build `shell-config-phase2-2026-07-05-1730`

## Web 配布の現在地

- 静的配布版は `portable/` を正とし、公開反映用のコピーを `portable-publish/` に置いている。
- 個人配布向け GAS API の作業元は `portable-tenant/`。
- 静的版の接続先は `setup` で `localStorage.GAS_API_URL` に保存する。
- 使い方タブの案内は Web 版前提へ変更済み。
  - `WEB児童ページ`
  - `WEB接続ページ`
- 児童番号タップは、授業中なら `bootstrapStudentOptions.classSnapshot` で即表示し、その後に正本同期する。

## Web 配布の運用ルール

- `portable/teacher.html` や `portable/student.html` を直接いじると、`npm run build:portable` で上書きされる。
- 画面ロジックの修正は、原則 `src/teacher_script_*_legacy.html` / `src/index.html` 側へ戻す。
- Web配布の反映手順は
  `src を修正 -> npm run build:portable -> portable-publish へコピー`
- `portable-publish/` は公開前の最終確認先として扱う。
- Cloudflare Pages 側の自動公開設定は、この repo からは見えない。
  - 少なくともローカル情報だけでは `GitHub に push したら自動更新` は保証できない
  - 運用上は `portable-publish/` を公開元に固定するのが分かりやすい
  - ただし repo 側は、Cloudflare Pages の Linux build でそのまま動くように `npm run build:portable` を Node 化済み
  - Pages で自動化するなら
    - Build command: `npm run build:portable`
    - Build output directory: `portable`

## 直近の重要修正

- 使い方タブの `児童ページ` / `登録ページ` を Web 版導線へ変更した。
  - `studentUrl` は `pages.dev/student.html?api=...`
  - `registrationUrl` は `pages.dev/setup.html?api=...`
- `portable/setup.html` を初回接続用の日本語UIへ作り直した。
- 児童ページは、同一児童の local cache 先出しに加えて、
  - 授業中クラスの snapshot を bootstrap に先読み
  - 番号タップ時は通信なし即描画
  - その後に `studentLoadState()` / `getTimeline()` で同期
  する形にした。
- 返却済みコメントが児童画面に出ない不具合を修正した。
- 設定タブの項目順が児童画面で先頭固定される不具合を修正した。
- 単元一覧の表示件数は全並び順でページ送り化し、1ページ 10 件にした。
- 更新タブは版情報中心へ簡略化した。

## 今の優先順位

- 1位:
  Web版の体感速度と安定性
- 2位:
  先生画面の授業中導線、ポートフォリオ、単元一覧
- 3位:
  Cloudflare Pages 側の公開手順整理
- 4位:
  旧 GAS UI の整理

## デプロイ

- 本体反映
  `C:\Program Files\nodejs\npm.cmd run deploy:webapp`
- これで本体、配布テンプレート、導入管理、provision までまとめて更新する。
- `deploy:webapp` の中で
  - teacher legacy 再生成
  - update bundle 再生成
  - version 作成
  - admin / template / provision 更新
  まで流れる。
- まれに `src/99_update_bundle.js` の書き込みで一時失敗することがある。
  - その場合は再実行で通ることがある。

## 主要ファイル

- GAS本体
  `src/00_bootstrap.js` から `src/07_portable_rpc.js`
- 児童画面の主な修正点
  `src/index.html`, `src/04_student.js`, `src/03_domain.js`
- 教師画面の主な修正点
  `src/06_teacher.js`, `src/teacher_section_*.html`, `src/teacher_script_*.html`
- Web配布
  `portable/`, `portable-publish/`, `scripts/build-static-port.ps1`
- 導入管理の元
  `onboarding/admin-app.js`, `onboarding/admin-register.html`, `onboarding/admin-guide.html`
  - `admin-src` は生成物なので直接編集しない

## 重要仕様

- 保存本線は `Responses`。旧 `授業_x_y` は互換レベル。
- 提出保存と AI 処理は分離済み。提出時はまず保存、AI はキュー処理。
- 単元設定を後から変えても、その時間の授業は `Lessons.fieldsJson` により当時の項目を保持する。
- 教師画面の `この時間だけ項目を編集` は、その授業だけ上書きする。
- 教師AI未設定でも、手入力下書き保存・返却・手動メダルは使える。
- AI未設定時は AI生成系ボタンだけ無効化する方針。
- メダルは自動確定ではなく、教師操作時に反映する。

## 今の注意点

- 教師画面修正後は、`teacher_script_*_legacy.html` を手で触らず、デプロイ時の自動生成に任せる。
- `portable/` は生成物。直接編集しない。
- `portable-publish/` は公開用コピー。公開前に差分確認する。
- 互換性不具合を疑うときは、まず `teacher_preflight.html` の表示を見る。
- 長いログ全文は会話に貼らず、代表行だけ貼る。
- deploymentId、URL、version は会話に繰り返さず、このファイルを見る前提で進める。

## 今の未整理ポイント

- `hurikaeru-web2.pages.dev` の自動公開経路は未整理。
- `portable/` と `portable-publish/` のどちらを Pages の正式公開元にするか、まだ運用を一本化していない。
- ポートフォリオや授業状況にも snapshot 発想を広げる余地がある。
- 旧 `webapp/` 試作群は現行主線ではない。必要になるまで前面には出さない。

## スレ切り替えの目安

- 基本は同じ開発スレを続ける。
- ただし、次のどれかが増えてきたら新スレ推奨。
  - 長いログ貼り付けが続く
  - 同じ不具合経緯の説明を何度も参照する
  - URL、deploymentId、version の再確認が増える
  - 反応が鈍くなり、過去文脈の整理コストが高くなる
- 切り替えるときは `FILEMAP.md` とこの `HANDOFF.md` だけ渡せばよい。

## 次スレで十分な依頼文

`FILEMAP.md と HANDOFF.md を見て続けて。`
`対象:`
`現象:`
`期待動作:`
`触らない範囲:`
