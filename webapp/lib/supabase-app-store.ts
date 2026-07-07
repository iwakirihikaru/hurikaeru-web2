import type { AppStore } from "@/lib/app-store";
import type {
  PersistedState,
  ResponseRecord,
  StudentCreatePayload,
  TeacherProfile,
  UnitCreatePayload,
  UnitRecord
} from "@/lib/app-models";
import { createInitialState } from "@/lib/local-demo-store";
import {
  createSupabaseBrowserClient,
  getSupabaseClassId,
  getSupabaseOrganizationName
} from "@/lib/supabase";

function parsePeriodLabel(periodNumber: number | null | undefined) {
  return `${periodNumber ?? 1}時間目`;
}

function parsePeriodNumber(periodLabel: string) {
  const match = periodLabel.match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function normalizeJsonRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, String(entryValue ?? "")])
  );
}

async function loadSupabaseState(): Promise<PersistedState> {
  const supabase = createSupabaseBrowserClient();
  const classId = getSupabaseClassId();
  const fallback = createInitialState();

  const [{ data: classRow, error: classError }, { data: students, error: studentsError }, { data: units, error: unitsError }, { data: lessons, error: lessonsError }] =
    await Promise.all([
      supabase
        .from("classes")
        .select("id, grade, class_name, teacher_name")
        .eq("id", classId)
        .single(),
      supabase
        .from("students")
        .select("id, attendance_number, display_name, active")
        .eq("class_id", classId)
        .order("attendance_number"),
      supabase
        .from("units")
        .select("id, subject, name, fields_json, archived")
        .eq("class_id", classId)
        .eq("archived", false)
        .order("created_at"),
      supabase
        .from("lessons")
        .select("id, unit_id, period_number, status, started_at, fields_json")
        .eq("class_id", classId)
        .order("started_at", { ascending: false })
    ]);

  if (classError || studentsError || unitsError || lessonsError) {
    throw new Error(
      classError?.message ||
        studentsError?.message ||
        unitsError?.message ||
        lessonsError?.message ||
        "Failed to load Supabase state."
    );
  }

  const unitMap = new Map(
    (units ?? []).map((unit) => [
      unit.id,
      {
        id: unit.id,
        subject: unit.subject ?? "",
        name: unit.name,
        periodLabel: "1時間目",
        status: "draft" as const,
        fields: parseStringArray(unit.fields_json)
      }
    ])
  );

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const lessonMap = new Map(
    (lessons ?? []).map((lesson) => [lesson.id, lesson] as const)
  );

  const activeLessonRow = (lessons ?? []).find((lesson) => lesson.status === "active") ?? null;

  const { data: responses, error: responsesError } = lessonIds.length
    ? await supabase
        .from("responses")
        .select(
          "lesson_id, student_id, draft_json, submitted_json, submitted_at, feedback_text, feedback_returned_at"
        )
        .in("lesson_id", lessonIds)
    : { data: [], error: null };

  if (responsesError) {
    throw new Error(responsesError.message);
  }

  const responseRecords: ResponseRecord[] = (responses ?? []).flatMap((response) => {
    const lesson = lessonMap.get(response.lesson_id);
    if (!lesson) return [];
    const unit = unitMap.get(lesson.unit_id);
    return [
      {
        lessonId: response.lesson_id,
        studentId: response.student_id,
        unitName: unit?.name ?? "単元未設定",
        periodLabel: parsePeriodLabel(lesson.period_number),
        draftAnswers: normalizeJsonRecord(response.draft_json),
        draftUpdatedAt: response.submitted_at ?? null,
        answers: normalizeJsonRecord(response.submitted_json),
        submittedAt: response.submitted_at ?? null,
        feedbackDraftText: response.feedback_text ?? "",
        feedbackDraftUpdatedAt: response.feedback_returned_at ?? response.submitted_at ?? null,
        feedbackText: response.feedback_returned_at ? response.feedback_text ?? "" : "",
        returnedAt: response.feedback_returned_at ?? null
      }
    ];
  });

  const mappedUnits: UnitRecord[] = (units ?? []).map((unit) => {
    const latestLesson = (lessons ?? []).find((lesson) => lesson.unit_id === unit.id);
    return {
      id: unit.id,
      subject: unit.subject ?? "",
      name: unit.name,
      periodLabel: latestLesson ? parsePeriodLabel(latestLesson.period_number) : "1時間目",
      status: latestLesson?.status === "active" ? "active" : "ready",
      fields: parseStringArray(unit.fields_json)
    };
  });

  return {
    signedIn: true,
    profile: {
      teacherName: classRow?.teacher_name ?? fallback.profile.teacherName,
      schoolName: getSupabaseOrganizationName(),
      grade: classRow?.grade ?? fallback.profile.grade,
      className: classRow?.class_name ?? fallback.profile.className
    },
    units: mappedUnits,
    students: (students ?? []).map((student) => ({
      id: student.id,
      attendanceNumber: student.attendance_number,
      displayName: student.display_name,
      active: student.active
    })),
    activeLesson: activeLessonRow
      ? {
          id: activeLessonRow.id,
          unitId: activeLessonRow.unit_id,
          unitName: unitMap.get(activeLessonRow.unit_id)?.name ?? "単元未設定",
          periodLabel: parsePeriodLabel(activeLessonRow.period_number),
          fields: parseStringArray(activeLessonRow.fields_json),
          startedAt: activeLessonRow.started_at ?? new Date().toISOString()
        }
      : null,
    responses: responseRecords
  };
}

