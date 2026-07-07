"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { PersistedState, TeacherProfile, UnitRecord, StudentRecord, ResponseRecord, ActiveLesson } from "@/lib/app-models";
import { createInitialState } from "@/lib/local-demo-store";
import { getAppStore } from "@/lib/get-app-store";

type AppStateValue = {
  ready: boolean;
  storeKind: "local-demo" | "supabase" | "gas";
  signedIn: boolean;
  profile: TeacherProfile;
  units: UnitRecord[];
  students: StudentRecord[];
  activeLesson: ActiveLesson | null;
  responses: ResponseRecord[];
  lastError: string | null;
  signIn: () => void;
  completeSetup: (profile: TeacherProfile) => void;
  startLesson: (unitId: string) => void;
  endLesson: () => void;
  submitResponse: (payload: {
    studentId: string;
    answers: Record<string, string>;
  }) => void;
  saveDraftResponse: (payload: {
    studentId: string;
    answers: Record<string, string>;
  }) => void;
  saveFeedback: (studentId: string, feedbackText: string) => void;
  saveFeedbackDraft: (studentId: string, feedbackText: string) => void;
  updateProfile: (profile: TeacherProfile) => void;
  addUnit: (payload: {
    subject: string;
    name: string;
    periodLabel: string;
    fields: string[];
  }) => void;
  removeUnit: (unitId: string) => void;
  addStudent: (payload: {
    attendanceNumber: number;
    displayName: string;
  }) => void;
  removeStudent: (studentId: string) => void;
  bulkUpsertStudents: (
    students: Array<{
      attendanceNumber: number;
      displayName: string;
    }>
  ) => void;
  updateActiveLessonFields: (fields: string[]) => void;
  resetDemoState: () => void;
  reloadState: () => void;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const store = getAppStore();
  const [state, setState] = useState<PersistedState>(createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(async () => {
    setLastError(null);
    try {
      const next = await store.loadState();
      setState(next);
      setHydrated(true);
    } catch (error) {
      setHydrated(true);
      setLastError(error instanceof Error ? error.message : "状態の読込に失敗しました。");
    }
  }, [store]);

  useEffect(() => {
    let active = true;
    setHydrated(false);
    setLastError(null);
    store
      .loadState()
      .then((next) => {
        if (!active) return;
        setState(next);
        setHydrated(true);
      })
      .catch((error) => {
        if (!active) return;
        setHydrated(true);
        setLastError(error instanceof Error ? error.message : "状態の読込に失敗しました。");
      });
    return () => {
      active = false;
    };
  }, [store]);

  useEffect(() => {
    if (!hydrated) return;
    void store.saveState(state);
  }, [hydrated, state, store]);

  function runAction(action: (current: PersistedState) => Promise<PersistedState> | PersistedState) {
    setLastError(null);
    void Promise.resolve(action(stateRef.current))
      .then((next) => {
        stateRef.current = next;
        setState(next);
      })
      .catch((error) => {
        setLastError(error instanceof Error ? error.message : "更新に失敗しました。");
      });
  }

  const value = useMemo<AppStateValue>(
    () => ({
      ready: hydrated,
      storeKind: store.kind,
      signedIn: state.signedIn,
      profile: state.profile,
      units: state.units,
      students: state.students,
      activeLesson: state.activeLesson,
      responses: state.responses,
      lastError,
      signIn() {
        runAction((current) => store.signIn(current));
      },
      completeSetup(profile) {
        runAction((current) => store.completeSetup(current, profile));
      },
      startLesson(unitId) {
        runAction((current) => store.startLesson(current, unitId));
      },
      endLesson() {
        runAction((current) => store.endLesson(current));
      },
      submitResponse(payload) {
        runAction((current) => store.submitResponse(current, payload));
      },
      saveDraftResponse(payload) {
        runAction((current) => store.saveDraftResponse(current, payload));
      },
      saveFeedback(studentId, feedbackText) {
        runAction((current) => store.saveFeedback(current, studentId, feedbackText));
      },
      saveFeedbackDraft(studentId, feedbackText) {
        runAction((current) => store.saveFeedbackDraft(current, studentId, feedbackText));
      },
      updateProfile(profile) {
        runAction((current) => store.updateProfile(current, profile));
      },
      addUnit(payload) {
        runAction((current) => store.addUnit(current, payload));
      },
      removeUnit(unitId) {
        runAction((current) => store.removeUnit(current, unitId));
      },
      addStudent(payload) {
        runAction((current) => store.addStudent(current, payload));
      },
      removeStudent(studentId) {
        runAction((current) => store.removeStudent(current, studentId));
      },
      bulkUpsertStudents(nextStudents) {
        runAction((current) => store.bulkUpsertStudents(current, nextStudents));
      },
      updateActiveLessonFields(fields) {
        runAction((current) => store.updateActiveLessonFields(current, fields));
      },
      resetDemoState() {
        setLastError(null);
        void store
          .clearState()
          .then(() => {
            const next = createInitialState();
            stateRef.current = next;
            setState(next);
          })
          .catch((error) => {
            setLastError(error instanceof Error ? error.message : "初期化に失敗しました。");
          });
      },
      reloadState() {
        void load();
      }
    }),
    [hydrated, lastError, load, state, store]
  );

  if (!hydrated) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Loading</p>
          <h1>読み込み中</h1>
          <p className="subtle">授業データと設定を準備しています。</p>
        </section>
      </main>
    );
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider.");
  }
  return context;
}
