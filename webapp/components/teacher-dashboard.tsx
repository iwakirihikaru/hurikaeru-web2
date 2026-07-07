"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";

type TabKey = "lesson" | "units" | "roster" | "records" | "setup";
type MonitorFilterKey = "all" | "needs-feedback" | "drafting" | "returned";
type RecordScopeKey = "lesson" | "unit";

const tabs: { key: TabKey; label: string }[] = [
  { key: "lesson", label: "授業スタート" },
  { key: "units", label: "単元設定" },
  { key: "roster", label: "名簿" },
  { key: "records", label: "記録" },
  { key: "setup", label: "設定" }
];

const monitorFilters: { key: MonitorFilterKey; label: string }[] = [
  { key: "all", label: "全員" },
  { key: "needs-feedback", label: "未返却" },
  { key: "drafting", label: "下書き中" },
  { key: "returned", label: "返却済み" }
];

const recordScopes: { key: RecordScopeKey; label: string }[] = [
  { key: "lesson", label: "この時間" },
  { key: "unit", label: "単元全体" }
];

function statusLabel(status: "active" | "ready" | "draft") {
  if (status === "active") return "授業中";
  if (status === "ready") return "準備中";
  return "下書き";
}

function parsePeriodSortValue(periodLabel: string) {
  const match = periodLabel.match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function incrementPeriodLabel(periodLabel: string) {
  const match = periodLabel.match(/(\d+)/);
  if (!match) return periodLabel;
  const current = Number(match[1]);
  return periodLabel.replace(match[1], String(current + 1));
}

function latestResponseTimestamp(response: {
  submittedAt: string | null;
  draftUpdatedAt: string | null;
  returnedAt: string | null;
  feedbackDraftUpdatedAt: string | null;
}) {
  return Math.max(
    response.submittedAt ? Date.parse(response.submittedAt) : 0,
    response.draftUpdatedAt ? Date.parse(response.draftUpdatedAt) : 0,
    response.returnedAt ? Date.parse(response.returnedAt) : 0,
    response.feedbackDraftUpdatedAt ? Date.parse(response.feedbackDraftUpdatedAt) : 0
  );
}

function monitorPriority(state: string) {
  if (state === "返却下書き") return 0;
  if (state === "提出済み") return 1;
  if (state === "下書き中") return 2;
  if (state === "未着手") return 3;
  return 4;
}

function monitorStateClass(state: string) {
  if (state === "返却下書き") return "feedback-draft";
  if (state === "提出済み") return "submitted";
  if (state === "下書き中") return "draft";
  if (state === "返却済み") return "returned";
  return "idle";
}

function storeKindLabel(storeKind: "local-demo" | "supabase" | "gas") {
  if (storeKind === "supabase") return "Supabase";
  if (storeKind === "gas") return "GAS";
  return "ローカルデモ";
}

export function TeacherDashboard() {
  const {
    profile,
    units,
    students,
    activeLesson,
    responses,
    storeKind,
    lastError,
    startLesson,
    endLesson,
    saveFeedback,
    saveFeedbackDraft,
    updateProfile,
    addUnit,
    removeUnit,
    addStudent,
    removeStudent,
    bulkUpsertStudents,
    updateActiveLessonFields,
    resetDemoState
  } = useAppState();
  const [activeTab, setActiveTab] = useState<TabKey>("lesson");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("st-8");
  const [draftFeedback, setDraftFeedback] = useState<string>("");
  const [newUnitSubject, setNewUnitSubject] = useState("算数");
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitPeriod, setNewUnitPeriod] = useState("6時間目");
  const [newUnitFields, setNewUnitFields] = useState("わかったこと\nまだ迷っていること\n次に試したいこと");
  const [newStudentNumber, setNewStudentNumber] = useState("41");
  const [newStudentName, setNewStudentName] = useState("");
  const [bulkRosterText, setBulkRosterText] = useState("1 山田\n2 佐藤\n3 鈴木");
  const [profileTeacherName, setProfileTeacherName] = useState(profile.teacherName);
  const [profileSchoolName, setProfileSchoolName] = useState(profile.schoolName);
  const [profileGrade, setProfileGrade] = useState(profile.grade);
  const [profileClassName, setProfileClassName] = useState(profile.className);
  const [lessonOnlyFields, setLessonOnlyFields] = useState("");
  const [recordStudentId, setRecordStudentId] = useState<string>("st-8");
  const [recordUnitFilter, setRecordUnitFilter] = useState<string>("all");
  const [monitorFilter, setMonitorFilter] = useState<MonitorFilterKey>("needs-feedback");
  const [recordScope, setRecordScope] = useState<RecordScopeKey>("lesson");
  const [unitDraftSourceId, setUnitDraftSourceId] = useState<string>("blank");

  const lessonResponses = useMemo(
    () =>
      activeLesson
        ? responses.filter((response) => response.lessonId === activeLesson.id)
        : [],
    [activeLesson, responses]
  );

  const responseRows = lessonResponses
    .map((response) => {
      const student = students.find((entry) => entry.id === response.studentId);
      if (!student) return null;
      return {
        student,
        response
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const currentUnitName = activeLesson?.unitName ?? null;
  const scopedResponses = useMemo(() => {
    if (recordScope === "lesson") {
      return lessonResponses;
    }
    if (recordUnitFilter !== "all") {
      return responses.filter((response) => response.unitName === recordUnitFilter);
    }
    if (currentUnitName) {
      return responses.filter((response) => response.unitName === currentUnitName);
    }
    return responses;
  }, [currentUnitName, lessonResponses, recordScope, recordUnitFilter, responses]);

  const scopedResponseRows = useMemo(() => {
    return scopedResponses
      .map((response) => {
        const student = students.find((entry) => entry.id === response.studentId);
        if (!student) return null;
        return { student, response };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [scopedResponses, students]);

  const scopedResponseSnippets = useMemo(() => {
    return scopedResponseRows
      .flatMap((row) => Object.values(row.response.answers))
      .map((value) => value.trim())
      .filter(Boolean);
  }, [scopedResponseRows]);

  const scopedReportLines = useMemo(() => {
    return scopedResponseRows
      .flatMap((row) =>
        Object.entries(row.response.answers).map(
          ([label, value]) =>
            `${row.response.periodLabel} / ${String(row.student.attendanceNumber).padStart(2, "0")} ${row.student.displayName} / ${label}: ${value}`
        )
      )
      .slice(0, recordScope === "lesson" ? 8 : 12);
  }, [recordScope, scopedResponseRows]);

  const sortedUnits = useMemo(() => {
    return [...units].sort((left, right) => {
      const leftActive = activeLesson?.unitId === left.id ? 1 : 0;
      const rightActive = activeLesson?.unitId === right.id ? 1 : 0;
      if (leftActive !== rightActive) return rightActive - leftActive;

      const leftRecent = responses
        .filter((response) => response.unitName === left.name)
        .reduce((max, response) => Math.max(max, latestResponseTimestamp(response)), 0);
      const rightRecent = responses
        .filter((response) => response.unitName === right.name)
        .reduce((max, response) => Math.max(max, latestResponseTimestamp(response)), 0);
      if (leftRecent !== rightRecent) return rightRecent - leftRecent;

      const statusOrder = { active: 0, ready: 1, draft: 2 } as const;
      const statusGap = statusOrder[left.status] - statusOrder[right.status];
      if (statusGap !== 0) return statusGap;

      const periodGap = parsePeriodSortValue(left.periodLabel) - parsePeriodSortValue(right.periodLabel);
      if (periodGap !== 0) return periodGap;

      return left.name.localeCompare(right.name, "ja");
    });
  }, [activeLesson?.unitId, responses, units]);

  const rosterRows = useMemo(() => {
    return students
      .map((student) => {
        const response =
          activeLesson
            ? responses.find(
                (entry) => entry.lessonId === activeLesson.id && entry.studentId === student.id
              ) ?? null
            : null;

        let state = "未着手";
        if (response?.returnedAt) {
          state = "返却済み";
        } else if (response?.feedbackDraftText?.trim()) {
          state = "返却下書き";
        } else if (response?.submittedAt) {
          state = "提出済み";
        } else if (response?.draftUpdatedAt) {
          state = "下書き中";
        }

        return {
          student,
          response,
          state,
          priority: monitorPriority(state),
          lastTouchedAt: response ? latestResponseTimestamp(response) : 0
        };
      })
      .sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority;
        if (left.lastTouchedAt !== right.lastTouchedAt) return right.lastTouchedAt - left.lastTouchedAt;
        return left.student.attendanceNumber - right.student.attendanceNumber;
      });
  }, [activeLesson, responses, students]);

  const draftCount = rosterRows.filter((row) => row.state === "下書き中").length;
  const submittedCount = rosterRows.filter((row) => row.state === "提出済み").length;
  const feedbackDraftCount = rosterRows.filter((row) => row.state === "返却下書き").length;
  const returnedCount = rosterRows.filter((row) => row.state === "返却済み").length;
  const pendingFeedbackCount = submittedCount + feedbackDraftCount;
  const lessonProgressLabel =
    students.length > 0
      ? `${submittedCount + feedbackDraftCount + returnedCount} / ${students.length}`
      : "0 / 0";

  const filteredRosterRows = useMemo(() => {
    return rosterRows.filter((row) => {
      if (monitorFilter === "all") return true;
      if (monitorFilter === "needs-feedback") {
        return row.state === "提出済み" || row.state === "返却下書き";
      }
      if (monitorFilter === "drafting") {
        return row.state === "下書き中" || row.state === "未着手";
      }
      return row.state === "返却済み";
    });
  }, [monitorFilter, rosterRows]);

  const selectedRow =
    filteredRosterRows.find((row) => row.student.id === selectedStudentId) ??
    rosterRows.find((row) => row.student.id === selectedStudentId) ??
    filteredRosterRows[0] ??
    rosterRows[0] ??
    null;

  const selectedRowIndex = selectedRow
    ? filteredRosterRows.findIndex((row) => row.student.id === selectedRow.student.id)
    : -1;
  const previousRow = selectedRowIndex > 0 ? filteredRosterRows[selectedRowIndex - 1] : null;
  const nextRow =
    selectedRowIndex >= 0 && selectedRowIndex < filteredRosterRows.length - 1
      ? filteredRosterRows[selectedRowIndex + 1]
      : null;

  const recordStudent = students.find((student) => student.id === recordStudentId) ?? students[0] ?? null;
  const recordHistory = recordStudent
    ? responses
        .filter(
          (response) =>
            response.studentId === recordStudent.id &&
            (recordUnitFilter === "all" || response.unitName === recordUnitFilter)
        )
        .sort((left, right) => {
          const leftAt = latestResponseTimestamp(left);
          const rightAt = latestResponseTimestamp(right);
          return rightAt - leftAt;
        })
    : [];

  const recordUnitOptions = useMemo(() => {
    const names = Array.from(new Set(responses.map((response) => response.unitName)));
    return names.sort((left, right) => left.localeCompare(right, "ja"));
  }, [responses]);

  const scopedRecordSummary = useMemo(() => {
    return {
      lessons: new Set(scopedResponses.map((response) => response.lessonId)).size,
      submitted: scopedResponses.filter((response) => response.submittedAt).length,
      returned: scopedResponses.filter((response) => response.returnedAt).length,
      feedbackDrafts: scopedResponses.filter((response) => response.feedbackDraftText?.trim()).length
    };
  }, [scopedResponses]);

  const recordScopeLabel =
    recordScope === "lesson"
      ? activeLesson
        ? `${activeLesson.periodLabel} / ${activeLesson.unitName}`
        : "授業未開始"
      : recordUnitFilter !== "all"
        ? recordUnitFilter
        : currentUnitName ?? "全単元";

  const setupStatusItems = useMemo(() => {
    const hasProfile = Boolean(
      profile.teacherName.trim() &&
        profile.schoolName.trim() &&
        profile.grade.trim() &&
        profile.className.trim()
    );
    const hasRoster = students.length > 0;
    const hasUnits = units.length > 0;
    const hasActiveLesson = Boolean(activeLesson);

    return [
      {
        id: "profile",
        label: "先生情報",
        done: hasProfile,
        note: hasProfile ? "授業で使う表示名が入っています。" : "先生名、学校名、学年、組を入れます。"
      },
      {
        id: "roster",
        label: "名簿",
        done: hasRoster,
        note: hasRoster ? `${students.length}人登録済みです。` : "出席番号と名前を入れます。"
      },
      {
        id: "units",
        label: "単元設定",
        done: hasUnits,
        note: hasUnits ? `${units.length}件登録済みです。` : "授業で使う単元と項目を作ります。"
      },
      {
        id: "lesson",
        label: "授業スタート",
        done: hasActiveLesson,
        note: hasActiveLesson
          ? `${activeLesson?.periodLabel} ${activeLesson?.unitName} を開いています。`
          : "授業開始すると、モニタと返却が使えます。"
      }
    ];
  }, [activeLesson, profile.className, profile.grade, profile.schoolName, profile.teacherName, students.length, units.length]);

  const nextSetupAction = !setupStatusItems[0].done
    ? "先生情報を保存"
    : !setupStatusItems[1].done
      ? "名簿を入れる"
      : !setupStatusItems[2].done
        ? "単元を作る"
        : !setupStatusItems[3].done
          ? "授業を開始する"
          : "授業中の返却へ進む";

  const selectedUnitDraftSource =
    unitDraftSourceId === "blank"
      ? null
      : sortedUnits.find((unit) => unit.id === unitDraftSourceId) ?? null;

  useEffect(() => {
    setDraftFeedback(
      selectedRow?.response?.returnedAt
        ? selectedRow.response.feedbackText
        : selectedRow?.response?.feedbackDraftText ?? selectedRow?.response?.feedbackText ?? ""
    );
  }, [
    selectedRow?.response?.feedbackDraftText,
    selectedRow?.response?.feedbackText,
    selectedRow?.response?.returnedAt,
    selectedRow?.student.id
  ]);

  useEffect(() => {
    setProfileTeacherName(profile.teacherName);
    setProfileSchoolName(profile.schoolName);
    setProfileGrade(profile.grade);
    setProfileClassName(profile.className);
  }, [profile]);

  useEffect(() => {
    setLessonOnlyFields(activeLesson?.fields.join("\n") ?? "");
  }, [activeLesson?.id, activeLesson?.fields]);

  function applyFeedback() {
    if (!selectedRow) return;
    saveFeedback(selectedRow.student.id, draftFeedback);
  }

  function moveToStudent(studentId: string | null) {
    if (!studentId) return;
    setSelectedStudentId(studentId);
  }

  function jumpToPrimaryLessonAction() {
    if (activeLesson) {
      setActiveTab("lesson");
      return;
    }
    startLesson(sortedUnits[0]?.id ?? units[0]?.id ?? "u1");
  }

  function createUnit() {
    if (!newUnitName.trim()) return;
    const parsedFields = newUnitFields
      .split(/\r?\n/)
      .map((field) => field.trim())
      .filter(Boolean);
    addUnit({
      subject: newUnitSubject.trim() || "算数",
      name: newUnitName.trim(),
      periodLabel: newUnitPeriod.trim() || "6時間目",
      fields: parsedFields.length
        ? parsedFields
        : ["わかったこと", "まだ迷っていること", "次に試したいこと"]
    });
    setNewUnitName("");
  }

  function applyUnitTemplate(unitId: string) {
    const source = sortedUnits.find((unit) => unit.id === unitId);
    if (!source) return;
    setUnitDraftSourceId(source.id);
    setNewUnitSubject(source.subject);
    setNewUnitName(`${source.name}（コピー）`);
    setNewUnitPeriod(incrementPeriodLabel(source.periodLabel));
    setNewUnitFields(source.fields.join("\n"));
  }

  function resetUnitDraft() {
    setUnitDraftSourceId("blank");
    setNewUnitSubject("算数");
    setNewUnitName("");
    setNewUnitPeriod("6時間目");
    setNewUnitFields("わかったこと\nまだ迷っていること\n次に試したいこと");
  }

  function createStudent() {
    const attendanceNumber = Number(newStudentNumber);
    if (!Number.isFinite(attendanceNumber) || attendanceNumber <= 0 || !newStudentName.trim()) {
      return;
    }
    addStudent({
      attendanceNumber,
      displayName: newStudentName.trim()
    });
    setNewStudentNumber(String(attendanceNumber + 1));
    setNewStudentName("");
  }

  function importRoster() {
    const parsed = bulkRosterText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)[\s,、，]+(.+)$/);
        if (!match) return null;
        return {
          attendanceNumber: Number(match[1]),
          displayName: match[2].trim()
        };
      })
      .filter(
        (row): row is { attendanceNumber: number; displayName: string } =>
          Boolean(row?.attendanceNumber) && Boolean(row?.displayName)
      );

    if (!parsed.length) return;
    bulkUpsertStudents(parsed);
  }

  function saveProfile() {
    updateProfile({
      teacherName: profileTeacherName.trim() || profile.teacherName,
      schoolName: profileSchoolName.trim() || profile.schoolName,
      grade: profileGrade.trim() || profile.grade,
      className: profileClassName.trim() || profile.className
    });
  }

  function saveLessonOnlyFields() {
    const parsedFields = lessonOnlyFields
      .split(/\r?\n/)
      .map((field) => field.trim())
      .filter(Boolean);
    if (!parsedFields.length) return;
    updateActiveLessonFields(parsedFields);
  }

  return (
    <main className="screen">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="brand-kicker">Teacher</p>
          <h1>先生画面</h1>
        </div>
        <nav className="nav-stack">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`nav-item nav-button${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="content">
        <header className="content-header">
          <div>
            <p className="eyebrow">配布版 Web/PWA MVP</p>
            <h2>{tabs.find((tab) => tab.key === activeTab)?.label}</h2>
            <p className="subtle">
              {profile.schoolName} / {profile.grade}年{profile.className}組 / {profile.teacherName}
            </p>
            <p className="subtle">保存先: {storeKindLabel(storeKind)}</p>
            <div className="header-summary-grid">
              <div className="detail-card compact-header-card">
                <p className="mini-title">いまの授業</p>
                <p className="subtle">
                  {activeLesson
                    ? `${activeLesson.periodLabel} / ${activeLesson.unitName}`
                    : "まだ開始していません"}
                </p>
              </div>
              <div className="detail-card compact-header-card">
                <p className="mini-title">提出の進み具合</p>
                <p className="subtle">{lessonProgressLabel}</p>
              </div>
              <div className="detail-card compact-header-card">
                <p className="mini-title">未返却</p>
                <p className="subtle">{pendingFeedbackCount}人</p>
              </div>
            </div>
          </div>
          <div className="header-actions">
            <button className="button button-muted" onClick={() => setActiveTab("units")} type="button">
              単元設定へ
            </button>
            <button
              className="button button-primary"
              onClick={jumpToPrimaryLessonAction}
              type="button"
            >
              {activeLesson ? "授業スタートを開く" : "授業開始"}
            </button>
            <button className="button button-outline" onClick={() => setActiveTab("records")} type="button">
              記録を見る
            </button>
          </div>
        </header>

        {lastError ? (
          <section className="panel">
            <div className="panel-head">
              <h3>確認が必要です</h3>
              <span className="badge">要確認</span>
            </div>
            <p className="subtle">{lastError}</p>
          </section>
        ) : null}

        {activeTab === "lesson" ? (
          <>
            <section className="panel">
              <div className="panel-head">
                <h3>本時の候補</h3>
                <span className="badge">{activeLesson ? "1件実行中" : "授業待ち"}</span>
              </div>
              <div className="unit-list">
                {sortedUnits.map((unit) => (
                  <article key={unit.id} className="unit-card">
                    <div>
                      <p className="mini-title">
                        {unit.subject} / {unit.name}
                      </p>
                      <p className="subtle">
                        {unit.periodLabel} / 状態: {statusLabel(unit.status)}
                      </p>
                      <p className="subtle">
                        {activeLesson?.unitId === unit.id
                          ? "現在の授業です。"
                          : responses.some((response) => response.unitName === unit.name)
                            ? "最近の記録があります。"
                            : "まだ記録はありません。"}
                      </p>
                    </div>
                    <button className="chip-button" onClick={() => startLesson(unit.id)} type="button">
                      {activeLesson?.unitId === unit.id ? "授業中" : "この授業にする"}
                    </button>
                  </article>
                ))}
              </div>
              <div className="detail-card">
                <p className="mini-title">現在の授業</p>
                <p className="subtle">
                  {activeLesson
                    ? `${activeLesson.periodLabel} / ${activeLesson.unitName}`
                    : "まだ開始されていません"}
                </p>
              </div>
              <div className="report-grid">
                <div className="detail-card">
                  <p className="mini-title">下書き</p>
                  <p className="subtle">{draftCount}人</p>
                </div>
                <div className="detail-card">
                  <p className="mini-title">提出</p>
                  <p className="subtle">{submittedCount}人</p>
                </div>
                <div className="detail-card">
                  <p className="mini-title">返却下書き</p>
                  <p className="subtle">{feedbackDraftCount}人</p>
                </div>
                <div className="detail-card">
                  <p className="mini-title">返却</p>
                  <p className="subtle">{returnedCount}人</p>
                </div>
              </div>
              <div className="button-row">
                <button className="button button-outline" onClick={saveLessonOnlyFields} type="button">
                  この時間だけ項目を保存
                </button>
                <button className="button button-outline" onClick={() => setActiveTab("records")} type="button">
                  この時間の振り返りレポート
                </button>
                <button className="button button-danger" onClick={endLesson} type="button">
                  授業終了
                </button>
              </div>
            </section>

            <section className="split-stage">
              <div className="panel">
                <div className="panel-head">
                  <h3>授業中モニタ</h3>
                  <span className="badge">{activeLesson ? "未返却優先" : "授業待ち"}</span>
                </div>
                <div className="detail-card">
                  <p className="mini-title">優先して見る順</p>
                  <p className="subtle">
                    返却下書き {"->"} 提出済み {"->"} 下書き中 {"->"} 未着手 {"->"} 返却済み の順に並べています。
                  </p>
                </div>
                <div className="monitor-filter-row">
                  {monitorFilters.map((filter) => (
                    <button
                      key={filter.key}
                      className={`chip-button${monitorFilter === filter.key ? " active-chip" : ""}`}
                      onClick={() => setMonitorFilter(filter.key)}
                      type="button"
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <div className="table-like">
                  {filteredRosterRows.map(({ student, response, state }) => (
                    <button
                      key={student.id}
                      className={`table-row selectable-row monitor-row monitor-${monitorStateClass(state)}${
                        selectedStudentId === student.id ? " selected-row" : ""
                      }`}
                      onClick={() => {
                        setSelectedStudentId(student.id);
                        setDraftFeedback(
                          response?.returnedAt
                            ? response.feedbackText
                            : response?.feedbackDraftText ?? response?.feedbackText ?? ""
                        );
                      }}
                      type="button"
                    >
                      <div className="student-cell">
                        <span className="student-no">
                          {String(student.attendanceNumber).padStart(2, "0")}
                        </span>
                        <div>
                          <p className="mini-title">{student.displayName}</p>
                          <p className="subtle">{state}</p>
                          <p className="subtle">
                            {state === "返却下書き"
                              ? "返却文を確認して返す段階です。"
                              : state === "提出済み"
                                ? "未返却の提出があります。"
                                : state === "下書き中"
                                  ? "まだ提出前の入力があります。"
                                  : state === "返却済み"
                                    ? "返却完了です。"
                                    : "まだ入力がありません。"}
                          </p>
                        </div>
                      </div>
                      <span className={`status-pill inline-state${state !== "未着手" ? " done" : ""}`}>
                        {state}
                      </span>
                    </button>
                  ))}
                  {!filteredRosterRows.length ? (
                    <div className="detail-card">
                      <p className="subtle">この条件に合う児童はいません。</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h3>この時間だけ項目を編集</h3>
                  <span className="badge">授業ごとに上書き</span>
                </div>
                <textarea
                  className="text-area compact-text-area"
                  onChange={(event) => setLessonOnlyFields(event.target.value)}
                  value={lessonOnlyFields}
                />
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h3>個別返却</h3>
                  <span className="badge">手書き欄は後で画像対応</span>
                </div>
                {selectedRow ? (
                  <div className="detail-stack">
                    <div className="button-row">
                      <button
                        className="button button-muted"
                        disabled={!previousRow}
                        onClick={() => moveToStudent(previousRow?.student.id ?? null)}
                        type="button"
                      >
                        前の児童
                      </button>
                      <button
                        className="button button-muted"
                        disabled={!nextRow}
                        onClick={() => moveToStudent(nextRow?.student.id ?? null)}
                        type="button"
                      >
                        次の児童
                      </button>
                    </div>
                    <div className="detail-card">
                      <p className="mini-title">
                        {String(selectedRow.student.attendanceNumber).padStart(2, "0")}{" "}
                        {selectedRow.student.displayName}
                      </p>
                      <p className="subtle">状態: {selectedRow.state}</p>
                      <p className="subtle">
                        表示順 {selectedRowIndex + 1} / {filteredRosterRows.length}
                      </p>
                      {selectedRow.response?.feedbackDraftText?.trim() ? (
                        <p className="subtle">
                          返却下書き: {selectedRow.response.returnedAt ? "返却済み" : "保存中"}
                        </p>
                      ) : null}
                      {selectedRow.response ? (
                        Object.entries(
                          Object.keys(selectedRow.response.answers).length
                            ? selectedRow.response.answers
                            : selectedRow.response.draftAnswers
                        ).map(([label, value]) => (
                          <p key={label} className="subtle">
                            {label}: {value}
                          </p>
                        ))
                      ) : (
                        <p className="subtle">まだ入力がありません。</p>
                      )}
                    </div>
                    <label className="field">
                      <span className="field-label">返却コメント</span>
                      <textarea
                        className="text-area"
                        onChange={(event) => setDraftFeedback(event.target.value)}
                        value={draftFeedback}
                      />
                    </label>
                    <div className="ai-box">
                      <p className="mini-title">下書き保存の考え方</p>
                      <p className="subtle">
                        Web版では手書き入力中に勝手保存で文字が消える事故を避け、保存は明示ボタン中心に寄せる。
                      </p>
                    </div>
                    <div className="button-row">
                      <button
                        className="button button-muted"
                        disabled={!selectedRow.response?.submittedAt}
                        onClick={() => saveFeedbackDraft(selectedRow.student.id, draftFeedback)}
                        type="button"
                      >
                        下書き保存
                      </button>
                      <button
                        className="button button-primary"
                        disabled={!selectedRow.response?.submittedAt}
                        onClick={applyFeedback}
                        type="button"
                      >
                        返却する
                      </button>
                    </div>
                    <div className="detail-card">
                      <p className="mini-title">返却の進め方</p>
                      <p className="subtle">
                        未返却だけを表示して、下書き保存または返却後に次の児童へ進む使い方を想定しています。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="detail-card">
                    <p className="subtle">まだ提出がありません。</p>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "units" ? (
          <section className="panel split-panel">
            <div>
              <div className="panel-head">
                <h3>単元設定</h3>
                <span className="badge">{units.length}件</span>
              </div>
              <div className="detail-card">
                <p className="mini-title">作成のしかた</p>
                <p className="subtle">
                  まっさらな追加だけでなく、前回の単元を下敷きにして項目を流用できます。
                </p>
              </div>
              <div className="inline-form compact-unit-template">
                <label className="field compact-field compact-span">
                  <span className="field-label">下敷きにする単元</span>
                  <select
                    className="text-input"
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setUnitDraftSourceId(nextId);
                      if (nextId === "blank") {
                        resetUnitDraft();
                        return;
                      }
                      applyUnitTemplate(nextId);
                    }}
                    value={unitDraftSourceId}
                  >
                    <option value="blank">まっさらから作る</option>
                    {sortedUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.subject} / {unit.name} / {unit.periodLabel}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="inline-form">
                <label className="field compact-field">
                  <span className="field-label">教科</span>
                  <input
                    className="text-input"
                    onChange={(event) => setNewUnitSubject(event.target.value)}
                    value={newUnitSubject}
                  />
                </label>
                <label className="field compact-field">
                  <span className="field-label">単元名</span>
                  <input
                    className="text-input"
                    onChange={(event) => setNewUnitName(event.target.value)}
                    value={newUnitName}
                  />
                </label>
                <label className="field compact-field">
                  <span className="field-label">時間</span>
                  <input
                    className="text-input"
                    onChange={(event) => setNewUnitPeriod(event.target.value)}
                    value={newUnitPeriod}
                  />
                </label>
                <label className="field compact-field compact-span">
                  <span className="field-label">項目</span>
                  <textarea
                    className="text-area compact-text-area"
                    onChange={(event) => setNewUnitFields(event.target.value)}
                    value={newUnitFields}
                  />
                </label>
                <button className="button button-primary compact-button" onClick={createUnit} type="button">
                  追加
                </button>
                <button className="button button-muted compact-button" onClick={resetUnitDraft} type="button">
                  入力を戻す
                </button>
              </div>
              <div className="table-like">
                {sortedUnits.map((unit) => (
                  <article key={unit.id} className="unit-card">
                    <div>
                      <p className="mini-title">{unit.name}</p>
                      <p className="subtle">
                        {unit.subject} / {unit.periodLabel}
                      </p>
                      <p className="subtle">項目: {unit.fields.join(" / ")}</p>
                      <p className="subtle">
                        {selectedUnitDraftSource?.id === unit.id ? "現在の下敷きです。" : "この単元を複製できます。"}
                      </p>
                    </div>
                    <div className="inline-actions">
                      <button className="chip-button" onClick={() => startLesson(unit.id)} type="button">
                        使う
                      </button>
                      <button className="chip-button" onClick={() => applyUnitTemplate(unit.id)} type="button">
                        複製して作る
                      </button>
                      <button
                        className="chip-button chip-danger"
                        onClick={() => removeUnit(unit.id)}
                        type="button"
                      >
                        削除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="placeholder-box">
              <p className="mini-title">項目設定プレビュー</p>
              <p className="subtle">
                {selectedUnitDraftSource
                  ? `${selectedUnitDraftSource.name} を下敷きに編集中`
                  : "まっさらな単元を編集中"}
              </p>
              <ul className="plain-list">
                {newUnitFields
                  .split(/\r?\n/)
                  .map((field) => field.trim())
                  .filter(Boolean)
                  .map((field) => (
                    <li key={field}>{field}</li>
                  ))}
              </ul>
            </div>
          </section>
        ) : null}

        {activeTab === "roster" ? (
          <section className="panel">
            <div className="panel-head">
              <h3>名簿</h3>
              <span className="badge">{students.length}人在籍</span>
            </div>
            <div className="split-panel">
              <div className="detail-card">
                <p className="mini-title">1人ずつ追加</p>
                <div className="inline-form compact-three">
                  <label className="field compact-field">
                    <span className="field-label">出席番号</span>
                    <input
                      className="text-input"
                      onChange={(event) => setNewStudentNumber(event.target.value)}
                      value={newStudentNumber}
                    />
                  </label>
                  <label className="field compact-field">
                    <span className="field-label">名前</span>
                    <input
                      className="text-input"
                      onChange={(event) => setNewStudentName(event.target.value)}
                      value={newStudentName}
                    />
                  </label>
                  <button
                    className="button button-primary compact-button"
                    onClick={createStudent}
                    type="button"
                  >
                    追加
                  </button>
                </div>
              </div>
              <div className="detail-card">
                <p className="mini-title">一括登録</p>
                <p className="subtle">`1 山田` のように1行ずつ貼り付けます。</p>
                <textarea
                  className="text-area compact-text-area"
                  onChange={(event) => setBulkRosterText(event.target.value)}
                  value={bulkRosterText}
                />
                <div className="button-row">
                  <button className="button button-primary" onClick={importRoster} type="button">
                    一括登録
                  </button>
                </div>
              </div>
            </div>
            <div className="roster-grid">
              {students.map((student) => (
                <div key={student.id} className="roster-card">
                  <span className="student-no">
                    {String(student.attendanceNumber).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="mini-title">{student.displayName}</p>
                    <p className="subtle">在籍</p>
                  </div>
                  <button
                    className="chip-button chip-danger"
                    onClick={() => removeStudent(student.id)}
                    type="button"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "records" ? (
          <section className="split-stage">
            <div className="panel">
              <div className="panel-head">
                <h3>この時間の振り返りレポート</h3>
                <button className="chip-button" type="button">
                  AI下書き
                </button>
              </div>
              <div className="monitor-filter-row">
                {recordScopes.map((scope) => (
                  <button
                    key={scope.key}
                    className={`chip-button${recordScope === scope.key ? " active-chip" : ""}`}
                    onClick={() => setRecordScope(scope.key)}
                    type="button"
                  >
                    {scope.label}
                  </button>
                ))}
              </div>
              <div className="inline-form compact-record-filter">
                <label className="field compact-field">
                  <span className="field-label">単元でしぼる</span>
                  <select
                    className="text-input"
                    onChange={(event) => setRecordUnitFilter(event.target.value)}
                    value={recordUnitFilter}
                  >
                    <option value="all">すべての単元</option>
                    {recordUnitOptions.map((unitName) => (
                      <option key={unitName} value={unitName}>
                        {unitName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="detail-card compact-inline-card">
                  <p className="mini-title">表示中の範囲</p>
                  <p className="subtle">{recordScopeLabel}</p>
                </div>
              </div>
              <div className="report-grid">
                <div className="detail-card">
                  <p className="mini-title">提出状況</p>
                  <p className="subtle">
                    提出 {scopedRecordSummary.submitted} / {students.length}, 返却下書き{" "}
                    {scopedRecordSummary.feedbackDrafts} / {scopedRecordSummary.submitted}, 返却済み{" "}
                    {scopedRecordSummary.returned} / {scopedRecordSummary.submitted}
                  </p>
                </div>
                <div className="detail-card">
                  <p className="mini-title">よく出た観点</p>
                  <p className="subtle">
                    {scopedResponseSnippets.slice(0, 3).join(" / ") ||
                      "まだ観点を集計できるほど提出がありません。"}
                  </p>
                </div>
                <div className="detail-card">
                  <p className="mini-title">次時へのメモ</p>
                  <p className="subtle">
                    {recordScope === "lesson"
                      ? activeLesson
                        ? `${activeLesson.fields.join(" / ")} を見ながら次時の説明を整える。`
                        : "授業開始後にメモを表示します。"
                      : "単元全体の記録を見ながら、次の時間で拾う観点を整理します。"}
                  </p>
                </div>
                <div className="detail-card">
                  <p className="mini-title">記録のたまり具合</p>
                  <p className="subtle">
                    {recordScopeLabel} / {scopedRecordSummary.lessons}回分 / 提出{" "}
                    {scopedRecordSummary.submitted}件 / 返却 {scopedRecordSummary.returned}件
                  </p>
                </div>
              </div>
              <div className="detail-card">
                <p className="mini-title">授業メモ</p>
                <div className="table-like">
                  {scopedReportLines.length ? (
                    scopedReportLines.map((line, index) => (
                      <p key={`${line}-${index}`} className="subtle">
                        {line}
                      </p>
                    ))
                  ) : (
                    <p className="subtle">まだ提出がありません。</p>
                  )}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>児童別ポートフォリオ</h3>
                <span className="badge">{recordStudent?.displayName ?? "未選択"}</span>
              </div>
              <div className="inline-form compact-record-panel">
                <label className="field compact-field">
                  <span className="field-label">児童</span>
                  <select
                    className="text-input"
                    onChange={(event) => setRecordStudentId(event.target.value)}
                    value={recordStudentId}
                  >
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {String(student.attendanceNumber).padStart(2, "0")} {student.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="detail-card compact-inline-card">
                  <p className="mini-title">表示範囲</p>
                  <p className="subtle">
                    {recordUnitFilter === "all" ? "全単元を表示中" : `${recordUnitFilter} のみ表示中`}
                  </p>
                </div>
              </div>
              <div className="table-like">
                {recordHistory.length ? (
                  recordHistory.map((response) => (
                    <div
                      key={`${response.lessonId}-${response.studentId}-${response.submittedAt ?? "draft"}`}
                      className="detail-card"
                    >
                      <p className="mini-title">
                        {response.periodLabel}: {response.unitName}
                      </p>
                      {Object.entries(
                        Object.keys(response.answers).length ? response.answers : response.draftAnswers
                      ).map(([label, value]) => (
                        <p key={label} className="subtle">
                          {label}: {value}
                        </p>
                      ))}
                      {response.feedbackDraftText?.trim() && !response.returnedAt ? (
                        <p className="subtle">返却下書き: {response.feedbackDraftText}</p>
                      ) : null}
                      <p className="subtle">返却: {response.feedbackText || "まだ返却前"}</p>
                    </div>
                  ))
                ) : (
                  <div className="detail-card">
                    <p className="subtle">この児童の記録はまだありません。</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "setup" ? (
          <section className="panel split-panel">
            <div>
              <div className="panel-head">
                <h3>設定と準備</h3>
                <span className="badge">授業前チェック</span>
              </div>
              <div className="detail-card">
                <p className="mini-title">次にやること</p>
                <p className="subtle">{nextSetupAction}</p>
                <div className="button-row">
                  <button className="button button-outline" onClick={() => setActiveTab("roster")} type="button">
                    名簿へ
                  </button>
                  <button className="button button-outline" onClick={() => setActiveTab("units")} type="button">
                    単元設定へ
                  </button>
                  <button className="button button-primary" onClick={() => setActiveTab("lesson")} type="button">
                    授業スタートへ
                  </button>
                </div>
              </div>
              <div className="detail-card">
                <p className="mini-title">先生情報</p>
                <div className="setup-form-grid">
                  <label className="field">
                    <span className="field-label">先生名</span>
                    <input
                      className="text-input"
                      onChange={(event) => setProfileTeacherName(event.target.value)}
                      value={profileTeacherName}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">学校名</span>
                    <input
                      className="text-input"
                      onChange={(event) => setProfileSchoolName(event.target.value)}
                      value={profileSchoolName}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">学年</span>
                    <input
                      className="text-input"
                      onChange={(event) => setProfileGrade(event.target.value)}
                      value={profileGrade}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">組</span>
                    <input
                      className="text-input"
                      onChange={(event) => setProfileClassName(event.target.value)}
                      value={profileClassName}
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button className="button button-primary" onClick={saveProfile} type="button">
                    先生情報を保存
                  </button>
                </div>
              </div>
              <div className="button-row">
                <button className="button button-muted" onClick={resetDemoState} type="button">
                  デモ状態を初期化
                </button>
              </div>
              <div className="table-like">
                {setupStatusItems.map((item) => (
                  <div key={item.id} className="table-row">
                    <div>
                      <p className="mini-title">{item.label}</p>
                      <p className="subtle">{item.note}</p>
                    </div>
                    <span className={`status-pill${item.done ? " done" : ""}`}>{item.done ? "完了" : "未完了"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="placeholder-box">
              <p className="mini-title">この画面でやること</p>
              <ul className="plain-list">
                <li>先生情報を整える</li>
                <li>授業前に名簿と単元の準備漏れを確認する</li>
                <li>必要ならデモ状態を戻して最初から試す</li>
              </ul>
              <div className="detail-card">
                <p className="mini-title">児童画面の見え方</p>
                <p className="subtle">授業前に児童画面を開いて、番号選択と返却確認の見え方を確認できます。</p>
                <div className="button-row">
                  <button
                    className="button button-muted"
                    onClick={() => {
                      window.location.href = "/student";
                    }}
                    type="button"
                  >
                    児童画面をひらく
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
