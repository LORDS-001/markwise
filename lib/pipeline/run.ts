import type { Cluster, StudentAnswer } from "@/lib/types";
import {
  CONCURRENCY,
  embedTexts,
  generateJson,
  mapWithConcurrency,
} from "./gemini";
import {
  DAMAGE_SCHEMA,
  EXTRACTION_SCHEMA,
  LABEL_SCHEMA,
  damagePrompt,
  extractionPrompt,
  extractionSystemPrompt,
  labelPrompt,
} from "./prompts";
import {
  DISTANCE_THRESHOLD,
  MIN_CLUSTER_SIZE,
  agglomerativeCluster,
} from "./cluster";
import { initialsFor } from "./parse-answers";
import type {
  Extraction,
  PipelineInput,
  PipelineResult,
  ProgressHandler,
  RawAnswer,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Step 1 — error signature extraction                                */
/* ------------------------------------------------------------------ */

interface RawExtraction {
  is_correct: boolean;
  error_signature: string;
  confidence: number;
  evidence_span: string;
  provisional_score: number;
  criteria_met: string[];
  criteria_missed: string[];
  score_rationale: string;
}

/**
 * Normalises one model response into a trustworthy Extraction.
 *
 * Everything the model returns is treated as a proposal, not a fact. The score
 * in particular is recomputed from the criteria it awarded rather than taken
 * on trust: a number that disagrees with its own justification is exactly the
 * thing a lecturer would catch and lose confidence over.
 */
export function normaliseExtraction(
  raw: RawExtraction,
  answer: RawAnswer,
  criteria: { id: string; marks: number }[],
): Extraction {
  const validIds = new Set(criteria.map((c) => c.id));
  const maxScore = criteria.reduce((sum, c) => sum + c.marks, 0);

  const met = (raw.criteria_met ?? []).filter((id) => validIds.has(id));
  const metSet = new Set(met);
  // Anything valid that was not met is missed, whatever the model listed. This
  // guarantees met and missed partition the criteria exactly once each.
  const missed = criteria.map((c) => c.id).filter((id) => !metSet.has(id));

  const scoreFromCriteria = criteria
    .filter((c) => metSet.has(c.id))
    .reduce((sum, c) => sum + c.marks, 0);

  const signature = (raw.error_signature ?? "").trim();
  const isCorrect = Boolean(raw.is_correct);

  // The span must be genuinely verbatim — the UI highlights it inside the
  // answer, so a paraphrase would highlight nothing and look broken.
  const span = (raw.evidence_span ?? "").trim();
  const evidenceSpan =
    span.length > 0 && answer.text.includes(span) ? span : null;

  const confidence = Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0;

  return {
    studentRef: answer.studentRef,
    isCorrect,
    errorSignature: isCorrect || signature.length === 0 ? null : signature,
    confidence,
    evidenceSpan: isCorrect ? null : evidenceSpan,
    provisionalScore: Math.min(maxScore, Math.max(0, scoreFromCriteria)),
    maxScore,
    criteriaMet: met,
    criteriaMissed: missed,
    scoreRationale: (raw.score_rationale ?? "").trim(),
  };
}

async function extractOne(
  input: PipelineInput,
  answer: RawAnswer,
  onError: (message: string) => void,
): Promise<Extraction> {
  const maxScore = input.criteria.reduce((sum, c) => sum + c.marks, 0);

  try {
    const raw = await generateJson<RawExtraction>({
      system: extractionSystemPrompt(),
      prompt: extractionPrompt(input, answer),
      schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.1,
    });
    return normaliseExtraction(raw, answer, input.criteria);
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    // One answer failing must not lose the other thirty-nine. It comes back
    // undiagnosed at zero confidence, which routes it straight to the
    // mandatory-review queue rather than silently scoring it.
    return {
      studentRef: answer.studentRef,
      isCorrect: false,
      errorSignature: null,
      confidence: 0,
      evidenceSpan: null,
      provisionalScore: 0,
      maxScore,
      criteriaMet: [],
      criteriaMissed: input.criteria.map((c) => c.id),
      scoreRationale:
        "This answer could not be read automatically. Score it yourself.",
      failed: true,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Orchestration                                                      */
/* ------------------------------------------------------------------ */

interface RawLabel {
  label: string;
  why: string;
}
interface RawDamage {
  downstream: string[];
  severity: number;
}

const OTHER_CLUSTER_ID = "cl-other";

/**
 * Runs the full pipeline — PRD §6 steps 1 through 5.
 *
 * `onProgress` is called as each stage advances so the processing screen can
 * show real progress rather than a simulated bar.
 */
export async function runPipeline(
  input: PipelineInput,
  onProgress: ProgressHandler = () => {},
): Promise<PipelineResult> {
  const maxScore = input.criteria.reduce((sum, c) => sum + c.marks, 0);

  /* --- Step 1: extraction ---------------------------------------- */
  onProgress({ stage: "extract", progress: 0 });

  let done = 0;
  const failures: string[] = [];
  const extractions = await mapWithConcurrency(
    input.answers,
    CONCURRENCY,
    async (answer) => {
      const result = await extractOne(input, answer, (message) =>
        failures.push(message),
      );
      done += 1;
      onProgress({
        stage: "extract",
        progress: done / input.answers.length,
        detail: `${done} of ${input.answers.length} answers read`,
      });
      return result;
    },
  );

  onProgress({ stage: "extract", progress: 1 });

  /*
   * A few answers failing is survivable — they land in the mandatory-review
   * queue and a lecturer marks them by hand. Most of them failing is not: the
   * map would be drawn from whatever scraped through, and nothing on screen
   * would say so. A diagnosis built from a third of the class, presented as if
   * it were the class, is worse than no diagnosis, so this stops instead.
   */
  if (failures.length > input.answers.length / 3) {
    throw new Error(
      `${failures.length} of ${input.answers.length} answers could not be read, so the result would not describe your class. First error: ${failures[0]}`,
    );
  }

  // Correct answers are pooled separately and never clustered (PRD §6 step 1).
  const diagnosable = extractions
    .map((extraction, index) => ({ extraction, index }))
    .filter(
      ({ extraction }) =>
        !extraction.isCorrect && extraction.errorSignature !== null,
    );

  /* --- Step 2: embedding ----------------------------------------- */
  onProgress({ stage: "embed", progress: 0 });

  const vectors =
    diagnosable.length > 0
      ? await embedTexts(diagnosable.map((d) => d.extraction.errorSignature!))
      : [];

  onProgress({
    stage: "embed",
    progress: 1,
    detail: `${vectors.length} signatures embedded`,
  });

  /* --- Step 3: clustering ---------------------------------------- */
  onProgress({ stage: "cluster", progress: 0 });

  const groups =
    vectors.length > 0 ? agglomerativeCluster(vectors, DISTANCE_THRESHOLD) : [];

  // Groups below the minimum are not a class-level pattern; they go to the
  // one-off bucket rather than masquerading as misconceptions.
  const realGroups = groups.filter((g) => g.length >= MIN_CLUSTER_SIZE);
  const singletons = groups.filter((g) => g.length < MIN_CLUSTER_SIZE).flat();

  onProgress({
    stage: "cluster",
    progress: 1,
    detail: `${realGroups.length} groups found`,
  });

  /* --- Step 4: labelling ----------------------------------------- */
  onProgress({ stage: "label", progress: 0 });

  let labelled = 0;
  const labels = await mapWithConcurrency(
    realGroups,
    CONCURRENCY,
    async (group) => {
      const signatures = group.map(
        (i) => diagnosable[i].extraction.errorSignature!,
      );
      let result: RawLabel;
      try {
        result = await generateJson<RawLabel>({
          prompt: labelPrompt(input, signatures),
          schema: LABEL_SCHEMA as unknown as Record<string, unknown>,
          temperature: 0.3,
        });
      } catch {
        // Fall back to the most common member signature, so a failed call
        // still leaves the lecturer a readable, evidence-backed cluster.
        result = {
          label: signatures[0],
          why: "Automatic labelling failed for this group. The shared signature above is taken from a member answer; rename it to something you would recognise.",
        };
      }
      labelled += 1;
      onProgress({ stage: "label", progress: labelled / realGroups.length });
      return result;
    },
  );

  onProgress({ stage: "label", progress: 1 });

  /* --- Step 5: prerequisite damage ------------------------------- */
  onProgress({ stage: "damage", progress: 0 });

  let assessed = 0;
  const damages = await mapWithConcurrency(labels, CONCURRENCY, async (label) => {
    let result: RawDamage;
    try {
      result = await generateJson<RawDamage>({
        prompt: damagePrompt(input, label.label),
        schema: DAMAGE_SCHEMA as unknown as Record<string, unknown>,
        temperature: 0.3,
      });
    } catch {
      // Severity 1 with no named topics reads honestly as "not assessed"
      // rather than inventing a damage claim the lecturer cannot check.
      result = { downstream: [], severity: 1 };
    }
    assessed += 1;
    onProgress({ stage: "damage", progress: assessed / Math.max(1, labels.length) });
    return {
      downstream: (result.downstream ?? []).filter(
        (t) => typeof t === "string" && t.trim().length > 0,
      ),
      severity: Math.min(5, Math.max(1, Math.round(result.severity ?? 1))),
    };
  });

  onProgress({ stage: "damage", progress: 1 });

  /* --- Assembly --------------------------------------------------- */

  const answerIds = input.answers.map(
    (_, i) => `a-${String(i + 1).padStart(2, "0")}`,
  );

  // Which cluster each diagnosable answer landed in, keyed by original index.
  const clusterOfAnswer = new Map<number, string>();
  realGroups.forEach((group, groupIndex) => {
    const clusterId = `cl-${groupIndex + 1}`;
    for (const memberIndex of group) {
      clusterOfAnswer.set(diagnosable[memberIndex].index, clusterId);
    }
  });
  for (const memberIndex of singletons) {
    clusterOfAnswer.set(diagnosable[memberIndex].index, OTHER_CLUSTER_ID);
  }
  // An answer that is wrong but undiagnosable still belongs somewhere.
  extractions.forEach((extraction, index) => {
    if (!extraction.isCorrect && !clusterOfAnswer.has(index)) {
      clusterOfAnswer.set(index, OTHER_CLUSTER_ID);
    }
  });

  const answers: StudentAnswer[] = input.answers.map((raw, index) => {
    const extraction = extractions[index];
    return {
      id: answerIds[index],
      studentId: raw.studentRef,
      initials: initialsFor(raw.studentRef),
      answer: raw.text,
      isCorrect: extraction.isCorrect,
      clusterId: extraction.isCorrect
        ? null
        : (clusterOfAnswer.get(index) ?? OTHER_CLUSTER_ID),
      errorSignature: extraction.errorSignature,
      evidenceSpan: extraction.evidenceSpan,
      confidence: Math.round(extraction.confidence * 100) / 100,
      provisionalScore: extraction.provisionalScore,
      maxScore,
      criteriaMet: extraction.criteriaMet,
      criteriaMissed: extraction.criteriaMissed,
      scoreRationale: extraction.scoreRationale,
      status: "unreviewed",
    };
  });

  const membersOf = (clusterId: string) =>
    answers.filter((a) => a.clusterId === clusterId).map((a) => a.id);

  const clusters: Cluster[] = realGroups.map((_, groupIndex) => {
    const id = `cl-${groupIndex + 1}`;
    return {
      id,
      // Tones 1-6 are the categorical ramp; 0 is reserved for the Other bucket.
      tone: ((groupIndex % 6) + 1) as Cluster["tone"],
      label: labels[groupIndex].label.trim(),
      why: labels[groupIndex].why.trim(),
      memberIds: membersOf(id),
      severity: damages[groupIndex].severity,
      downstream: damages[groupIndex].downstream,
      isOther: false,
    };
  });

  const otherMembers = membersOf(OTHER_CLUSTER_ID);
  if (otherMembers.length > 0) {
    clusters.push({
      id: OTHER_CLUSTER_ID,
      tone: 0,
      label: "Other / one-off errors",
      why: "Signatures that did not group with any other answer. Kept together so they stay reviewable without implying a shared cause.",
      memberIds: otherMembers,
      severity: 1,
      downstream: [],
      isOther: true,
    });
  }

  return { answers, clusters, reteachPacks: {}, maxScore };
}
