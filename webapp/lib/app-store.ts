import type {
  PersistedState,
  StudentCreatePayload,
  StudentDraftPayload,
  TeacherProfile,
  UnitCreatePayload
} from "@/lib/app-models";

export type AppStore = {
  kind: "local-demo" | "supabase" | "gas";
  loadState: () => Promise<PersistedState>;
  saveState: (state: PersistedState) => Promise<void>;
  clearState: () => Promise<void>;
  signIn: (state: PersistedState) => Promise<PersistedState>;
  completeSetup: (state: PersistedState, profile: TeacherProfile) => Promise<PersistedState>;
  startLesson: (state: PersistedState, unitId: string) => Promise<PersistedState>;
  endLesson: (state: PersistedState) => Promise<PersistedState>;
  submitResponse: (
    state: PersistedState,
    payload: StudentDraftPayload
  ) => Promise<PersistedState>;
  saveDraftResponse: (
    state: PersistedState,
    payload: StudentDraftPayload
  ) => Promise<PersistedState>;
  saveFeedback: (
    state: PersistedState,
    studentId: string,
    feedbackText: string
  ) => Promise<PersistedState>;
  saveFeedbackDraft: (
    state: PersistedState,
    studentId: string,
    feedbackText: string
  ) => Promise<PersistedState>;
  updateProfile: (
    state: PersistedState,
    profile: TeacherProfile
  ) => Promise<PersistedState>;
  addUnit: (state: PersistedState, payload: UnitCreatePayload) => Promise<PersistedState>;
  removeUnit: (state: PersistedState, unitId: string) => Promise<PersistedState>;
  addStudent: (
    state: PersistedState,
    payload: StudentCreatePayload
  ) => Promise<PersistedState>;
  removeStudent: (state: PersistedState, studentId: string) => Promise<PersistedState>;
  bulkUpsertStudents: (
    state: PersistedState,
    students: StudentCreatePayload[]
  ) => Promise<PersistedState>;
  updateActiveLessonFields: (
    state: PersistedState,
    fields: string[]
  ) => Promise<PersistedState>;
};
