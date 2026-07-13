# ふりかえりアプリ HANDOFF

## 最初に読む範囲

- 新スレでは `FILEMAP.md` とこの `HANDOFF.md` だけ読む。
- 作業ルールは `AGENTS.md`、長期前提は `memory.md`、作業モード別の手順は `skills/` を見る。
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
- `src/index.html` / `src/teacher.html` は
  - GAS互換UI
  - portable 生成元
  - 開発時の基準UI
  の位置づけ。

## 現在の正

- 本番 Webアプリ URL
  `https://script.google.com/macros/s/AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q/exec`
- 本番 deploymentId
  `AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q`
- 本番 scriptId
  `1mo4HVj9GHW9YDBJ76IfJepk6SpIiJcNs-xdRIyGqCUgEy3bg6WWlkVqM`
- デバッグ昇格版 deploymentId
  `AKfycbwaLBC6GW0y6NwKM04tFop7vddDX1uMfz3x4KJ4juT4Sn07dBDIvMnARCm8wBI-DAxA`
- 導入管理 URL
  `https://script.google.com/macros/s/AKfycbyIxBewjHHF2JLlGbI6yuDfdMM7l_AkvY1QRlclIM0uR_nOGa_NXNcAZXY9Jl_g973G/exec`
- provision URL
  `https://script.google.com/macros/s/AKfycbxCO7At4So96DUASA3kQGpGZwBHSJyaU00ET4C56tgdpOyfbT7rfhAIAI9QhSGpRlWtag/exec`
- 配布用テンプレート URL
  `https://docs.google.com/spreadsheets/d/1rW5FPPwmlfXbfAIxmVBzMRd8oB0_R4Hb5LOfCF8Jgzk/edit`
- 配布用マスター名
  `ふりかえりアプリ_配布用マスター_20260708`

## 現在の最新版

- 2026-07-14 時点
  - 本番 version `361`
  - repo管理 debug deployment version `354`
  - デバッグ昇格版 version `10`
  - 配布テンプレート version `64`
  - 導入管理 version `173`
  - provision version `104`
  - shell build `shell-config-phase2-2026-07-05-1730`
  - Pages production latest commit
    `c5f3a0a8 Update portable web app flow and student bootstrap`

## Web 配布の現在地

- 静的配布版の本線は `portable/`。長期運用では `main` へ取り込み、`main` から本番公開する。
- `portable-publish/` は互換運用のため残している公開反映用コピー。長期本線にはしない。
- 静的版の接続先は `setup` で `localStorage.GAS_API_URL` に保存する。
- 新規端末の既定接続先は空。
- 先生ごとに `?api=...` 付きURLまたは setup で保存先を入れる運用を正とする。
- `portable/teacher.html` や `portable/student.html` を直接編集しない。
- `main` へ merge/push すると GitHub Actions が `node ./scripts/build-static-port.mjs` で `portable/` を再生成し、GitHub Pages へ自動公開する想定。
- PR では同ビルドを実行し、`portable/` を artifact として確認できる想定。
- `portable-publish/` は互換確認や一時運用だけに使い、最終的な本番反映は `main` へ取り込んで行う。

## 現場運用メモ

- 現場確認で反映が見えないときは、まず `pages.dev/teacher` の `localStorage.GAS_API_URL` を確認する。
- その GAS deployment がこの repo の scriptId 配下かも確認する。
- 本番 `api` を使うシートは、本番コード更新に自動追随する。
- `AKfycbwa...` は補助確認用で、常用前提ではない。

## 重要仕様

- 保存本線は `Responses`。旧 `授業_x_y` は互換レベル。
- 提出保存と AI 処理は分離済み。提出時はまず保存し、AI はキュー処理。
- 単元設定を後から変えても、その時間の授業は `Lessons.fieldsJson` により当時の項目を保持する。
- 教師画面の `この時間だけ項目を編集` は、その授業だけ上書きする。
- 教師AI未設定でも、手入力下書き保存・返却・手動メダルは使える。
- AI未設定時は AI生成系ボタンだけ無効化する。
- メダルは自動確定ではなく、教師操作時に反映する。

## フェーズ状況

- Phase D
  - 実質完了。
  - `doGet()` は接続確認寄りへ整理済み。
  - teacher / student の主導線は portable relay 前提。
- Phase E
  - 実質完了。
  - 旧 route helper、旧 redirect gate、未使用 helper、`legacy_*` 文言の大半を整理済み。
  - 生成フロー名として残る `legacy` と、現役 fallback / 互換資産は別テーマに切り出した。
