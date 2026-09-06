import { ANSWERS, CRITERIA, SESSION } from "@/lib/mock";
import { answersFromPaste } from "@/lib/pipeline/parse-answers";
import type { PipelineInput, RawAnswer } from "@/lib/pipeline/types";

export interface SetupDraft {
  courseCode: string;
  courseTitle: string;
  subject: string;
  level: string;
  question: string;
  scheme: string;
  criteria: PipelineInput["criteria"];
  prediction: string;
  mode: "paste" | "csv" | "photo";
  paste: string;
  csvName: string | null;
  csvAnswers: RawAnswer[];
  isDemo: boolean;
}

export const DEMO_MARKING_SCHEME =
  "Full marks require the reactance computed from X_L = 2πfL, the impedance combined in quadrature as Z = √(R² + X_L²), the current from I = V/Z, the phase angle from φ = arctan(X_L/R) stated as the angle between supply voltage and current, and correct units throughout.";

export function createEmptySetupDraft(): SetupDraft {
  return {
    courseCode: "",
    courseTitle: "",
    subject: "",
    level: "",
    question: "",
    scheme: "",
    criteria: [{ id: "c-1", label: "", marks: 1 }],
    prediction: "",
    mode: "paste",
    paste: "",
    csvName: null,
    csvAnswers: [],
    isDemo: false,
  };
}

export function createDemoSetupDraft(): SetupDraft {
  return {
    courseCode: SESSION.courseCode,
    courseTitle: SESSION.courseTitle,
    subject: SESSION.subject,
    level: SESSION.level,
    question: SESSION.question,
    scheme: DEMO_MARKING_SCHEME,
    criteria: CRITERIA.map((criterion) => ({ ...criterion })),
    prediction: SESSION.prediction ?? "",
    mode: "paste",
    paste: ANSWERS.map((answer) => `${answer.studentId} | ${answer.answer}`).join("\n"),
    csvName: null,
    csvAnswers: [],
    isDemo: true,
  };
}

export function createSetupDraftFromRun(
  input: PipelineInput,
  course?: { code: string; title: string },
  prediction = "",
): SetupDraft {
  const paste = input.answers.map((answer) => `${answer.studentRef} | ${answer.text}`).join("\n");
  const parsed = answersFromPaste(paste);
  const losslessPaste = parsed.length === input.answers.length && parsed.every((answer, index) =>
    answer.studentRef === input.answers[index].studentRef && answer.text === input.answers[index].text,
  );
  return {
    courseCode: course?.code ?? "",
    courseTitle: course?.title ?? "",
    subject: input.subject,
    level: input.level,
    question: input.question,
    scheme: input.scheme,
    criteria: input.criteria.map((criterion) => ({ ...criterion })),
    prediction,
    // The line-based paste format cannot represent multiline responses or
    // identifiers containing pipes. Retain those rows as parsed CSV data.
    mode: losslessPaste ? "paste" : "csv",
    paste: losslessPaste ? paste : "",
    csvName: losslessPaste ? null : "Recovered answers",
    csvAnswers: losslessPaste ? [] : input.answers.map((answer) => ({ ...answer })),
    isDemo: false,
  };
}
