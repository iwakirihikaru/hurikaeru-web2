"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";

export default function HomePage() {
  const router = useRouter();
  const { signedIn, profile, students, units, activeLesson, responses, storeKind, lastError } = useAppState();

  const homeStats = useMemo(() => {
    const submitted = activeLesson
      ? responses.filter((response) => response.lessonId === activeLesson.id && response.submittedAt).length
      : 0;
    const returned = activeLesson
      ? responses.filter((response) => response.lessonId === activeLesson.id && response.returnedAt).length
      : 0;
    return {
      students: students.length,
      units: units.length,
      submitted,
      returned
    };
  }, [activeLesson, responses, students.length, units.length]);

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Teacher Home</p>
          <h1>授業前の準備から授業中の返却まで、ここから入る。</h1>
          <p className="lede">
            GAS版で実際に使っていた順番に寄せて、先生が最短で `授業スタート` へ入れる入口にしています。
          </p>
          <div className="button-row">
            <button
              className="button button-primary"
              onClick={() => router.push(signedIn ? "/teacher" : "/login")}
              type="button"
            >
              {signedIn ? "授業スタートへ" : "先生ログインへ"}
            </button>
            <button
              className="button button-muted"
              onClick={() => router.push("/setup")}
              type="button"
            >
              初回設定をひらく
            </button>
          </div>
        </div>
        <div className="hero-card">
          <p className="mini-title">いまの状態</p>
          <div className="table-like">
            <div className="table-row">
              <p className="mini-title">先生</p>
              <span className="subtle">{profile.teacherName}</span>
            </div>
            <div className="table-row">
              <p className="mini-title">クラス</p>
              <span className="subtle">
                {profile.schoolName} / {profile.grade}年{profile.className}組
              </span>
            </div>
            <div className="table-row">
              <p className="mini-title">保存先</p>
              <span className="subtle">{storeKind === "supabase" ? "Supabase" : "ローカルデモ"}</span>
            </div>
            <div className="table-row">
              <p className="mini-title">授業</p>
              <span className="subtle">
                {activeLesson ? `${activeLesson.periodLabel} ${activeLesson.unitName}` : "まだ開始していません"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {lastError ? (
        <section className="panel">
          <div className="panel-head">
            <h2>確認が必要です</h2>
            <span className="badge">要確認</span>
          </div>
          <p className="subtle">{lastError}</p>
        </section>
      ) : null}

      <section className="card-grid card-grid-three">
        <button className="jump-card jump-button-card" onClick={() => router.push("/teacher")} type="button">
          <span className="jump-label">1. 授業スタート</span>
          <span className="jump-text">単元を選び、授業中モニタと返却まで進めます。</span>
        </button>
        <button className="jump-card jump-button-card" onClick={() => router.push("/setup")} type="button">
          <span className="jump-label">2. 準備を整える</span>
          <span className="jump-text">先生情報、名簿、単元の初期準備をまとめて確認します。</span>
        </button>
        <Link href="/student" className="jump-card">
          <span className="jump-label">3. 児童画面を確認</span>
          <span className="jump-text">番号選択、入力、返却確認までの見え方を事前に見られます。</span>
        </Link>
      </section>

      <section className="card-grid">
        <div className="jump-card">
          <span className="jump-label">今日の確認</span>
          <span className="jump-text">名簿 {homeStats.students}人 / 単元 {homeStats.units}件</span>
          <span className="jump-text">
            {activeLesson
              ? `提出 ${homeStats.submitted}件 / 返却 ${homeStats.returned}件`
              : "授業開始前です。"}
          </span>
        </div>
        <div className="jump-card">
          <span className="jump-label">運用の考え方</span>
          <span className="jump-text">先生はまず授業スタート、必要なら単元設定と名簿、最後に児童画面確認の順です。</span>
        </div>
      </section>
    </main>
  );
}
