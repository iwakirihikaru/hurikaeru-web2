import { teacherStudents, teacherUnits } from "@/lib/mock-data";
import type {
  PersistedState,
  StudentCreatePayload,
  StudentDraftPayload,
  TeacherProfile,
  UnitCreatePayload
} from "@/lib/app-models";

export const STORAGE_KEY = "furikaeri-webapp-state-v1";

export const defaultProfile: TeacherProfile = {
  teacherName: "岩切 先生",
  schoolName: "サンプル小学校",
  grade: "4",
  className: "1"
};

function buildInitialStudents() {
  return Array.from({ length: 40 }, (_, index) => {
    const base = teacherStudents.find((student) => student.attendanceNumber === index + 1);
    return {
      id: `st-${index + 1}`,
      attendanceNumber: index + 1,
      displayName: base?.displayName ?? `児童${String(index + 1).padStart(2, "0")}`,
      active: true
    };
  });
}

export function createInitialState(): PersistedState {
  return {
    signedIn: false,
    profile: defaultProfile,
    units: teacherUnits,
    students: buildInitialStudents(),
    activeLesson: {
      id: "lesson-u1",
      unitId: "u1",
      unitName: "わり算の筆算",
      periodLabel: "3時間目",
      fields: ["わかったこと", "まだ迷っていること", "次に試したいこと"],
      startedAt: new Date().toISOString()
    },
    responses: [
      {
        lessonId: "lesson-u1",
        studentId: "st-8",
        unitName: "わり算の筆算",
        periodLabel: "3時間目",
        draftAnswers: {
          "わかったこと": "筆算では位をそろえると見やすい。",
          "まだ迷っていること": "あまりの書き方がまだ少し不安。",
          "次に試したいこと": "図と式をつなげて説明したい。"
        },
        draftUpdatedAt: new Date().toISOString(),
        answers: {
          "わかったこと": "筆算では位をそろえると見やすい。",
          "まだ迷っていること": "あまりの書き方がまだ少し不安。",
          "次に試したいこと": "図と式をつなげて説明したい。"
        },
        submittedAt: new Date().toISOString(),
        feedbackDraftText: "",
        feedbackDraftUpdatedAt: null,
        feedbackText: "",
        returnedAt: null
      },
      {
        lessonId: "lesson-u1",
        studentId: "st-17",
        unitName: "わり算の筆算",
        periodLabel: "3時間目",
        draftAnswers: {
          "わかったこと": "図を使うと、あまりの意味が分かりやすかった。",
          "まだ迷っていること": "式に言葉をそえるところを増やしたい。",
          "次に試したいこと": "友だちの考えと自分の考えを比べたい。"
        },
        draftUpdatedAt: new Date().toISOString(),
        answers: {
          "わかったこと": "図を使うと、あまりの意味が分かりやすかった。",
          "まだ迷っていること": "式に言葉をそえるところを増やしたい。",
          "次に試したいこと": "友だちの考えと自分の考えを比べたい。"
        },
        submittedAt: new Date().toISOString(),
        feedbackDraftText: "図で考えたところが良いです。",
        feedbackDraftUpdatedAt: new Date().toISOString(),
        feedbackText: "図で考えたところが良いです。",
        returnedAt: new Date().toISOString()
      },
      {
        lessonId: "lesson-u1",
        studentId: "st-40",
        unitName: "わり算の筆算",
        periodLabel: "3時間目",
        draftAnswers: {
          "わかったこと": "まだあまりの書き方に自信がない。",
          "まだ迷っていること": "どこまで答えに書くか迷う。",
          "次に試したいこと": "言葉でも説明を書いてみたい。"
        },
        draftUpdatedAt: new Date().toISOString(),
        answers: {
          "わかったこと": "まだあまりの書き方に自信がない。",
          "まだ迷っていること": "どこまで答えに書くか迷う。",
          "次に試したいこと": "言葉でも説明を書いてみたい。"
        },
        submittedAt: new Date().toISOString(),
        feedbackDraftText: "言葉でも説明を書いてみよう。",
        feedbackDraftUpdatedAt: new Date().toISOString(),
        feedbackText: "",
        returnedAt: null
      }
    ]
  };
}

