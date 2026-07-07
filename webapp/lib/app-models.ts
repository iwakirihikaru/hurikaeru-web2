export type TeacherProfile = {
  teacherName: string;
  schoolName: string;
  grade: string;
  className: string;
};

export type UnitRecord = {
  id: string;
  subject: string;
  name: string;
  periodLabel: string;
  status: "active" | "ready" | "draft";
  fields: string[];
};

export type StudentRecord = {
  id: string;
  attendanceNumber: number;
  displayName: string;
  active: boolean;
};

export type ResponseRecord = {
  lessonId: string;
  studentId: string;
  unitName: string;
  periodLabel: string;
  draftAnswers: Record<string, string>;
  draftUpdatedAt: string | null;
  answers: Record<string, string>;
  submittedAt: string | null;
  feedbackDraftText: string;
  feedbackDraftUpdatedAt: string | null;
  feedbackText: string;
  returnedAt: string | null;
};

export type ActiveLesson = {
  id: string;
  unitId: string;
  unitName: string;
  periodLabel: string;
  fields: string[];
  startedAt: string;
};

export type PersistedState = {
  signedIn: boolean;
  profile: TeacherProfile;
  units: UnitRecord[];
  students: StudentRecord[];
  activeLesson: ActiveLesson | null;
  responses: ResponseRecord[];
};

export type StudentDraftPayload = {
  studentId: string;
  answers: Record<string, string>;
};

export type UnitCreatePayload = {
  subject: string;
  name: string;
  periodLabel: string;
  fields: string[];
};

export type StudentCreatePayload = {
  attendanceNumber: number;
  displayName: string;
};
