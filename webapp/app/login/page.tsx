"use client";

import { useAppState } from "@/lib/app-state";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const { signIn, signedIn, profile, students, units } = useAppState();
  const router = useRouter();
  const [email, setEmail] = useState("teacher@example.com");
  const [password, setPassword] = useState("password");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Teacher Sign In</p>
        <h1>先生ログイン</h1>
        <p className="subtle">
          配布版では、GAS のデプロイや認可ではなく、ここから普通の Web アプリとして入る。
        </p>
        <div className="detail-card">
          <p className="mini-title">このまま入れる状態</p>
          <p className="subtle">
            {profile.teacherName} / {profile.schoolName} / 名簿 {students.length}人 / 単元 {units.length}件
          </p>
          <p className="subtle">{signedIn ? "いまはログイン済みのデモ状態です。" : "未ログインの入口を再現しています。"}</p>
        </div>
        <div className="form-stack">
          <label className="field">
            <span className="field-label">メールアドレス</span>
            <input
              className="text-input"
              onChange={(event) => setEmail(event.target.value)}
              value={email}
            />
          </label>
          <label className="field">
            <span className="field-label">パスワード</span>
            <input
              className="text-input"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          <div className="button-row">
            <button
              className="button button-outline"
              onClick={() => router.push("/teacher")}
              type="button"
            >
              先生画面を先に見る
            </button>
            <button
              className="button button-muted"
              onClick={() => router.push("/setup")}
              type="button"
            >
              初回設定へ
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                if (!email || !password) return;
                signIn();
                router.push("/teacher");
              }}
              type="button"
            >
              ログイン
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
