export type SetupChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

export type UnitSummary = {
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
  submitted: boolean;
  returned: boolean;
  feedbackMode: "text" | "handwriting" | "pending";
  reflection: string;
  feedbackText: string;
};

export type StudentOption = {
  id: string;
  attendanceNumber: number;
  displayName: string;
};

export type LessonOption = {
  id: string;
  label: string;
  unitName: string;
  isCurrent: boolean;
};

export type HistoryEntry = {
  lessonLabel: string;
  summary: string;
  feedback: string;
};

export const setupChecklist: SetupChecklistItem[] = [
  { id: "account", label: "先生アカウント作成", done: true },
  { id: "organization", label: "学校・組織登録", done: true },
  { id: "class", label: "クラス作成", done: true },
  { id: "students", label: "名簿登録", done: false },
  { id: "unit", label: "単元登録", done: false }
];

export const teacherUnits: UnitSummary[] = [
  {
    id: "u1",
    subject: "算数",
    name: "わり算の筆算",
    periodLabel: "3時間目",
    status: "active",
    fields: ["わかったこと", "まだ迷っていること", "次に試したいこと"]
  },
  {
    id: "u2",
    subject: "算数",
    name: "面積",
    periodLabel: "4時間目",
    status: "ready",
    fields: ["面積の求め方", "説明したいこと"]
  },
  {
    id: "u3",
    subject: "国語",
    name: "説明文を読む",
    periodLabel: "5時間目",
    status: "draft",
    fields: ["読み取ったこと", "筆者の工夫", "自分の考え"]
  }
];

export const teacherStudents: StudentRecord[] = [
  {
    id: "s8",
    attendanceNumber: 8,
    displayName: "さとう",
    submitted: true,
    returned: false,
    feedbackMode: "pending",
    reflection: "筆算では位をそろえると見やすい。",
    feedbackText: ""
  },
  {
    id: "s17",
    attendanceNumber: 17,
    displayName: "たかはし",
    submitted: true,
    returned: true,
    feedbackMode: "handwriting",
    reflection: "図を使うと、あまりの意味が分かりやすかった。",
    feedbackText: "図で考えたところが良いです。"
  },
  {
    id: "s40",
    attendanceNumber: 40,
    displayName: "おおた",
    submitted: true,
    returned: false,
    feedbackMode: "text",
    reflection: "まだあまりの書き方に自信がない。",
    feedbackText: "言葉でも説明を書いてみよう。"
  }
];

export const studentOptions: StudentOption[] = Array.from({ length: 40 }, (_, index) => ({
  id: `st-${index + 1}`,
  attendanceNumber: index + 1,
  displayName: `児童${String(index + 1).padStart(2, "0")}`
}));

export const lessonOptions: LessonOption[] = [
  { id: "l1", label: "3時間目", unitName: "わり算の筆算", isCurrent: true },
  { id: "l2", label: "4時間目", unitName: "面積", isCurrent: false },
  { id: "l3", label: "5時間目", unitName: "小数のかけ算", isCurrent: false }
];

export const studentHistory: HistoryEntry[] = [
  {
    lessonLabel: "前回: わり算の筆算",
    summary: "筆算の並べ方が分かるようになった。",
    feedback: "友だちの考えを比べられている。"
  },
  {
    lessonLabel: "その前: かけ算のきまり",
    summary: "図で説明すると分かりやすい。",
    feedback: "式と図をつなげて書けている。"
  }
];
