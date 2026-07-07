import type { AppStore } from "@/lib/app-store";
import type {
  PersistedState,
  ResponseRecord,
  StudentCreatePayload,
  TeacherProfile,
  UnitCreatePayload
} from "@/lib/app-models";
import { callGasApi, getGasConfigKey } from "@/lib/gas";
import {
  addStudentState,
  addUnitState,
  bulkUpsertStudentsState,
  completeSetupState,
  createInitialState,
  endLessonState,
  removeStudentState,
  removeUnitState,
  saveDraftResponseState,
  saveFeedbackDraftState,
  saveFeedbackState,
  signInState,
  startLessonState,
  submitResponseState,
  updateActiveLessonFieldsState,
  updateProfileState
} from "@/lib/local-demo-store";

type GasConfigResponse = {
  config: PersistedState | null;
};

function normalizeResponseRecord(response: ResponseRecord): ResponseRecord {
  return {
    ...response,
    draftAnswers: response.draftAnswers ?? {},
    draftUpdatedAt: response.draftUpdatedAt ?? null,
    answers: response.answers ?? {},
    submittedAt: response.submittedAt ?? null,
    feedbackDraftText: response.feedbackDraftText ?? response.feedbackText ?? "",
    feedbackDraftUpdatedAt: response.feedbackDraftUpdatedAt ?? response.returnedAt ?? null,
    feedbackText: response.feedbackText ?? "",
    returnedAt: response.returnedAt ?? null
  };
}

function normalizeState(state: PersistedState | null | undefined): PersistedState {
  const fallback = createInitialState();
  if (!state) {
    return fallback;
  }

  return {
    signedIn: Boolean(state.signedIn),
    profile: state.profile ?? fallback.profile,
    units: Array.isArray(state.units) ? state.units : fallback.units,
    students: Array.isArray(state.students) ? state.students : fallback.students,
    activeLesson: state.activeLesson ?? null,
    responses: Array.isArray(state.responses)
      ? state.responses.map(normalizeResponseRecord)
      : fallback.responses.map(normalizeResponseRecord)
  };
}

async function loadRemoteState() {
  const result = await callGasApi<GasConfigResponse>({
    action: "GET_CONFIG",
    configKey: getGasConfigKey()
  });
  return normalizeState(result?.config);
}

async function saveRemoteState(state: PersistedState) {
  await callGasApi({
    action: "SAVE_CONFIG",
    configKey: getGasConfigKey(),
    config: state
  });
}

async function appendSubmittedResponse(state: PersistedState, studentId: string) {
  if (!state.activeLesson) return;
  const response = state.responses.find(
    (entry) => entry.lessonId === state.activeLesson?.id && entry.studentId === studentId
  );
  const student = state.students.find((entry) => entry.id === studentId);
  if (!response || !student || !response.submittedAt) return;

  await callGasApi({
    action: "SAVE_RESPONSE",
    responseId: `${response.lessonId}-${studentId}-${response.submittedAt}`,
    className: `${state.profile.grade}年${state.profile.className}組`,
    date: response.submittedAt.slice(0, 10),
    studentId: String(student.attendanceNumber),
    studentName: student.displayName,
    answers: response.answers,
    meta: {
      lessonId: response.lessonId,
      unitName: response.unitName,
      periodLabel: response.periodLabel
    }
  });
}

export const gasAppStore: AppStore = {
  kind: "gas",
  async loadState() {
    return loadRemoteState();
  },
  async saveState() {
    return;
  },
  async clearState() {
    await saveRemoteState(createInitialState());
  },
  async signIn(state) {
    const next = signInState(state);
    await saveRemoteState(next);
    return next;
  },
  async completeSetup(state, profile) {
    const next = completeSetupState(state, profile);
    await saveRemoteState(next);
    return next;
  },
  async startLesson(state, unitId) {
    const next = startLessonState(state, unitId);
    await saveRemoteState(next);
    return next;
  },
  async endLesson(state) {
    const next = endLessonState(state);
    await saveRemoteState(next);
    return next;
  },
  async submitResponse(state, payload) {
    const next = submitResponseState(state, payload);
    await saveRemoteState(next);
    await appendSubmittedResponse(next, payload.studentId);
    return next;
  },
  async saveDraftResponse(state, payload) {
    const next = saveDraftResponseState(state, payload);
    await saveRemoteState(next);
    return next;
  },
  async saveFeedback(state, studentId, feedbackText) {
    const next = saveFeedbackState(state, studentId, feedbackText);
    await saveRemoteState(next);
    return next;
  },
  async saveFeedbackDraft(state, studentId, feedbackText) {
    const next = saveFeedbackDraftState(state, studentId, feedbackText);
    await saveRemoteState(next);
    return next;
  },
  async updateProfile(state, profile) {
    const next = updateProfileState(state, profile);
    await saveRemoteState(next);
    return next;
  },
  async addUnit(state, payload) {
    const next = addUnitState(state, payload);
    await saveRemoteState(next);
    return next;
  },
  async removeUnit(state, unitId) {
    const next = removeUnitState(state, unitId);
    await saveRemoteState(next);
    return next;
  },
  async addStudent(state, payload) {
    const next = addStudentState(state, payload);
    await saveRemoteState(next);
    return next;
  },
  async removeStudent(state, studentId) {
    const next = removeStudentState(state, studentId);
    await saveRemoteState(next);
    return next;
  },
  async bulkUpsertStudents(state, students) {
    const next = bulkUpsertStudentsState(state, students);
    await saveRemoteState(next);
    return next;
  },
  async updateActiveLessonFields(state, fields) {
    const next = updateActiveLessonFieldsState(state, fields);
    await saveRemoteState(next);
    return next;
  }
};
