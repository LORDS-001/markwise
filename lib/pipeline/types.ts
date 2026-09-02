import type { Cluster, Criterion, ReteachPack, StudentAnswer } from "@/lib/types";

/** One student answer as it arrives from paste or CSV, before the model sees it. */
export interface RawAnswer {
  studentRef: string;
  text: string;
}

/** Everything the pipeline needs to run. Mirrors the setup screen's fields. */
export interface PipelineInput {
  question: string;
  scheme: string;
  criteria: Criterion[];
  subject: string;
  level: string;
  answers: RawAnswer[];
}

/**
 * Step 1 output — PRD §6. Diagnosis and provisional score come back from the
 * same call, because awarding criteria against the scheme is the identical
 * piece of reasoning as naming the false belief.
 */
export interface Extraction {
  studentRef: string;
  isCorrect: boolean;
  errorSignature: string | null;
  confidence: number;
  evidenceSpan: string | null;
  provisionalScore: number;
  maxScore: number;
  criteriaMet: string[];
  criteriaMissed: string[];
  scoreRationale: string;
  /** Set when the call failed and this is the undiagnosed fallback. */
  failed?: boolean;
}

/** Step 4 output — one canonical misconception per group. */
export interface ClusterLabel {
  label: string;
  why: string;
}

/** Step 5 output — what the belief breaks next, and how badly. */
export interface DamageAssessment {
  downstream: string[];
  severity: number;
}

export type StageId = "extract" | "embed" | "cluster" | "label" | "damage";

/** Emitted as the run proceeds so the processing screen can show real progress. */
export interface StageProgress {
  stage: StageId;
  /** 0–1 within this stage. */
  progress: number;
  /** Populated as soon as the stage can say something concrete. */
  detail?: string;
}

/** The finished run, in exactly the shape the existing screens already consume. */
export interface PipelineResult {
  answers: StudentAnswer[];
  clusters: Cluster[];
  reteachPacks: Record<string, ReteachPack>;
  maxScore: number;
}

export type ProgressHandler = (event: StageProgress) => void;
