/**
 * Measures extraction against the risk PRD §11 calls fatal — PRD §8, §10.
 *
 * §11's first failure is extraction returning descriptions of answers instead
 * of the beliefs behind them. Nothing downstream recovers from it: "used the
 * wrong formula" clusters with nothing, so the map comes out sparse and the
 * lecturer is shown a class that looks like it had no shared errors. The
 * clustering already has a measurement in `pipeline:tune`. This is the stage
 * above it, which had none.
 *
 *   npm run pipeline:signatures
 *
 * Scored against the seeded pilot class (§8): 40 pseudonymised answers whose
 * beliefs were written by hand. Those authored signatures are the truth here,
 * never the model's own output — the same discipline `pipeline:tune` applies
 * when it refuses to score an exported run without independent labels.
 *
 * Four questions, in the order they matter:
 *   1. Do the signatures name beliefs at all?        (§11's fatal mode)
 *   2. Do they name the belief that was actually there?
 *   3. Do they still group the class correctly?      (§6 step 3, end to end)
 *   4. What did it cost, and did the cached prefix work?
 */

import { ANSWERS, CRITERIA, SESSION } from "@/lib/mock";
import { claudeJson, CLAUDE_MODEL, type ClaudeUsage } from "@/lib/pipeline/claude";
import {
  DISTANCE_THRESHOLD,
  MIN_CLUSTER_SIZE,
  agglomerativeCluster,
  cosineDistance,
} from "@/lib/pipeline/cluster";
import { isPipelineConfigured, missingPipelineKeys } from "@/lib/pipeline/config";
import {
  CONCURRENCY,
  embedTexts,
  mapWithConcurrency,
} from "@/lib/pipeline/gemini";
import {
  extractionAnswer,
  extractionContext,
  extractionSystemPrompt,
} from "@/lib/pipeline/prompts";
import { ExtractionSchema } from "@/lib/pipeline/schemas";
import { judgeSignatureShape } from "@/lib/pipeline/signature-quality";
import { pairwiseScore } from "@/lib/pipeline/tuning";
import type { PipelineInput } from "@/lib/pipeline/types";

const ESC = "\x1b";
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const GREEN = `${ESC}[32m`;
const RED = `${ESC}[31m`;
const YELLOW = `${ESC}[33m`;

/** Below this the run is diagnosing a minority of the class it claims to describe. */
const BELIEF_RATE_FLOOR = 0.9;
/** Cosine similarity above which a produced signature is the authored belief. */
const AGREEMENT_THRESHOLD = 0.75;

function bar(value: number, width = 18) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
}

function tone(value: number, floor: number) {
  if (value >= floor) return GREEN;
  return value >= floor - 0.15 ? YELLOW : RED;
}

interface Extracted {
  studentRef: string;
  answer: string;
  authored: string;
  truth: string;
  produced: string;
}

