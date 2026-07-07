# ふりカエルLite MVP

## ファイル

- `Code.gs`
  教員ごとの Google Apps Script Web API 本体
- `setup.html`
  `/setup?api=GAS_URL` で使う初期設定画面
- `student.html`
  児童提出画面
- `teacher.html`
  先生一覧画面
- `app.js`
  共通通信・`localStorage`・送信制御

## 最短の動かし方

1. 新しいスプレッドシートを作る
2. そのスプレッドシートに紐づく Apps Script を開く
3. `Code.gs` を貼る
4. Web アプリとしてデプロイする
5. `setup.html` `student.html` `teacher.html` `app.js` を同じ静的配信先に置く
6. `setup.html?api=GAS_WEBAPP_URL` を開く
7. 接続テスト成功後に `student.html` と `teacher.html` を使う

## この MVP の仕様

- POST は `Content-Type: text/plain;charset=utf-8`
- 児童送信時に `0〜5秒` のジッター待機を入れる
- 児童は送信失敗時も下書きを保持する
- 先生画面は `30秒ごとの自動更新` と `手動更新` を併用する
- 楽観的 UI は使わず、送信完了は API 成功後にだけ表示する