- Phase F
  - 進行中。
  - `legacy` を一括削除候補にせず、次の3分類で扱う。
    - `legacy` 命名
    - 現役 fallback
    - 互換資産
  - 現時点の切り分け
    - `scripts/build-teacher-legacy.js` / `src/teacher_script_*_legacy.html`
      - 旧 fallback ではなく、生成フロー名として現役。
    - `src/07_portable_rpc.js` の `action: "rpc"` + `payload.method`
      - 現役 fallback。
    - `scripts/build-static-port.ps1`
      - Node 版と並存する互換資産。
  - 2026-07-12 追加前進
    - `scripts/build-static-port.mjs`
      - `portable/setup.html` の接続確認を `postAction('rpc', { method: 'teacherInit' })` から `postAction('teacherInit', {})` へ変更。
      - `node scripts/build-static-port.mjs` を実行し、`portable/setup.html` へ反映済み。
    - `src/02_setup.js`
      - `legacy_writeGlobalConfig` / `legacy_writeGlobalConfigBatch` 由来の audit source 名を
        `config_writeGlobalConfig` / `config_writeGlobalConfigBatch` へ変更。
  - 2026-07-13 追加前進
    - 授業スタートタブ初回表示の体感速度対策。
    - `src/06_teacher.js`
      - `teacherInit()` / `teacherStatusInit()` から `getTeacherVersionControlInfo_()` の同期実行を外した。
      - 初期表示では Apps Script API の deployment / versions 取得を行わず、単元・現在授業・授業状況を優先して返す。
      - 版詳細・ロールバック情報は `teacherHelpInit()` など更新系画面で従来どおり取得する。
    - `src/07_portable_rpc.js`
      - 既存クライアント分岐で使う `teacherStatusSnapshot` を portable allowlist に追加。
    - 確認済み:
      - `node --check src/06_teacher.js`
      - `node --check src/07_portable_rpc.js`
      - `npm run build:portable`
    - deploy:
      - 2026-07-13 に本番 Webアプリへ deploy 済み。
      - 本番 deployment `AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q` を version `359` へ更新。
      - `admin.config.json` がない環境だったため、配布テンプレート・導入管理・provision 更新は deploy script 上でスキップ。
    - 補足:
      - `portable/` は `build:portable` 実行後に modified 表示になる場合があるが、今回確認時点では内容差分は出ていない。
      - `AGENTS.md` と `.codex/` は作業開始時点から存在する未関与差分。
  - 2026-07-13 追加前進 2
    - 児童ページの出席番号表示・番号押下後ロードを体感優先へ変更。
    - `src/index.html`
      - 出席番号は名簿取得済みまたは直近キャッシュがある場合だけ実在番号を表示。
      - 名簿未取得の初回は `名簿を確認中…` を表示し、名簿にない番号は表示しない。
      - GAS から名簿・授業状態が返ったら番号ボタンと resume 表示を更新し、名簿キャッシュも更新。
      - 番号押下時に選択中の色・`よみこみ中` 表示・スピナーを出し、手ごたえを追加。
      - 番号押下後の初期ロードで、現在の授業内容・自分の記録・前時ふりかえり・前時の「次のめあて」を取得。
      - 前時の「次のめあて」は、該当項目の設定と入力値がある場合だけ表示。
      - 提出済み時の過去記録一覧は、初期表示を妨げないよう idle / 遅延で自分の記録だけバックグラウンド取得。
      - 履歴タブを開いた時点で未取得なら、その場で履歴を取得。
    - `src/03_domain.js` / `src/04_student.js`
      - 前時のふりかえりと、前時項目内の「次のめあて」をまとめて返す初期ロード用コンテキストを追加。
      - 通常の「めあて」項目は表示対象にせず、「次/つぎ」+「めあて/目標/ゴール」系の項目だけを対象にする。
    - `src/07_portable_rpc.js`
      - portable RPC の児童系メソッドで、`studentInit` / `studentLoadState` / `getStudentPreviousReview` / `getStudentPastRecords` などの引数を正しく渡すよう修正。
    - `scripts/build-static-port.mjs`
      - portable 児童画面で bootstrap 完了を待たず `startStudentApp_()` を即実行し、完了後に `applyStudentBootstrapData_()` で反映するよう変更。
    - `npm run build:portable` 実行済み。
    - 確認済み:
      - `node --check src/03_domain.js`
      - `node --check src/04_student.js`
      - `node --check src/07_portable_rpc.js`
      - `node --check scripts/build-static-port.mjs`
      - `src/index.html` の script 構文確認
      - `portable/student.html` の script 構文確認
    - deploy:
      - 2026-07-14 に本番 Webアプリへ deploy 済み。
      - 本番 deployment `AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q` を version `360` へ更新。
      - `admin.config.json` がない環境だったため、配布テンプレート・導入管理・provision 更新は deploy script 上でスキップ。
  - 2026-07-14 追加前進
    - 教師画面の名簿・単元名・記録取得の体感速度対策。
    - `src/06_teacher.js`
      - `teacherInit()` から全 Responses を読む単元進捗の同期生成を外し、キャッシュ済み進捗だけ返すよう変更。
      - 単元進捗は `teacherUnitProgressRefresh()` で後追い更新する前提に整理。
      - `getAggregateData()` は単元 / 教科指定がある場合、全 Responses ではなく対象 lesson の Responses だけ読むよう変更。
    - `src/teacher_script_core.html`
      - `teacherInit()` 後に必要な場合だけ単元進捗を idle 後に更新。
      - 初期プリロードは名簿を先に走らせ、エディタ・プロンプト・ヘルプ・全記録プリロードは少し遅らせる。
      - `ensureRosterPreload()` に更新後コールバックを追加し、名簿単体取得の結果をキャッシュと画面状態へ反映。
    - `src/teacher_script_admin.html`
      - 名簿タブはキャッシュがあれば即表示し、その裏で名簿単体 API を更新取得。
      - キャッシュがない場合も、全授業記録取得を待たず名簿単体 API だけを呼ぶ。
    - `src/teacher_script_reports.html`
      - 記録系は選択中の単元 / 教科スコープを優先取得し、全体記録は後からバックグラウンド取得。
    - `src/07_portable_rpc.js`
      - portable 経由で `teacherUnitProgressRefresh` を呼べるよう allowlist へ追加。
    - `node scripts/build-teacher-legacy.js` と `npm run build:portable` 実行済み。
    - 確認済み:
      - `node --check src/06_teacher.js`
      - `node --check src/07_portable_rpc.js`
      - `src/teacher.html` の script 構文確認
      - `portable/teacher.html` の script 構文確認
    - 2026-07-14 追加前進 2
      - 版情報タブの不要文言を整理。
      - `src/06_teacher.js`
        - 中央の `latestVersion` が現在の deployment version より古い場合は、この個体の deployment version を優先表示するよう変更。
      - `scripts/deploy-webapp.ps1`
        - deploy 時に `onboarding/admin-app.js` の `latestTenantAppVersion` に加えて、`cdn/shell-config.json` の `latestVersion` も同期するよう変更。
      - 確認済み:
        - `node --check src/06_teacher.js`
        - `node scripts/build-teacher-legacy.js`
        - `npm run build:portable`
      - deploy:
        - 2026-07-14 に本番 Webアプリへ deploy 済み。
        - 本番 deployment `AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q` を version `361` へ更新。
        - `admin.config.json` がない環境のため、導入管理 Webアプリ自体の再デプロイは引き続きスキップ。
  - まだ残る主な検討点
    - `src/07_portable_rpc.js` の `rpc` 互換受理をどこまで縮められるか。
    - `scripts/build-static-port.ps1` を残置するか、運用上 retire できるか。
    - `teacher_script_*_legacy.html` / `build-teacher-legacy.js` を改名テーマに切るか現状維持にするか。
    - 薄いGAS依存をどこまで固定API化で減らすか。
      - 方針は `1 + 2` を本命にする。
      - `1`: 薄いGASの公開APIを固定契約に寄せ、返り値の破壊的変更を避ける。
      - `2`: `portable` 側で古い返り値を正規化し、既定値補完で互換吸収する。
      - 主対象は `teacherInit` / `teacherStatusSnapshot` / `studentInit` / `studentLoadState` と `src/07_portable_rpc.js`。
      - ねらいは「新機能追加や初期ロード最適化のたびに薄いGASを更新しなくてよい状態」に近づけること。
      - デメリットとして、クライアント側の吸収ロジック増加、APIの肥大化、テスト観点増加は受け入れる前提。