async function main() {
  if (!isPipelineConfigured()) {
    console.error(`Missing ${missingPipelineKeys().join(" and ")}.`);
    process.exit(1);
  }

  // Only the diagnosable half of the class: a correct answer has no belief to
  // recover, and scoring one would reward the model for returning nothing.
  const graded = ANSWERS.filter((a) => !a.isCorrect && a.errorSignature);
  if (graded.length < 2) {
    console.error("The seeded class has too few diagnosed answers to measure.");
    process.exit(1);
  }

  const input: PipelineInput = {
    question: SESSION.question,
    scheme: "Full marks require the reactance computed from X_L = 2πfL.",
    criteria: CRITERIA,
    subject: SESSION.subject,
    level: SESSION.level,
    answers: [],
  };

  console.log();
  console.log(`${BOLD}Extraction quality${RESET} ${DIM}— PRD §11${RESET}`);
  console.log(`${DIM}source: seeded pilot class (authored beliefs as truth)${RESET}`);
  console.log(`${DIM}answers: ${graded.length} · model: ${CLAUDE_MODEL}${RESET}`);
  console.log();

  const usages: ClaudeUsage[] = [];
  const failures: string[] = [];
  const stable = `${extractionSystemPrompt()}\n\n${extractionContext(input)}`;

  process.stdout.write(`${DIM}extracting…${RESET}`);

  const extracted = await mapWithConcurrency(
    graded,
    CONCURRENCY,
    async (answer, index): Promise<Extracted | null> => {
      try {
        const raw = await claudeJson({
          stable,
          variable: extractionAnswer(
            { studentRef: answer.studentId, text: answer.answer },
            `submission-${index + 1}`,
          ),
          schema: ExtractionSchema,
          effort: "low",
          onUsage: (usage) => usages.push(usage),
        });
        return {
          studentRef: answer.studentId,
          answer: answer.answer,
          authored: answer.errorSignature!,
          truth: answer.clusterId ?? "unknown",
          // Deliberately the raw signature, before normaliseExtraction discards
          // a malformed one. A high discard rate is the §11 risk materialising,
          // and measuring after the guard would hide exactly that.
          produced: (raw.error_signature ?? "").trim(),
        };
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
        return null;
      }
    },
  );

  process.stdout.write("\r\x1b[K");

  const rows = extracted.filter((row): row is Extracted => row !== null);
  if (rows.length === 0) {
    console.error(`Every extraction failed. First error: ${failures[0]}`);
    process.exit(1);
  }
  if (failures.length > 0) {
    console.log(
      `${YELLOW}${failures.length} of ${graded.length} answers failed to extract.${RESET} ${DIM}First: ${failures[0]}${RESET}`,
    );
    console.log();
  }

  /* --- 1. Do they name beliefs at all? ----------------------------- */

  const verdicts = rows.map((row) => ({
    row,
    verdict: judgeSignatureShape(row.produced),
  }));
  const named = verdicts.filter((v) => v.verdict.ok);
  const beliefRate = named.length / rows.length;

  console.log(`${BOLD}1. Named a belief${RESET}`);
  console.log(
    `   ${tone(beliefRate, BELIEF_RATE_FLOOR)}${bar(beliefRate)} ${(beliefRate * 100).toFixed(0)}%${RESET}` +
      `  ${DIM}${named.length}/${rows.length}${RESET}`,
  );

  const rejected = verdicts.filter((v) => !v.verdict.ok);
  if (rejected.length > 0) {
    console.log();
    for (const { row, verdict } of rejected.slice(0, 8)) {
      console.log(`   ${RED}✗${RESET} ${row.produced || DIM + "(empty)" + RESET}`);
      console.log(`     ${DIM}${verdict.reason}${RESET}`);
    }
    if (rejected.length > 8) {
      console.log(`   ${DIM}…and ${rejected.length - 8} more${RESET}`);
    }
  }
  console.log();

  /* --- 2. Did they name the belief that was there? ------------------ */

  // Embedded together in one batch so the produced and authored signatures
  // land in the same vector space on the same call.
  const vectors = await embedTexts([
    ...rows.map((r) => r.produced || "(none)"),
    ...rows.map((r) => r.authored),
  ]);
  const produced = vectors.slice(0, rows.length);
  const authored = vectors.slice(rows.length);

  const similarities = rows.map(
    (_, i) => 1 - cosineDistance(produced[i], authored[i]),
  );
  const agreed = similarities.filter((s) => s >= AGREEMENT_THRESHOLD).length;
  const agreementRate = agreed / rows.length;
  const meanSimilarity =
    similarities.reduce((sum, s) => sum + s, 0) / similarities.length;

  console.log(`${BOLD}2. Matched the authored belief${RESET}`);
  console.log(
    `   ${tone(agreementRate, 0.8)}${bar(agreementRate)} ${(agreementRate * 100).toFixed(0)}%${RESET}` +
      `  ${DIM}${agreed}/${rows.length} at cosine ≥ ${AGREEMENT_THRESHOLD}, mean ${meanSimilarity.toFixed(3)}${RESET}`,
  );

  const worst = rows
    .map((row, i) => ({ row, similarity: similarities[i] }))
    .sort((a, b) => a.similarity - b.similarity)
    .slice(0, 3);
  console.log();
  for (const { row, similarity } of worst) {
    console.log(`   ${DIM}${similarity.toFixed(2)}${RESET}  authored: ${DIM}${row.authored}${RESET}`);
    console.log(`         produced: ${row.produced || DIM + "(empty)" + RESET}`);
  }
  console.log();

  /* --- 3. Do they still group the class correctly? ------------------ */

  const truth = rows.map((r) => r.truth);
  const groupsFromProduced = agglomerativeCluster(produced, DISTANCE_THRESHOLD)
    .filter((g) => g.length >= MIN_CLUSTER_SIZE);
  const groupsFromAuthored = agglomerativeCluster(authored, DISTANCE_THRESHOLD)
    .filter((g) => g.length >= MIN_CLUSTER_SIZE);

  const live = pairwiseScore(groupsFromProduced, truth);
  const floor = pairwiseScore(groupsFromAuthored, truth);

  console.log(`${BOLD}3. Grouped the class${RESET} ${DIM}— at DISTANCE_THRESHOLD ${DISTANCE_THRESHOLD}${RESET}`);
  console.log(
    `   ${DIM}extracted${RESET}  ${bar(live.f1)} F1 ${live.f1.toFixed(3)}  ` +
      `${DIM}P ${live.precision.toFixed(2)} R ${live.recall.toFixed(2)} · ${groupsFromProduced.length} groups${RESET}`,
  );
  console.log(
    `   ${DIM}authored   ${bar(floor.f1)} F1 ${floor.f1.toFixed(3)}  ` +
      `P ${floor.precision.toFixed(2)} R ${floor.recall.toFixed(2)} · ${groupsFromAuthored.length} groups${RESET}`,
  );
  console.log(
    `   ${DIM}The authored row is the ceiling this stage could reach, not a${RESET}`,
  );
  console.log(
    `   ${DIM}target: it is what perfect extraction would score here.${RESET}`,
  );
  console.log();

  /* --- 4. Cost, and whether the cached prefix worked ---------------- */

  const totals = usages.reduce(
    (sum, u) => ({
      inputTokens: sum.inputTokens + u.inputTokens,
      outputTokens: sum.outputTokens + u.outputTokens,
      cacheReadTokens: sum.cacheReadTokens + u.cacheReadTokens,
      cacheWriteTokens: sum.cacheWriteTokens + u.cacheWriteTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
  const billedInput = totals.inputTokens + totals.cacheWriteTokens;
  const cacheShare =
    totals.cacheReadTokens / Math.max(1, totals.cacheReadTokens + billedInput);

  console.log(`${BOLD}4. Cost${RESET}`);
  console.log(
    `   ${DIM}input ${totals.inputTokens} · output ${totals.outputTokens} · ` +
      `cache write ${totals.cacheWriteTokens} · cache read ${totals.cacheReadTokens}${RESET}`,
  );
  if (totals.cacheReadTokens === 0 && usages.length > 1) {
    console.log(
      `   ${RED}The cached prefix never hit.${RESET} ${DIM}The scheme is being paid for`,
    );
    console.log(
      `   once per answer. Either the prefix is below this model's minimum`,
    );
    console.log(`   cacheable length, or something in it varies per call.${RESET}`);
  } else {
    console.log(
      `   ${GREEN}${(cacheShare * 100).toFixed(0)}% of input served from cache${RESET}` +
        ` ${DIM}across ${usages.length} calls${RESET}`,
    );
  }
  console.log();

  /* --- Verdict ------------------------------------------------------ */

  const passed = beliefRate >= BELIEF_RATE_FLOOR;
  console.log(
    passed
      ? `${GREEN}${BOLD}Extraction is naming beliefs.${RESET} ${DIM}§11's fatal mode is not firing.${RESET}`
      : `${RED}${BOLD}Extraction is describing answers, not naming beliefs.${RESET}`,
  );
  if (!passed) {
    console.log(
      `${DIM}This is the failure PRD §11 calls fatal. The rejected signatures`,
    );
    console.log(
      `above say which way the prompt is slipping — fix EXTRACTION_SYSTEM in`,
    );
    console.log(`lib/pipeline/prompts.ts before tuning anything downstream.${RESET}`);
  }
  console.log();

  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => {
  console.error("\nMeasurement failed:", error);
  process.exit(1);
});
