export type ReviewStatus = "unreviewed" | "accepted" | "edited" | "flagged";

export interface Criterion {
  id: string;
  label: string;
  marks: number;
}

export interface StudentAnswer {
  id: string;
  studentId: string;
  initials: string;
  answer: string;
  isCorrect: boolean;
  clusterId: string | null;
  errorSignature: string | null;
  /** Verbatim substring of `answer` that triggered the signature. */
  evidenceSpan: string | null;
  confidence: number;
  provisionalScore: number;
  maxScore: number;
  criteriaMet: string[];
  criteriaMissed: string[];
  scoreRationale: string;
  status: ReviewStatus;
}

export interface Cluster {
  id: string;
  /** Position in the categorical colour ramp. */
  tone: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  why: string;
  memberIds: string[];
  /** 1–5, anchored in the labelling prompt. */
  severity: number;
  downstream: string[];
  isOther: boolean;
}

export interface ReteachPack {
  clusterId: string;
  lesson: { heading: string; body: string }[];
  diagnostics: {
    prompt: string;
    holderAnswers: string;
    correctedAnswers: string;
  }[];
}

export interface Session {
  id: string;
  courseCode: string;
  courseTitle: string;
  question: string;
  criteria: Criterion[];
  subject: string;
  level: string;
  maxScore: number;
  prediction: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface Stage {
  id: string;
  label: string;
  detail: string;
  /** Share of total wall-clock, used for the progress simulation. */
  weight: number;
}

export type SortMode = "spread" | "damage";