export function loadLocalDemoState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      ...parsed,
      responses: (parsed.responses ?? []).map((response) => ({
        ...response,
        feedbackDraftText: response.feedbackDraftText ?? response.feedbackText ?? "",
        feedbackDraftUpdatedAt: response.feedbackDraftUpdatedAt ?? response.returnedAt ?? null
      }))
    };
  } catch {
    return createInitialState();
  }
}

export function saveLocalDemoState(state: PersistedState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearLocalDemoState() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function signInState(state: PersistedState): PersistedState {
  return { ...state, signedIn: true };
}

export function completeSetupState(
  state: PersistedState,
  profile: TeacherProfile
): PersistedState {
  return {
    ...state,
    signedIn: true,
    profile
  };
}

export function startLessonState(state: PersistedState, unitId: string): PersistedState {
  const unit = state.units.find((entry) => entry.id === unitId) ?? state.units[0];
  const nextLesson = {
    id: `lesson-${unit.id}-${Date.now()}`,
    unitId: unit.id,
    unitName: unit.name,
    periodLabel: unit.periodLabel,
    fields: [...unit.fields],
    startedAt: new Date().toISOString()
  };
  return {
    ...state,
    activeLesson: nextLesson,
    units: state.units.map((entry) => ({
      ...entry,
      status:
        entry.id === unit.id ? "active" : entry.status === "active" ? "ready" : entry.status
    }))
  };
}

export function endLessonState(state: PersistedState): PersistedState {
  return {
    ...state,
    activeLesson: null,
    units: state.units.map((entry) => ({
      ...entry,
      status: entry.status === "active" ? "ready" : entry.status
    }))
  };
}

export function submitResponseState(
  state: PersistedState,
  payload: StudentDraftPayload
): PersistedState {
  if (!state.activeLesson) return state;
  const existing =
    state.responses.find(
      (response) =>
        response.lessonId === state.activeLesson?.id && response.studentId === payload.studentId
    ) ?? null;
  const next = state.responses.filter(
    (response) =>
      !(response.lessonId === state.activeLesson?.id && response.studentId === payload.studentId)
  );
  next.push({
    lessonId: state.activeLesson.id,
    studentId: payload.studentId,
    unitName: state.activeLesson.unitName,
    periodLabel: state.activeLesson.periodLabel,
    draftAnswers: payload.answers,
    draftUpdatedAt: new Date().toISOString(),
    answers: payload.answers,
    submittedAt: new Date().toISOString(),
    feedbackDraftText: existing?.feedbackDraftText ?? "",
    feedbackDraftUpdatedAt: existing?.feedbackDraftUpdatedAt ?? null,
    feedbackText: existing?.feedbackText ?? "",
    returnedAt: existing?.returnedAt ?? null
  });
  return {
    ...state,
    responses: next
  };
}

export function saveDraftResponseState(
  state: PersistedState,
  payload: StudentDraftPayload
): PersistedState {
  if (!state.activeLesson) return state;
  const existing = state.responses.find(
    (response) =>
      response.lessonId === state.activeLesson?.id && response.studentId === payload.studentId
  );
  if (existing) {
    return {
      ...state,
      responses: state.responses.map((response) =>
        response.lessonId === state.activeLesson?.id && response.studentId === payload.studentId
          ? {
              ...response,
              draftAnswers: payload.answers,
              draftUpdatedAt: new Date().toISOString()
            }
          : response
      )
    };
  }
  return {
    ...state,
    responses: [
      ...state.responses,
      {
        lessonId: state.activeLesson.id,
        studentId: payload.studentId,
        unitName: state.activeLesson.unitName,
        periodLabel: state.activeLesson.periodLabel,
        draftAnswers: payload.answers,
        draftUpdatedAt: new Date().toISOString(),
        answers: {},
        submittedAt: null,
        feedbackDraftText: "",
        feedbackDraftUpdatedAt: null,
        feedbackText: "",
        returnedAt: null
      }
    ]
  };
}

export function saveFeedbackDraftState(
  state: PersistedState,
  studentId: string,
  feedbackText: string
): PersistedState {
  if (!state.activeLesson) return state;
  return {
    ...state,
    responses: state.responses.map((response) =>
      response.lessonId === state.activeLesson?.id && response.studentId === studentId
        ? {
            ...response,
            feedbackDraftText: feedbackText,
            feedbackDraftUpdatedAt: new Date().toISOString()
          }
        : response
    )
  };
}

export function saveFeedbackState(
  state: PersistedState,
  studentId: string,
  feedbackText: string
): PersistedState {
  if (!state.activeLesson) return state;
  return {
    ...state,
    responses: state.responses.map((response) =>
      response.lessonId === state.activeLesson?.id && response.studentId === studentId
        ? {
            ...response,
            feedbackDraftText: feedbackText,
            feedbackDraftUpdatedAt: new Date().toISOString(),
            feedbackText,
            returnedAt: new Date().toISOString()
          }
        : response
    )
  };
}

export function updateProfileState(
  state: PersistedState,
  profile: TeacherProfile
): PersistedState {
  return {
    ...state,
    profile
  };
}

export function addUnitState(
  state: PersistedState,
  payload: UnitCreatePayload
): PersistedState {
  const nextId = `u${state.units.length + 1}`;
  return {
    ...state,
    units: [
      ...state.units,
      {
        id: nextId,
        subject: payload.subject,
        name: payload.name,
        periodLabel: payload.periodLabel,
        status: "draft",
        fields: payload.fields
      }
    ]
  };
}

export function removeUnitState(state: PersistedState, unitId: string): PersistedState {
  const nextUnits = state.units.filter((unit) => unit.id !== unitId);
  const removedActive = state.activeLesson?.unitId === unitId;
  return {
    ...state,
    units: nextUnits,
    activeLesson: removedActive ? null : state.activeLesson,
    responses: removedActive
      ? state.responses.filter((response) => response.lessonId !== state.activeLesson?.id)
      : state.responses
  };
}

export function addStudentState(
  state: PersistedState,
  payload: StudentCreatePayload
): PersistedState {
  const filtered = state.students.filter(
    (student) => student.attendanceNumber !== payload.attendanceNumber
  );
  return {
    ...state,
    students: [
      ...filtered,
      {
        id: `st-${payload.attendanceNumber}`,
        attendanceNumber: payload.attendanceNumber,
        displayName: payload.displayName,
        active: true
      }
    ].sort((left, right) => left.attendanceNumber - right.attendanceNumber)
  };
}

export function removeStudentState(state: PersistedState, studentId: string): PersistedState {
  return {
    ...state,
    students: state.students.filter((student) => student.id !== studentId),
    responses: state.responses.filter((response) => response.studentId !== studentId)
  };
}

export function bulkUpsertStudentsState(
  state: PersistedState,
  nextStudents: StudentCreatePayload[]
): PersistedState {
  const studentMap = new Map(
    state.students.map((student) => [student.attendanceNumber, student] as const)
  );

  nextStudents.forEach((student) => {
    studentMap.set(student.attendanceNumber, {
      id: `st-${student.attendanceNumber}`,
      attendanceNumber: student.attendanceNumber,
      displayName: student.displayName,
      active: true
    });
  });

  return {
    ...state,
    students: Array.from(studentMap.values()).sort(
      (left, right) => left.attendanceNumber - right.attendanceNumber
    )
  };
}

export function updateActiveLessonFieldsState(
  state: PersistedState,
  fields: string[]
): PersistedState {
  if (!state.activeLesson) return state;
  return {
    ...state,
    activeLesson: {
      ...state.activeLesson,
      fields
    }
  };
}
