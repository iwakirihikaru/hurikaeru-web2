# Vercel デプロイ手順

## 前提

- このアプリは `D:\Iwaki\Documents\ふりかえり\webapp` を `Vercel` に上げる
- `Root Directory` は `webapp` にする
- `next build` は通過済み

## 先に用意するもの

- `Supabase` プロジェクト
- `supabase/mvp_schema.sql` を流した DB
- 必要なら `supabase/mvp_seed_demo.sql` を流した初期データ
- 公開先で使う `class_id`

## Vercel 側の設定

1. `New Project`
2. この repo を選ぶ
3. `Root Directory` を `webapp`
4. Framework は `Next.js`
5. Environment Variables に次を入れる

### local demo で先に上げる場合

- `NEXT_PUBLIC_APP_STORE_MODE=local`

### Supabase で上げる場合

- `NEXT_PUBLIC_APP_STORE_MODE=supabase`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_CLASS_ID`
- `NEXT_PUBLIC_SUPABASE_ORGANIZATION_NAME`

## 最小 seed の使い方

1. `supabase/mvp_schema.sql` を流す
2. `supabase/mvp_seed_demo.sql` を流す
3. `NEXT_PUBLIC_SUPABASE_CLASS_ID=20000000-0000-0000-0000-000000000001`
4. `NEXT_PUBLIC_SUPABASE_ORGANIZATION_NAME=サンプル小学校`

## 推奨

- まず Preview / Production ともに `local` で 1 回上げる
- 表示確認後に `supabase` へ切り替える

## デプロイ後の確認順

1. `/`
   先生向けホームが開く
2. `/teacher`
   授業スタート画面が開く
3. `/student`
   出席番号選択が開く
4. 先生で授業開始
5. 児童で下書き保存と提出
6. 先生で返却
7. 児童で返却確認

## Supabase 切替時の注意

- `NEXT_PUBLIC_SUPABASE_CLASS_ID` がないと読み込みに失敗する
- `classes / students / units / lessons / responses` に最低限のデータが必要
- いまの実装は認証本実装前なので、`class_id` を固定で見る

## 現時点の判断

- `local` モードの公開確認は進めやすい
- `supabase` モードは実データ投入後に導線確認が必要