## Master GAS API v1

- `src/10_master_gas_api_v1.js` を追加済み。
- 固定4シート:
  - `Records`
  - `Config`
  - `Master`
  - `Logs`
- 実装済み action:
  - `PING`
  - `APPEND_RECORD`
  - `GET_RECORDS`
  - `UPSERT_CONFIG`
  - `GET_CONFIG`
  - `UPSERT_MASTER`
  - `GET_MASTER`
  - `APPEND_LOG`
- response / aggregate / unit の主読取は master 側へ寄せ済み。
- 残しているのは主に互換書き込みと一部の互換受け口。

## 今の優先順位

- 1位: Web版の体感速度と安定性
- 2位: 先生画面の授業中導線、ポートフォリオ、単元一覧
- 3位: Cloudflare Pages 側の公開手順整理
- 4位: 旧 GAS UI の整理

## デプロイとビルド

- 基本運用:
  - 修正後の反映は、原則として毎回 deploy:webapp まで実施する。
- 例外:
  - ユーザーが明示的に「デプロイしない」「コード修正だけ」と指定した場合だけ止める。

- 基本は個別反映ではなく、`deploy:webapp` で本体・関連配布物まで一気に更新する。
- 本体反映
  `C:\Program Files\nodejs\npm.cmd run deploy:webapp`
