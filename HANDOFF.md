# ふりかえりアプリ HANDOFF

## 最初に読む範囲

- 新スレでは `FILEMAP.md` とこの `HANDOFF.md` だけ読む。
- 基本運用は `編集 -> 確認 -> デプロイ`。
- この環境では相対パスや `workdir` が不安定なことがあるので、読込・検索は絶対パス優先。

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
  `ふりかえりアプリ_配布用マスター_20260705`

## 現在の最新版

- 2026-07-05 時点
  - 本体 version `305`
  - 配布テンプレート version `36`
  - 導入管理 version `129`
  - provision version `66`
  - shell build `shell-config-phase2-2026-07-05-1730`

## デプロイ

- 本体反映
  `C:\Program Files\nodejs\npm.cmd run deploy:webapp`
- これで本体、配布テンプレート、導入管理、provision までまとめて更新する。
- 配布テンプレート更新は、現在は `clasp` 経由ではなく認可済みスクリプト経由で復旧済み。
- 配布テンプレートの deployment は `@HEAD` ではなく version 指定の
  `AKfycbwbFTT9j5AJvHC7136q7hUERxVDFJ6XGmatRBnGQcQoKk8rIhU5Te2SSN_FrUmbh3lXPQ`
  を使う。`admin.config.json` もこの ID に更新済み。

## 主要ファイル

- GAS本体
  `src/00_bootstrap.js` から `src/06_teacher.js`
- 児童画面
  `src/index.html`
- 教師画面親
  `src/teacher.html`
- 教師画面分割
  `src/teacher_section_*.html`, `src/teacher_script_*.html`
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

## 直近の重要修正

- 教師画面の単元初期表示が消える問題に対して、初期データをHTMLへ埋め込む構成へ変更済み。
- 教師画面の `授業スタート` は軽量スナップショット読込を使うよう変更済み。
- 授業中表示の不安定さに対して、
  - アクティブ設定のまとめ書き
  - 古いレスポンスの無視
  - `unitId` ベースの描画フォールバック
  を入れている。