async function reloadState() {
  return loadSupabaseState();
}

export const supabaseAppStore: AppStore = {
  kind: "supabase",
  async loadState() {
    return loadSupabaseState();
  },
  async saveState() {
    return;
  },
  async clearState() {
    return;
  },
  async signIn() {
    return reloadState();
  },
  async completeSetup(state, profile) {
    const supabase = createSupabaseBrowserClient();
    const classId = getSupabaseClassId();
    const { error } = await supabase
      .from("classes")
      .update({
        grade: profile.grade,
        class_name: profile.className,
        teacher_name: profile.teacherName
      })
      .eq("id", classId);
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async startLesson(state, unitId) {
    const supabase = createSupabaseBrowserClient();
    const classId = getSupabaseClassId();
    const unit = state.units.find((entry) => entry.id === unitId) ?? state.units[0];
    await supabase.from("lessons").update({ status: "closed", ended_at: new Date().toISOString() }).eq("class_id", classId).eq("status", "active");
    const { error } = await supabase.from("lessons").insert({
      class_id: classId,
      unit_id: unit.id,
      period_number: parsePeriodNumber(unit.periodLabel),
      status: "active",
      started_at: new Date().toISOString(),
      fields_json: unit.fields
    });
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async endLesson(state) {
    if (!state.activeLesson) return state;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("lessons")
      .update({ status: "closed", ended_at: new Date().toISOString() })
      .eq("id", state.activeLesson.id);
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async submitResponse(state, payload) {
    if (!state.activeLesson) return state;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("responses").upsert({
      lesson_id: state.activeLesson.id,
      student_id: payload.studentId,
      draft_json: payload.answers,
      submitted_json: payload.answers,
      submitted_at: new Date().toISOString()
    });
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async saveDraftResponse(state, payload) {
    if (!state.activeLesson) return state;
    const supabase = createSupabaseBrowserClient();
    const existing = state.responses.find(
      (response) =>
        response.lessonId === state.activeLesson?.id && response.studentId === payload.studentId
    );
    const { error } = existing
      ? await supabase
          .from("responses")
          .update({
            draft_json: payload.answers
          })
          .eq("lesson_id", state.activeLesson.id)
          .eq("student_id", payload.studentId)
      : await supabase.from("responses").insert({
          lesson_id: state.activeLesson.id,
          student_id: payload.studentId,
          draft_json: payload.answers
        });
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async saveFeedback(state, studentId, feedbackText) {
    if (!state.activeLesson) return state;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("responses")
      .update({
        feedback_text: feedbackText,
        feedback_returned_at: new Date().toISOString()
      })
      .eq("lesson_id", state.activeLesson.id)
      .eq("student_id", studentId);
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async saveFeedbackDraft(state, studentId, feedbackText) {
    if (!state.activeLesson) return state;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("responses")
      .update({
        feedback_text: feedbackText
      })
      .eq("lesson_id", state.activeLesson.id)
      .eq("student_id", studentId);
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async updateProfile(state, profile) {
    return this.completeSetup(state, profile);
  },
  async addUnit(state, payload) {
    const supabase = createSupabaseBrowserClient();
    const classId = getSupabaseClassId();
    const { error } = await supabase.from("units").insert({
      class_id: classId,
      subject: payload.subject,
      name: payload.name,
      periods_count: 1,
      fields_json: payload.fields
    });
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async removeUnit(state, unitId) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("units").update({ archived: true }).eq("id", unitId);
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async addStudent(state, payload) {
    const supabase = createSupabaseBrowserClient();
    const classId = getSupabaseClassId();
    const { error } = await supabase.from("students").upsert({
      id: `00000000-0000-0000-0000-${String(payload.attendanceNumber).padStart(12, "0")}`,
      class_id: classId,
      attendance_number: payload.attendanceNumber,
      display_name: payload.displayName,
      active: true
    });
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async removeStudent(state, studentId) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("students").update({ active: false }).eq("id", studentId);
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async bulkUpsertStudents(state, students) {
    const supabase = createSupabaseBrowserClient();
    const classId = getSupabaseClassId();
    const { error } = await supabase.from("students").upsert(
      students.map((student) => ({
        id: `00000000-0000-0000-0000-${String(student.attendanceNumber).padStart(12, "0")}`,
        class_id: classId,
        attendance_number: student.attendanceNumber,
        display_name: student.displayName,
        active: true
      }))
    );
    if (error) throw new Error(error.message);
    return reloadState();
  },
  async updateActiveLessonFields(state, fields) {
    if (!state.activeLesson) return state;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("lessons")
      .update({ fields_json: fields })
      .eq("id", state.activeLesson.id);
    if (error) throw new Error(error.message);
    return reloadState();
  }
};