- portable 再生成
  `npm run build:portable`
- PR build 確認
  `.github/workflows/portable-pr-check.yml`
- main merge 後の Pages 自動公開
  `.github/workflows/portable-pages-deploy.yml`
- portable 公開コピー同期
  `npm run sync:portable-publish`
- portable 再生成から公開コピー同期まで
  `npm run build:portable-publish`
- GitHub Pages / 本番公開の考え方は `portable/` 本線、`main` 公開、`portable-publish/` は互換残置。
- `deploy:webapp` では
  - teacher legacy 再生成
  - update bundle 再生成
  - version 作成
  - 本番 deployment 再デプロイ
  - admin / template / provision 更新
  まで流れる。
- まれに `src/99_update_bundle.js` の書き込みで一時失敗することがある。
  - その場合は再実行で通ることがある。

## 主要ファイル

- GAS本体
  `src/00_bootstrap.js` から `src/07_portable_rpc.js`
- Master API
  `src/10_master_gas_api_v1.js`
- 児童画面
  `src/index.html`, `src/04_student.js`, `src/03_domain.js`
- 教師画面
  `src/06_teacher.js`, `src/teacher_section_*.html`, `src/teacher_script_*.html`
- Web配布
  `portable/`, `portable-publish/`, `portable-src/runtime-shim.js`, `scripts/build-static-port.mjs`
- 導入管理の元
  `onboarding/admin-app.js`, `onboarding/admin-register.html`, `onboarding/admin-guide.html`
- `admin-src` は生成物なので直接編集しない。

## 今の注意点

- `teacher_script_*_legacy.html` は手編集せず、生成フローで再作成する。
- `portable/` は生成物。直接編集しない。
- `portable-publish/` は互換用コピー。使う場合だけ公開前に差分確認する。
- `portable-publish/` の中に `.git` がある場合、親 repo へ submodule として誤追加しない。
- 互換性不具合を疑うときは、まず `teacher_preflight.html` の表示を見る。
- deploymentId、URL、version はこのファイルを正とする。

## 今の未整理ポイント

- `portable-publish/` をどの互換用途まで残すかは未整理。
- Cloudflare Pages の production branch は `main` を正とし、preview branch 直pushを本番運用にしない。
- Phase F で残る fallback / 互換資産の扱いをどこまで狭めるか未決定。

## 次にやる候補

- `src/07_portable_rpc.js` の `rpc` 互換受理を、実参照を見ながらさらに縮める。
- `scripts/build-static-port.ps1` の retire 可否を運用面から判断する。
- `main` 一本化後に preview branch 運用をどこまで減らせるか確認する。
- 薄いGASの固定契約にする最小APIセットを整理する。
- `portable` 側で古い返り値を吸収する正規化層の候補を洗い出す。
- 実行テストは未実施なので、必要になった段階で別途行う。

## 次スレで十分な依頼文

`FILEMAP.md と HANDOFF.md を見て続けて。`
`対象:`
`現象:`
`期待動作:`
`触らない範囲:`



## ユーザーへ依頼するとき

- ユーザーに操作を頼むときは、短く済ませず、画面名・押す場所・確認する値を順に書く。
- 「何したら？」で返させないよう、1. 2. 3. の手順で書く。
- branch や URL を確認してもらうときは、返してほしい値をそのまま書く。
  - 例: `Production branch: main`
  - 例: `最新 Production commit: 11132e7`
