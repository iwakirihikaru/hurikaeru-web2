"use client";

import { useAppState } from "@/lib/app-state";
import { setupChecklist } from "@/lib/mock-data";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SetupPage() {
  const { profile, students, units, completeSetup } = useAppState();
  const router = useRouter();
  const [teacherName, setTeacherName] = useState(profile.teacherName);
  const [schoolName, setSchoolName] = useState(profile.schoolName);
  const [grade, setGrade] = useState(profile.grade);
  const [className, setClassName] = useState(profile.className);

  return (
    <main className="auth-shell">
      <section className="setup-board">
        <div className="setup-copy">
          <p className="eyebrow">Initial Setup</p>
          <h1>初回セットアップ</h1>
          <p className="subtle">
            GAS版で詰まりやすかった URL 反映、デプロイ ID、Apps Script API 認可はこの流れから外す。
          </p>
          <div className="detail-card">
            <p className="mini-title">準備の進み具合</p>
            <p className="subtle">
              先生名: {profile.teacherName} / 名簿 {students.length}人 / 単元 {units.length}件
            </p>
            <p className="subtle">この画面を終えたら、そのまま先生画面で `授業スタート` に進めます。</p>
          </div>
        </div>

        <div className="setup-steps">
          {setupChecklist.map((item) => (
            <div key={item.id} className="setup-step">
              <span className={`step-mark${item.done ? " done" : ""}`}>
                {item.done ? "✓" : String(setupChecklist.findIndex((entry) => entry.id === item.id) + 1)}
              </span>
              <div>
                <p className="mini-title">{item.label}</p>
                <p className="subtle">
                  {item.done ? "この項目は完了済みの想定。" : "この画面で続けて設定する。"}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>登録フォーム</h2>
            <span className="badge">学年・組は後からでも可</span>
          </div>
          <div className="setup-form-grid">
            <label className="field">
              <span className="field-label">先生名</span>
              <input
                className="text-input"
                onChange={(event) => setTeacherName(event.target.value)}
                value={teacherName}
              />
            </label>
            <label className="field">
              <span className="field-label">学校名</span>
              <input
                className="text-input"
                onChange={(event) => setSchoolName(event.target.value)}
                value={schoolName}
              />
            </label>
            <label className="field">
              <span className="field-label">学年</span>
              <input
                className="text-input"
                onChange={(event) => setGrade(event.target.value)}
                value={grade}
              />
            </label>
            <label className="field">
              <span className="field-label">組</span>
              <input
                className="text-input"
                onChange={(event) => setClassName(event.target.value)}
                value={className}
              />
            </label>
          </div>
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
              onClick={() => router.push("/login")}
              type="button"
            >
              ログインへ戻る
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                completeSetup({
                  teacherName,
                  schoolName,
                  grade,
                  className
                });
                router.push("/teacher");
              }}
              type="button"
            >
              設定して開始
            </button>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>次にやること</h2>
            <span className="badge">授業前の順番</span>
          </div>
          <div className="table-like">
            <div className="table-row">
              <p className="mini-title">1. 名簿を見る</p>
              <span className="subtle">出席番号と名前がそろっているか確認</span>
            </div>
            <div className="table-row">
              <p className="mini-title">2. 単元設定を見る</p>
              <span className="subtle">項目をその時間用に整える</span>
            </div>
            <div className="table-row">
              <p className="mini-title">3. 授業スタートへ</p>
              <span className="subtle">授業中モニタと返却まで同じ画面で進める</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
