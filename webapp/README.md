# ふりかえり Web/PWA 版

GAS版で実際に通っている画面導線を残しつつ、配布・更新・認可の難しさを外すための Web 版土台です。

## 目的

- GAS版は自分用・現場検証用として残す
- 配布向けは `webapp/` で別実装にする
- 最初は `授業開始 -> 児童提出 -> 教師返却` の一本だけを通す

## このディレクトリに入れたもの

- `app/page.tsx`
  - 入口ページ
- `app/login/page.tsx`
  - 先生ログイン入口
- `app/setup/page.tsx`
  - 初回設定画面
- `app/teacher/page.tsx`
  - 教師画面エントリ
- `app/student/page.tsx`
  - 児童画面エントリ
- `components/teacher-dashboard.tsx`
  - 教師タブ、提出一覧、個別返却の操作モック
- `components/student-experience.tsx`
  - 番号選択、時間選択、入力、提出、これまで表示の操作モック
- `app/globals.css`
  - 現行アプリの雰囲気を踏まえた共通スタイル
- `lib/mock-data.ts`
  - Supabase 差し替え前の仮データ
- `lib/app-store.ts`
  - 保存層の共通 interface
- `lib/local-demo-app-store.ts`
  - 現在使っている localStorage ベースの保存層
- `lib/supabase-app-store.ts`
  - `class_id` 前提で `students / units / lessons / responses` を読む Supabase 保存層の初版
- `lib/supabase.ts`
  - Supabase 接続の最小ラッパー
- `lib/gas-app-store.ts`
  - 既存の Web 画面状態をそのまま `GAS Web API` の `SAVE_CONFIG / GET_CONFIG` へ保存する保存層
- `lib/gas.ts`
  - `text/plain;charset=utf-8` で GAS へ投げる最小ラッパー

## 次にやること

1. `npm install`
2. `npm run dev`
3. `http://localhost:3000` を開く
4. `teacher` 画面で授業開始
5. `student` 画面で番号選択して提出
6. `teacher` 画面で返却
7. `student` 画面で返却確認
8. Supabase プロジェクト作成
9. `supabase/mvp_schema.sql` を流す
10. 必要なら `supabase/mvp_seed_demo.sql` を流す
11. `.env.local` で `NEXT_PUBLIC_APP_STORE_MODE=supabase` に切替
12. `NEXT_PUBLIC_SUPABASE_CLASS_ID` を設定
13. 教師ログインと組織作成を実データ化
14. 名簿・単元・授業・提出を Supabase へ接続
15. 返却コメント保存と一覧再描画を実データ化

## 現在の保存モード

- `NEXT_PUBLIC_APP_STORE_MODE=local`
  - 現在の既定
  - localStorage ベースのデモ保存
- `NEXT_PUBLIC_APP_STORE_MODE=supabase`
  - `webapp/lib/supabase-app-store.ts` を使う
  - `NEXT_PUBLIC_SUPABASE_CLASS_ID` が必要
  - まだ組織作成や認証は簡略状態
- `NEXT_PUBLIC_APP_STORE_MODE=gas`
  - `webapp/lib/gas-app-store.ts` を使う
  - `NEXT_PUBLIC_GAS_API_URL` が必要
  - 状態全体を `SAVE_CONFIG / GET_CONFIG` で保存する
  - 提出ログだけ `SAVE_RESPONSE` にも追記する

## GAS モードで必要な API

- `PING`
- `SAVE_CONFIG`
- `GET_CONFIG`
- `SAVE_RESPONSE`

現在の `gas` モードは、現行 Web 版の項目構造を壊さないために、`profile / units / students / activeLesson / responses` をまとめて `config` として保存します。
つまり、GAS 側は「単元」「名簿」「返却」専用 API を細かく持たなくても、上の4アクションがあれば動かせます。

GAS に貼るスクリプトの叩き台は [webapp/gas/Code.gs](D:/Iwaki/Documents/ふりかえり/webapp/gas/Code.gs) に置いてあります。

## GAS モード接続手順

1. スプレッドシートを1つ作る
2. そのスプレッドシートに紐づく Apps Script を開く
3. `webapp/gas/Code.gs` を貼る
4. Web アプリとしてデプロイする
5. `.env.local` に `NEXT_PUBLIC_APP_STORE_MODE=gas` を入れる
6. `.env.local` に `NEXT_PUBLIC_GAS_API_URL=<デプロイURL>` を入れる
7. 必要なら `NEXT_PUBLIC_GAS_CONFIG_KEY=furikaeri_webapp_state` を調整する
8. `npm run dev` で `teacher` と `student` を確認する

## Vercel 公開

- `Vercel` に上げるときは `Root Directory` を `webapp` にする
- 環境変数は `.env.example` を基準に入れる
- 手順は `VERCEL_DEPLOY.md` を見る
- まず `NEXT_PUBLIC_APP_STORE_MODE=local` で上げ、その後 `supabase` に切り替えるのが安全

## 方針

- GAS特有の更新・配布・認可 UI は持ち込まない
- 先生が最初に見るのは `授業スタート`
- 児童は `番号選択 -> 時間選択 -> 入力` の順を維持する
- `40番だけ見える` のような配列欠損事故を避けるため、名簿表示は固定の一覧データから描画する
