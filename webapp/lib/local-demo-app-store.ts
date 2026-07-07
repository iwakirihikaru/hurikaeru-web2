import type { AppStore } from "@/lib/app-store";
import {
  addStudentState,
  addUnitState,
  bulkUpsertStudentsState,
  clearLocalDemoState,
  completeSetupState,
  createInitialState,
  endLessonState,
  loadLocalDemoState,
  removeStudentState,
  removeUnitState,
  saveDraftResponseState,
  saveFeedbackDraftState,
  saveFeedbackState,
  saveLocalDemoState,
  signInState,
  startLessonState,
  submitResponseState,
  updateActiveLessonFieldsState,
  updateProfileState
} from "@/lib/local-demo-store";

export const localDemoAppStore: AppStore = {
  kind: "local-demo",
  async loadState() {
    return loadLocalDemoState();
  },
  async saveState(state) {
    saveLocalDemoState(state);
  },
  async clearState() {
    clearLocalDemoState();
  },
  async signIn(state) {
    return signInState(state);
  },
  async completeSetup(state, profile) {
    return completeSetupState(state, profile);
  },
  async startLesson(state, unitId) {
    return startLessonState(state, unitId);
  },
  async endLesson(state) {
    return endLessonState(state);
  },
  async submitResponse(state, payload) {
    return submitResponseState(state, payload);
  },
  async saveDraftResponse(state, payload) {
    return saveDraftResponseState(state, payload);
  },
  async saveFeedback(state, studentId, feedbackText) {
    return saveFeedbackState(state, studentId, feedbackText);
  },
  async saveFeedbackDraft(state, studentId, feedbackText) {
    return saveFeedbackDraftState(state, studentId, feedbackText);
  },
  async updateProfile(state, profile) {
    return updateProfileState(state, profile);
  },
  async addUnit(state, payload) {
    return addUnitState(state, payload);
  },
  async removeUnit(state, unitId) {
    return removeUnitState(state, unitId);
  },
  async addStudent(state, payload) {
    return addStudentState(state, payload);
  },
  async removeStudent(state, studentId) {
    return removeStudentState(state, studentId);
  },
  async bulkUpsertStudents(state, students) {
    return bulkUpsertStudentsState(state, students);
  },
  async updateActiveLessonFields(state, fields) {
    return updateActiveLessonFieldsState(state, fields);
  }
};
