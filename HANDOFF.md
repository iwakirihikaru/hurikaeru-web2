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
  - 本番 version `375`
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
  - 2026-07-14 追加前進 3
    - 薄いGAS依存を減らす固定契約化の第一弾。
    - `src/07_portable_rpc.js`
      - portable 経由の `teacherInit` / `teacherStatusSnapshot` / `studentInit` / `studentLoadState` を固定契約 `portableContractVersion: 1` に寄せる正規化ラッパーを追加。
      - 配列、状態オブジェクト、AIフラグ、shell、errors、status.meta などを既定値補完し、内部関数の返り値差分が portable に漏れにくい形へ変更。
    - `portable-src/runtime-shim.js`
      - portable 側でも同じ4 APIの返り値を正規化。
      - direct action と旧 `action:"rpc"` / `payload.method` の両方で、画面へ渡す直前に古い返り値を吸収する。
    - `npm run build:portable` 実行済み。
    - 確認済み:
      - `node --check src/07_portable_rpc.js`
      - `node --check portable-src/runtime-shim.js`
      - `node --check portable/runtime-shim.js`
    - 未実施:
      - 本番 deploy は未実施。AGENTS.md の deploy ルールにより、ユーザーが明示的に求めた場合だけ実行する。
  - 2026-07-14 追加前進 4
    - 教師ページ初期ロードの記録プリロード順を調整。
    - `src/teacher_script_core.html`
      - `scheduleTeacherPreload()` で、補助プリロードより先に本時の記録スコープ取得を開始するよう変更。
    - `src/teacher_script_reports.html`
      - `scheduleTeacherCurrentLessonAggregatePreload()` を追加し、`activeUnitId` / `activePeriod` がある場合は `unitId` スコープの記録を先に取得してから `full` 背景取得へ進むようにした。
    - 目的:
      - `full` 記録取得とほぼ同時に走っていた初期取得を分け、本時の授業記録を優先する。
  - 2026-07-14 追加前進 5
    - 教師ページ初回ロードで「現在何の授業をしているか」を最優先化。
    - `src/teacher_script_core.html`
      - `loadInit()` を変更し、初回は `teacherStatusSnapshot()` を先に呼んで current lesson を先行取得してから `teacherInit()` を呼ぶようにした。
      - これで初期読み込み時に、授業中の単元・時間を先に確定しやすくした。
    - 反映:
      - `src/teacher_script_core_legacy.html` も再生成済み。
  - 2026-07-14 追加前進 6
    - 児童ページ初回ロードの優先順位を修正。
    - `src/03_domain.js`
      - `getStudentEntryOptions()` を軽量デフォルトにして、初回は在籍児童一覧を先に返し、`classSnapshot` は必要時だけ付けるように変更。
    - `src/index.html`
      - 初回未読込時は「名簿を確認中…」ではなく「読み込み中です…」を出すよう変更。
      - 初回の `applyStudentBootstrapData_()` では、名簿がまだ来ていない状態を loaded 扱いにしないよう修正。
    - `portable-src/runtime-shim.js`
      - `bootstrapStudentAsync()` も軽量取得に合わせた。
    - 目的:
      - 番号表示の前に記録取得が走りにくいようにし、初回の未登録誤表示を防ぐ。
  - 2026-07-14 追加前進 7
    - 教師フィードバック下書き削除、単元削除、ボタン操作感、名簿選択カスタム項目を修正。
    - `src/06_teacher.js`
      - 下書き `cleared` の場合、返却済みコメントを下書き欄へ再表示しないようにした。
    - `src/teacher_script_units.html`
      - 行ごとの下書き削除・返却・メダル保存に busy 表示を追加。
      - 単元削除後に単元一覧、進捗、記録キャッシュ、選択状態を即時無効化するよう変更。
    - `src/teacher_section_curriculum.html` / `src/index.html`
      - カスタム項目に `student_select` / `student_multi` を追加し、児童画面で名簿から 1人または複数人を選べるようにした。
    - `src/teacher_styles.html` / `src/teacher_script_core.html`
      - 教師ページ全体のボタン押下時の反応と disabled 表示を追加。
    - 反映:
      - `node scripts/build-teacher-legacy.js` と `npm run build:portable` 実行済み。
      - 2026-07-14 に本番 Webアプリへ deploy 済み。
      - 本番 deployment `AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q` を version `368` へ更新。
  - 2026-07-14 追加前進 8
    - 初期ロード契約・自動更新・背景取得優先順位の棚卸しメモを追加。
    - `INITIAL_LOAD_CONTRACT_REVIEW.md`
      - `teacherInit` / `teacherStatusSnapshot` / `getLessonStatus` / `studentInit` / `studentLoadState` の責務境界を整理。
      - 背景取得を `初期必須` / `遅延取得` / `タブ表示時のみ` の3段階で定義。
      - 自動更新を stream 単位で扱い、`epoch` / `requestSeq` / token による古いレスポンス破棄方針を明文化。
    - このメモは、次の最小差分実装の基準として使う。
    - まだコード本体の責務分離は未着手。
  - 2026-07-14 追加前進 9
    - ページごとの必要性・使用頻度を前提に、タブを開いた時の空待ちを減らす方針へ整理。
    - `INITIAL_LOAD_CONTRACT_REVIEW.md`
      - 教師ページ / 児童ページごとの使用頻度と取得方針を追記。
      - 「よく使うページはタブを開く前に裏で温める」「タブ表示時はキャッシュ即表示 + 最新化」を基本方針にした。
    - `src/teacher_script_core.html`
      - `scheduleTeacherPreload()` で現在授業の status cache を先読みする `scheduleTeacherStatusPreload_()` を追加。
      - `loadStatusInit()` で `loadStatus()` が二重に走り得る状態を避けるよう調整。
    - `src/teacher_script_units.html`
      - `loadStatus()` に `preloadCache.statusLoading` による in-flight 制御と failure handler を追加。
    - 目的:
      - 既定表示かつ高頻度の「授業状況」を、タブを開いた瞬間の待ちにしない。
      - 同じ status 取得を同時に複数回走らせない。
  - 2026-07-14 追加前進 10
    - 授業記録の通信量を減らす compact payload を追加。
    - `src/06_teacher.js`
      - `getAggregateDataJson()` で `options.compact === true` の場合、各行に重複していた `fields` を field set 辞書へ分離。
      - `rowsCompact` は短い配列形式で返し、`rowSchema` で列名も一緒に返す。旧 `rows` 形式も互換として残す。
      - compact 時の `fields` は表示・評定で使う属性だけに絞り、`answersMap` は空値を落として送る。
    - `src/teacher_script_reports.html`
      - `fetchAggregateDataSet_()` が `{ compact:true }` を渡すよう変更。
      - `expandCompactAggregateRows_()` で `rowSchema` を見ながら compact payload を従来の rows に展開し、既存描画処理は維持。
    - ねらい:
      - 授業記録で同じ項目定義を児童数分・時間数分繰り返し送る無駄を削る。
      - まず通信 payload を軽くし、次段で用途別に不要列を送らない設計へ進める。
    - deploy:
      - 2026-07-14 に本番 Webアプリへ deploy 済み。
      - 本番 deployment `AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q` を version `372` へ更新。
      - `cdn/shell-config.json` と `onboarding/admin-app.js` の latest version も `372` へ同期。
      - `admin.config.json` がない環境のため、配布テンプレート・導入管理・provision 更新は deploy script 上でスキップ。
  - 2026-07-14 追加前進 11
    - 教師画面の授業状況が空表示と実データ表示で交互に見えることがある問題を修正。
    - 原因:
      - `teacherStatusSnapshot()` が軽量APIなのに空の `status.students: []` を返していた。
      - 初期ロード側がその空 status を本物の授業状況として `renderStatus()` し、status cache にも保存し得た。
    - `src/06_teacher.js`
      - `teacherStatusSnapshot()` から空 status を返さないよう変更。
    - `src/teacher_script_core.html`
      - 初期ロードで snapshot 由来の status は、students がある場合だけ描画。
    - `src/teacher_script_units.html`
      - `renderStatus()` で `unitId` / `lessonId` を持たない空 status は描画・キャッシュしない。
    - deploy:
      - 2026-07-14 に本番 Webアプリへ deploy 済み。
      - 本番 deployment `AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q` を version `373` へ更新。
      - `cdn/shell-config.json` と `onboarding/admin-app.js` の latest version も `373` へ同期。
    - Pages:
      - `npm run build:portable` で `portable/` は再生成済み。
      - ただし、この作業では commit / push はしていないため、GitHub Pages / Cloudflare Pages 側の公開更新は未実施。
  - 2026-07-14 追加前進 12
    - 読み書きの追加高速化。
    - `src/03_domain.js`
      - `studentNumber` 指定の Responses 読み込み経路を追加。
      - `getResponseRecordByResponseId_()` に短期 responseId キャッシュを追加。
      - `listAllResponses_()` で responseId キャッシュも温めるよう変更。
      - 評定保存時に `assessments` キャッシュ世代を進めるよう変更。
    - `src/06_teacher.js`
      - `readTeacherRecordSource_()` に `studentNumber` スコープを追加。
      - `getStudentPortfolioData()` が1人分を見るだけで全記録を読む状態を避けるよう変更。
      - 出席番号欠けの古いデータだけ、従来の全件探索へ fallback する。
      - `getAggregateDataJson()` に短時間の完成済みJSONキャッシュを追加。
    - ねらい:
      - 児童履歴・教師ポートフォリオの読み込みを軽くする。
      - コメント保存・メダル保存など responseId 指定の単発操作で、全件探索に落ちる頻度を減らす。
      - 記録タブの背景取得・再表示で同じ圧縮JSONを短時間再利用する。
    - 確認済み:
      - `node --check src/03_domain.js`
      - `node --check src/04_student.js`
      - `node --check src/06_teacher.js`
      - `node scripts/build-teacher-legacy.js`
      - `npm run build:portable`
      - legacy / portable HTML script 構文確認
    - deploy:
      - 2026-07-14 に本番 Webアプリへ deploy 済み。
      - 本番 deployment `AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q` を version `374` へ更新。
      - `cdn/shell-config.json` と `onboarding/admin-app.js` の latest version も `374` へ同期。
      - `admin.config.json` がない環境のため、配布テンプレート・導入管理・provision 更新は deploy script 上でスキップ。
  - 2026-07-14 追加前進 13
    - 児童ページの番号押下後ロードと、授業スタートタブの先読みを追加調整。
    - `src/04_student.js`
      - `studentInit()` / `studentLoadState()` から前時ふりかえり同期取得を外し、入力画面に必要な本人 state を先に返すよう変更。
      - 前時ふりかえり・前時の次のめあては、従来どおり画面表示後の `getStudentPreviousReview()` で後追い取得。
    - `src/index.html`
      - 名簿 localStorage キャッシュだけ 24 時間に延長し、番号一覧は直近名簿を即表示しやすくした。
      - bootstrap 更新が空名簿を返しても既存名簿を消さないようにし、初期ロード中の「名簿未設定」誤表示を抑制。
      - 提出後の他者参照は、教師指定の表示項目よりも「ふりかえり/理解度」系を優先表示するよう変更。
    - `src/03_domain.js` / `portable-src/runtime-shim.js`
      - portable の軽量名簿取得では shell 取得を省略可能にし、初期番号表示の背景取得を軽くした。
      - 名簿更新時に script cache 側の `student_entry_options_v2` も削除するよう変更。
    - `src/06_teacher.js` / `src/teacher_script_core.html`
      - 授業スタートタブの「単元選択 -> 次の授業時数」用に、Responses 全件ではなく Lessons だけの軽量単元進捗を初期返却できるようにした。
      - full 進捗更新の idle 待ちを短縮し、初期表示後の補正を早めた。
    - 確認済み:
      - `node --check src/03_domain.js`
      - `node --check src/04_student.js`
      - `node --check src/06_teacher.js`
      - `node --check portable-src/runtime-shim.js`
      - `node scripts/build-teacher-legacy.js`
      - `npm run build:portable`
      - legacy / portable HTML script 構文確認
    - deploy:
      - 2026-07-14 に本番 Webアプリへ deploy 済み。
      - 本番 deployment `AKfycbwo3TBXAkqLSx6XYcXxTI5m34DerRMHaB6X13dymilmU_wmc-Fn5F-2jkNofErLevVo7Q` を version `375` へ更新。
      - `cdn/shell-config.json` と `onboarding/admin-app.js` の latest version も `375` へ同期。
      - `admin.config.json` がない環境のため、配布テンプレート・導入管理・provision 更新は deploy script 上でスキップ。

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
- 初期ロードと自動更新は最適化差分が積み重なっており、`teacherStatusSnapshot -> teacherInit -> preload` と `studentInit -> studentLoadState -> background fetch` の責務境界を次段で実装整理する必要がある。

## 次にやる候補

- `src/07_portable_rpc.js` の `rpc` 互換受理を、実参照を見ながらさらに縮める。
- `scripts/build-static-port.ps1` の retire 可否を運用面から判断する。
- `main` 一本化後に preview branch 運用をどこまで減らせるか確認する。
- 薄いGASの固定契約にする最小APIセットを整理する。
- `portable` 側で古い返り値を吸収する正規化層の候補を洗い出す。
- `INITIAL_LOAD_CONTRACT_REVIEW.md` を基準に、status / timeline の古いレスポンス破棄方法を先にそろえる。
- `teacherInit` と `studentInit` の「初期必須」と「背景取得」の境界をコメントと軽いコード整理で固定する。
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
