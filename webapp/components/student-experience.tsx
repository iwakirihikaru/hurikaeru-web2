"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";

type LessonOption = {
  id: string;
  label: string;
  unitName: string;
  isCurrent: boolean;
};

export function StudentExperience() {
  const { students, activeLesson, responses, submitResponse, saveDraftResponse } = useAppState();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;

  const lessonOptions = useMemo<LessonOption[]>(() => {
    const options = new Map<string, LessonOption>();
    if (activeLesson) {
      options.set(activeLesson.id, {
        id: activeLesson.id,
        label: activeLesson.periodLabel,
        unitName: activeLesson.unitName,
        isCurrent: true
      });
    }

    if (selectedStudentId) {
      responses
        .filter(
          (response) =>
            response.studentId === selectedStudentId &&
            Boolean(response.submittedAt) &&
            !options.has(response.lessonId)
        )
        .forEach((response) => {
          options.set(response.lessonId, {
            id: response.lessonId,
            label: response.periodLabel,
            unitName: response.unitName,
            isCurrent: false
          });
        });
    }

    return Array.from(options.values());
  }, [activeLesson, responses, selectedStudentId]);

  const selectedLesson =
    lessonOptions.find((lesson) => lesson.id === selectedLessonId) ?? lessonOptions[0] ?? null;

  const selectedResponse =
    selectedStudentId && selectedLesson
      ? responses.find(
          (response) =>
            response.lessonId === selectedLesson.id && response.studentId === selectedStudentId
        ) ?? null
      : null;

  const isCurrentLesson = Boolean(selectedLesson?.isCurrent && activeLesson);

  const lessonFields = useMemo(() => {
    if (selectedLesson?.isCurrent) {
      return activeLesson?.fields ?? ["わかったこと", "まだ迷っていること"];
    }
    return Object.keys(selectedResponse?.answers ?? selectedResponse?.draftAnswers ?? {});
  }, [
    activeLesson?.fields,
    selectedLesson?.isCurrent,
    selectedResponse?.answers,
    selectedResponse?.draftAnswers
  ]);

  useEffect(() => {
    setSelectedLessonId((current) => {
      if (current && lessonOptions.some((lesson) => lesson.id === current)) {
        return current;
      }
      return lessonOptions[0]?.id ?? null;
    });
  }, [lessonOptions]);

  useEffect(() => {
    const nextAnswers = Object.fromEntries(
      lessonFields.map((label) => [
        label,
        selectedResponse?.draftAnswers?.[label] ?? selectedResponse?.answers?.[label] ?? ""
      ])
    );
    setAnswers(nextAnswers);
    setDraftSaved(false);
  }, [
    lessonFields,
    selectedLesson?.id,
    selectedResponse?.answers,
    selectedResponse?.draftAnswers,
    selectedResponse?.studentId,
    selectedResponse?.submittedAt
  ]);

  const timelineItems = useMemo(() => {
    if (!activeLesson || !isCurrentLesson) return [];
    return responses
      .filter(
        (response) =>
          response.lessonId === activeLesson.id && response.studentId !== selectedStudentId
      )
      .flatMap((response) =>
        Object.values(response.answers)
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 2)
      )
      .slice(0, 6);
  }, [activeLesson, isCurrentLesson, responses, selectedStudentId]);

  const timelineCards = useMemo(() => {
    if (!activeLesson || !isCurrentLesson) return [];
    return responses
      .filter(
        (response) =>
          response.lessonId === activeLesson.id &&
          response.studentId !== selectedStudentId &&
          Object.keys(response.answers).length > 0
      )
      .slice(0, 4)
      .map((response) => {
        const student = students.find((entry) => entry.id === response.studentId);
        const firstEntry = Object.entries(response.answers).find(([, value]) => value.trim());
        return {
          id: `${response.lessonId}-${response.studentId}`,
          studentLabel: student
            ? `${String(student.attendanceNumber).padStart(2, "0")} ${student.displayName}`
            : "ほかの児童",
          fieldLabel: firstEntry?.[0] ?? "ふりかえり",
          summary: firstEntry?.[1] ?? ""
        };
      });
  }, [activeLesson, isCurrentLesson, responses, selectedStudentId, students]);

  const historyItems = useMemo(() => {
    if (!selectedStudentId) return [];
    return responses
      .filter((response) => response.studentId === selectedStudentId && response.submittedAt)
      .sort((left, right) => {
        const leftAt = left.submittedAt ? Date.parse(left.submittedAt) : 0;
        const rightAt = right.submittedAt ? Date.parse(right.submittedAt) : 0;
        return rightAt - leftAt;
      })
      .map((response) => ({
        lessonLabel: `${response.periodLabel}: ${response.unitName}`,
        summary:
          Object.entries(response.answers)
            .map(([label, value]) => `${label} ${value}`)
            .find((entry) => entry.trim()) ?? "記録なし",
        feedback: response.feedbackText || response.feedbackDraftText || "まだ返却前"
      }));
  }, [responses, selectedStudentId]);

  const returnStatusLabel = selectedResponse?.returnedAt
    ? "先生から返却が届いています。"
    : selectedResponse?.feedbackDraftText
      ? "先生が返却を準備しています。"
      : selectedResponse?.submittedAt
        ? "提出は完了しています。"
        : selectedResponse?.draftUpdatedAt
          ? "まだ下書きの状態です。"
          : "まだ入力していません。";

  return (
    <main className="student-shell">
      <section className="student-header">
        <div>
          <p className="eyebrow">Student</p>
          <h1>ふりかえり</h1>
        </div>
        <span className="badge">
          {selectedResponse?.returnedAt
            ? "返却あり"
            : submitted || (isCurrentLesson && selectedResponse?.submittedAt)
              ? "提出済み"
              : activeLesson
                ? "授業中"
                : "授業待ち"}
        </span>
      </section>

      <section className="student-flow">
        <article className="panel">
          <div className="panel-head">
            <h2>1. 出席番号をえらぶ</h2>
            <button
              className="chip-button"
              onClick={() => {
                setSelectedStudentId(null);
                setSelectedLessonId(activeLesson?.id ?? null);
                setShowHistory(false);
                setSubmitted(false);
              }}
              type="button"
            >
              えらびなおす
            </button>
          </div>
          <div className="number-grid">
            {students.map((student) => {
              const studentResponse = activeLesson
                ? responses.find(
                    (response) =>
                      response.lessonId === activeLesson.id && response.studentId === student.id
                  ) ?? null
                : null;
              const stateLabel = studentResponse?.submittedAt
                ? "提出"
                : studentResponse?.draftUpdatedAt
                  ? "下書き"
                  : "";
              const stateDescription = studentResponse?.submittedAt
                ? "提出済みです。"
                : studentResponse?.draftUpdatedAt
                  ? "続きから入力できます。"
                  : "";

              return (
                <button
                  key={student.id}
                  className={`number-card number-card-stack${
                    selectedStudentId === student.id ? " selected" : ""
                  }`}
                  onClick={() => {
                    setSelectedStudentId(student.id);
                    setShowHistory(false);
                    setSubmitted(false);
                  }}
                  type="button"
                >
                  <span>{String(student.attendanceNumber).padStart(2, "0")}</span>
                  {stateLabel ? <span className="number-state">{stateLabel}</span> : null}
                  {stateDescription ? <span className="number-subtle">{stateDescription}</span> : null}
                </button>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>2. 時間をえらぶ</h2>
            <span className="badge">{selectedLesson ? "選択できます" : "授業が未開始"}</span>
          </div>
          {lessonOptions.length ? (
            <div className="period-list">
              {lessonOptions.map((period) => (
                <button
                  key={period.id}
                  className={`period-card period-card-button${
                    selectedLessonId === period.id ? " current" : ""
                  }`}
                  onClick={() => {
                    setSelectedLessonId(period.id);
                    setShowHistory(!period.isCurrent);
                  }}
                  type="button"
                >
                  <span className="mini-title">{period.label}</span>
                  <span className="subtle">{period.unitName}</span>
                  <span className="number-subtle">
                    {period.isCurrent ? "いまの授業" : "これまでの記録"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="detail-card">
              <p className="subtle">先生画面で授業開始すると、ここに本時が出ます。</p>
            </div>
          )}
        </article>

        <article className="split-stage">
          <div className="panel">
            <div className="panel-head">
              <h2>みんなの記録</h2>
              <span className="badge">
                {isCurrentLesson ? (timelineItems.length ? "更新あり" : "まだ少ない") : "この画面では非表示"}
              </span>
            </div>
            <div className="timeline">
              {isCurrentLesson && timelineCards.length ? (
                <div className="timeline-card-grid">
                  {timelineCards.map((item) => (
                    <div key={item.id} className="detail-card timeline-card">
                      <p className="mini-title">{item.studentLabel}</p>
                      <p className="subtle">{item.fieldLabel}</p>
                      <p>{item.summary}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {isCurrentLesson && timelineItems.length ? (
                timelineItems.map((item, index) => (
                  <p key={`${item}-${index}`} className="timeline-item">
                    {item}
                  </p>
                ))
              ) : !isCurrentLesson ? (
                <p className="subtle">これまでの記録を見ている間は、みんなの記録は固定しません。</p>
              ) : (
                <p className="subtle">まだ他の児童の記録がありません。</p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{showHistory ? "これまで" : "自分の入力"}</h2>
              <button className="chip-button" onClick={() => setShowHistory((current) => !current)} type="button">
                {showHistory ? "入力へ戻る" : "これまで"}
              </button>
            </div>

            {showHistory ? (
              <div className="table-like">
                {historyItems.length ? (
                  historyItems.map((entry) => (
                    <div key={entry.lessonLabel} className="detail-card">
                      <p className="mini-title">{entry.lessonLabel}</p>
                      <p className="subtle">{entry.summary}</p>
                      <p className="subtle">先生: {entry.feedback}</p>
                    </div>
                  ))
                ) : (
                  <div className="detail-card">
                    <p className="subtle">まだ過去の記録がありません。</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="form-stack">
                <div className="detail-card">
                  <p className="mini-title">
                    {selectedStudent
                      ? `${String(selectedStudent.attendanceNumber).padStart(2, "0")} ${selectedStudent.displayName}`
                      : "まだ出席番号が選ばれていません"}
                  </p>
                  <p className="subtle">選択した授業: {selectedLesson?.unitName ?? "未選択"}</p>
                  <p className="subtle">
                    状態:{" "}
                    {selectedResponse?.returnedAt
                      ? "返却あり"
                      : selectedResponse?.submittedAt
                        ? "提出済み"
                        : selectedResponse?.draftUpdatedAt
                          ? "下書きあり"
                        : "未入力"}
                  </p>
                  <p className="subtle">{returnStatusLabel}</p>
                </div>
                {lessonFields.length ? (
                  lessonFields.map((label) => (
                    <label key={label} className="field">
                      <span className="field-label">{label}</span>
                      <textarea
                        className="text-area"
                        disabled={!isCurrentLesson || !selectedStudentId}
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [label]: event.target.value
                          }))
                        }
                        value={answers[label] ?? ""}
                      />
                    </label>
                  ))
                ) : (
                  <div className="detail-card">
                    <p className="subtle">この時間の記録はまだありません。</p>
                  </div>
                )}
                <div className="ai-box">
                  <p className="mini-title">先生からの返却</p>
                  <p className="subtle">
                    {selectedResponse?.feedbackText ||
                      selectedResponse?.feedbackDraftText ||
                      "まだ返却前です。先生が返却するとここに反映されます。"}
                  </p>
                </div>
                <div className="detail-card return-card">
                  <div className="panel-head">
                    <h3>返却確認</h3>
                    <span className="badge">
                      {selectedResponse?.returnedAt
                        ? "確認できます"
                        : selectedResponse?.feedbackDraftText
                          ? "準備中"
                          : "まだありません"}
                    </span>
                  </div>
                  <p className="subtle">{returnStatusLabel}</p>
                  <p>
                    {selectedResponse?.feedbackText ||
                      (selectedResponse?.feedbackDraftText
                        ? "先生が返却文を整えています。"
                        : "提出後に先生からの返却がここに出ます。")}
                  </p>
                </div>
                {selectedResponse?.returnedAt ? (
                  <div className="detail-card">
                    <p className="mini-title">返却を確認できました</p>
                    <p className="subtle">先生からのコメントを見直して、次の時間のめあてにつなげます。</p>
                  </div>
                ) : null}
                {draftSaved ? <p className="subtle">下書きを保存しました。</p> : null}
                {isCurrentLesson ? (
                  <div className="button-row">
                    <button
                      className="button button-muted"
                      disabled={!selectedStudentId || !activeLesson}
                      onClick={() => {
                        if (!selectedStudentId) return;
                        saveDraftResponse({
                          studentId: selectedStudentId,
                          answers
                        });
                        setDraftSaved(true);
                      }}
                      type="button"
                    >
                      下書き保存
                    </button>
                    <button
                      className="button button-primary"
                      disabled={!selectedStudentId || !activeLesson}
                      onClick={() => {
                        if (!selectedStudentId) return;
                        submitResponse({
                          studentId: selectedStudentId,
                          answers
                        });
                        setSubmitted(true);
                        setDraftSaved(false);
                      }}
                      type="button"
                    >
                      提出する
                    </button>
                  </div>
                ) : (
                  <div className="detail-card">
                    <p className="subtle">これまでの記録は閲覧のみです。現在の授業を選ぶと入力に戻れます。</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