- 単元設定では、追加・削除後に単元一覧と授業開始候補を即時更新し、一覧要約を表示するよう変更済み。
- 一時診断用の `debug:` 表示と build への詳細診断表示は画面から外した。内部保険ロジックは維持。
- `使い方` タブに「アプリ更新」を追加し、最新版確認と self update 実行ができるようにした。
- `使い方` タブの更新確認は、先生画面起動時に自動で一度走る。中央 manifest と `remote_inspect/update-bundle.json` / `src/99_update_bundle.js` を使う self update 初版を追加した。
- self update 失敗時は、Apps Script API 未有効・権限不足・deployment 不整合などを日本語で返すようにした。
- `scripts/deploy-webapp.ps1` で、本体 version 作成後に `onboarding/admin-app.js` の `latestTenantAppVersion` を自動同期するようにした。
- 更新ありだが self update 不可の個体では、help タブの同じボタンから `更新依頼` を送れる fallback を追加した。
- `設定・Aiプロンプト` を `AI設定` / `更新` の小タブ構成に変更し、更新UI本体は `設定 > 更新` に移した。`使い方` には導線だけ残した。
- `設定 > 更新` に `1つ前に戻す` を追加した。内部的には Apps Script API で現在 deployment の versionNumber を1つ前へ差し替える。
- 更新タブと `使い方` タブの古い self update 前提文言を修正した。現在の案内は `更新確認` / `更新依頼` / `1つ前に戻す` ベース。
- `初期設定` メニューに `更新機能を有効化する` を追加した。`つぎへ` シートでも、デプロイURL反映後に一度これを押して更新用認可を通す案内へ変更した。
- `初期設定` メニューに `セットアップパネルを開く` を追加し、未完了時は onOpen で自動サイドバー表示するようにした。詳細説明用に大きい `セットアップガイド` モーダルも追加した。
- `初期設定` の URL反映は `デプロイURL反映と更新認可` に統合した。WebアプリURLだけでなく deploymentId 単体も受け付け、可能ならその場で更新認可まで続けて確認する。
- `セットアップ開始` は親ボタン化した。未登録なら登録、登録済みなら次の未完了ステップへ進み、URL反映済みなら更新認可まで進める。
- デプロイ完了判定は締め直した。`deploymentId` だけでは完了扱いにせず、実際の WebアプリURL が確認できたときだけ URL反映済みとみなす。`セットアップガイド` は modeless 表示に変え、開いたままシート操作できるようにした。
- `セットアップ開始` で、自動デプロイを先に試すようにした。通れば deployment 作成と URL保存まで進み、失敗したときだけ手動ガイドへ落とす。登録時の入力は `先生名` と `学校名` を主にし、`学年` と `組` は必須にしない。
- GAS版は現場運用版として残し、配布版は Web/PWA へ切り出す前提で整理を始めた。叩き台は `WEBAPP_MVP_ROADMAP.md` と `WEBAPP_SCREEN_MAP.md`。
- 配布版MVPの着手材料として `WEBAPP_MVP_TASKS.md` と `supabase/mvp_schema.sql` を追加した。Next.js + Supabase 前提で、最初の一本は `授業開始 -> 児童提出 -> 返却`。
- `webapp/` を新設し、Next.js の最小骨組みを追加した。`webapp/app/teacher/page.tsx` は授業スタート中心の教師画面、`webapp/app/student/page.tsx` は番号選択 -> 時間選択 -> 入力の児童画面モック。
- `webapp/app/globals.css` で現行アプリの雰囲気を踏まえた配色とカードレイアウトを入れた。GAS特有の更新・配布UIは持ち込まず、画面導線だけ継承する方針。
- `webapp/app/login/page.tsx` と `webapp/app/setup/page.tsx` を追加し、配布版の入口と初回設定の流れを置いた。
- `webapp/components/teacher-dashboard.tsx` と `webapp/components/student-experience.tsx` で、教師タブ切替、提出一覧、個別返却、児童の番号選択、時間選択、提出、これまで表示までを client component のモックでつないだ。
- `webapp/lib/mock-data.ts` を置き、Supabase 接続前でも名簿40件・授業候補・返却キューを固定データで再現できるようにした。
- `webapp/lib/app-state.tsx` を追加し、ローカル状態で `先生が授業開始 -> 児童提出 -> 先生返却 -> 児童返却確認` が画面間でつながる状態にした。localStorage 保存あり。
- `webapp/package-lock.json` と `webapp/node_modules` は作成済み。`webapp` は `npm run build` 通過済み。
- ルート `package.json` に `web:dev` / `web:build` を追加した。root から `npm run web:dev` で起動、`npm run web:build` でビルド確認できる。
- Web版はその後かなり進んだ。現在は `授業開始 -> この時間だけ項目編集 -> 児童下書き保存 -> 提出 -> 教師モニタ -> 個別返却 -> 児童返却確認 -> 記録/ポートフォリオ確認` まで local demo で一通りつながる。
- `webapp/components/teacher-dashboard.tsx` では、授業中モニタ、下書き/提出/返却の人数、単元追加削除、名簿一括登録、児童別ポートフォリオ、授業レポートまで見える。
- `webapp/components/student-experience.tsx` では、番号ボタン上で `下書き` / `提出` 状態を見せ、途中保存した内容を復元する。`みんなの記録` と `これまで` も提出データから動的生成する。
- `webapp/lib/app-models.ts` を追加し、Web版の state model を分離した。
- `webapp/lib/local-demo-store.ts` に localStorage ベース保存を切り出した。
- `webapp/lib/app-store.ts`, `webapp/lib/local-demo-app-store.ts`, `webapp/lib/get-app-store.ts` を追加し、保存層の interface と切替口を作った。
- `webapp/lib/supabase-app-store.ts` に Supabase 保存層の初版を追加した。`NEXT_PUBLIC_APP_STORE_MODE=supabase` と `NEXT_PUBLIC_SUPABASE_CLASS_ID` を前提に、`classes / students / units / lessons / responses` を読む・更新する構成。
- `webapp/.env.example` に `NEXT_PUBLIC_APP_STORE_MODE` を追加済み。現状の既定は `local`。
- 2026-07-05 時点で、`webapp` は store 分離・Supabase 初版追加後も `npm run build` 通過済み。
- `scripts/refresh-distribution-template-auth.mjs` は BOM 付き JSON を読めるよう修正し、Sheets API 無効時の fallback を `GET` ではなく `POST action=refreshTemplateMaster` で叩くよう変更した。
- `使い方 > 更新を確認` は、押したときに個体の shell config キャッシュを一度消してから再取得するよう修正した。表示上の `古いキャッシュ使用中` / `新しい` 判定も再取得後のキャッシュを使う。
- `cdn/shell-config.json` と `cdn/maintenance-status.json` はローカル書き出しまで更新済み。GitHub Pages 側へは別途この `cdn` 配下を反映する。

## 今の注意点

- 教師画面修正後は、`teacher_script_*_legacy.html` を手で触らず、デプロイ時の自動生成に任せる。
- 互換性不具合を疑うときは、まず `teacher_preflight.html` の表示を見る。
- 長いログ全文は会話に貼らず、代表行だけ貼る。
- deploymentId、URL、version は会話に繰り返さず、このファイルを見る前提で進める。
- Marketplace 向けの進め方は `MARKETPLACE_ROADMAP.md` を参照する。
- 2026-07-04 時点で、main 本体・debug・provision は再デプロイ可能。debug は `AKfycbyEz...` を使う。
- `scripts/deploy-webapp.ps1` は、main 成功後に debug deployment だけ失敗しても警告扱いで続行する。
- `scripts/deploy-webapp.ps1` は、main 成功後にテンプレ / admin / provision の更新が失敗しても warning 扱いで続行するよう変更済み。

## 今の未整理ポイント

- `授業スタート` タブは最重要導線なので、まだ体感速度改善の余地あり。
- ログ調査系は会話コストが重いので、必要箇所だけ抜粋する運用へ寄せる。

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
