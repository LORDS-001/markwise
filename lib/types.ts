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
  /**
   * Addresses this student's diagnostic and nothing else — PRD v2 §5 step 7.
   * The only credential on that page, so it must be unguessable, not merely
   * unique. Absent until a run is saved.
   */
  diagnosticToken?: string;
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
  /**
   * Where this cluster sits relative to the others in embedding space,
   * projected onto the unit square — PRD §7.4, so related misconceptions
   * render near each other. Absent when there was nothing to project from.
   */
  x?: number;
  y?: number;
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

/** Whether a diagnostic answer still shows the misconception — PRD v2 §8. */
export type DiagnosticVerdict = "holds" | "corrected" | "unclear";

/** One student's answer to one diagnostic question. */
export interface DiagnosticResponse {
  answerId: string;
  questionIndex: number;
  responseText: string;
  /** Null until graded. Ungraded is not the same as unclear. */
  verdict: DiagnosticVerdict | null;
  rationale: string;
}

/**
 * The before/after figure — PRD v2 §12's primary metric.
 *
 * `unclear` and `pending` are carried separately rather than folded into
 * either side. A loop that quietly counted them as corrected would report
 * improvement it did not measure.
 */
export interface LearningChange {
  clusterId: string;
  clusterLabel: string;
  /** Students the run found holding this misconception. */
  before: number;
  /** Of those, how many have completed the diagnostic. */
  completed: number;
  stillHolds: number;
  corrected: number;
  unclear: number;
  pending: number;
}

export type SortMode = "spread" | "damage";
