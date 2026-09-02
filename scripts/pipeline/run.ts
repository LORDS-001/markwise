/**
 * Week 1 deliverable — the pipeline as a bare script with console output.
 *
 * PRD §10: "Build the pipeline as a bare script with console output — no UI.
 * Iterate the extraction prompt and the distance threshold until clusters look
 * right on the real 40." This is that script, and it stays in the repo after
 * the UI exists because tuning the threshold is not a one-off job — every new
 * subject is a new distribution.
 *
 *   npm run pipeline                        # seeded demo class
 *   npm run pipeline -- --csv answers.csv   # a CSV of your own
 *   npm run pipeline -- --threshold 0.28    # sweep the distance threshold
 *   npm run pipeline -- --json out.json     # dump the full result
 *   npm run pipeline -- --limit 12          # first N answers, to save quota
 *
 * Requires ANTHROPIC_API_KEY and GEMINI_API_KEY in .env.local — Claude runs
 * the generative stages, Gemini embeds the signatures.
 */

import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { CRITERIA, SESSION, ANSWERS } from "@/lib/mock";
import { CLAUDE_MODEL } from "@/lib/pipeline/claude";
import { EMBEDDING_MODEL } from "@/lib/pipeline/gemini";
import { isPipelineConfigured, missingPipelineKeys } from "@/lib/pipeline/config";
import { answersFromCsv } from "@/lib/pipeline/parse-answers";
import { runPipeline } from "@/lib/pipeline/run";
import type { PipelineInput, RawAnswer, StageId } from "@/lib/pipeline/types";

const DEMO_SCHEME =
  "Full marks require the reactance computed from X_L = 2πfL, the impedance combined in quadrature as Z = √(R² + X_L²), the current from I = V/Z, the phase angle from φ = arctan(X_L/R) stated as the angle between supply voltage and current, and correct units throughout.";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? (process.argv[index + 1] ?? null) : null;
}

function rule(char = "─") {
  console.log(DIM + char.repeat(72) + RESET);
}

async function loadAnswers(): Promise<RawAnswer[]> {
  const csvPath = arg("csv");
  let answers: RawAnswer[];

  if (!csvPath) {
    // The seeded pilot class (PRD §8) — 40 real answers, pseudonymised.
    answers = ANSWERS.map((a) => ({ studentRef: a.studentId, text: a.answer }));
  } else {
    const text = await readFile(csvPath, "utf8");
    answers = answersFromCsv(text);
    if (answers.length === 0) {
      throw new Error(`No answers found in ${csvPath}`);
    }
  }

  // Every Nth answer. A batch is usually stored grouped by the mistake behind
  // it, so the first N answers all share one belief and would cluster into one
  // group no matter what the threshold is. Striding spans the groups, which is
  // what actually tests whether the threshold discriminates.
  const stride = Number(arg("stride"));
  if (Number.isFinite(stride) && stride > 1) {
    answers = answers.filter((_, i) => i % stride === 0);
  }

  // Free-tier request quota is charged per day, per model, so checking whether
  // signatures read as beliefs should not have to cost a whole day's budget.
  const limit = Number(arg("limit"));
  return Number.isFinite(limit) && limit > 0 ? answers.slice(0, limit) : answers;
}

async function main() {
  if (!isPipelineConfigured()) {
    console.error(
      `${RED}Missing ${missingPipelineKeys().join(" and ")}.${RESET}\n` +
        `Add to .env.local, then re-run. This script makes real API calls.\n` +
        `Claude runs the generative stages; Gemini embeds the signatures.`,
    );
    process.exit(1);
  }

  const answers = await loadAnswers();
  const thresholdArg = arg("threshold");

  const input: PipelineInput = {
    question: SESSION.question,
    scheme: DEMO_SCHEME,
    criteria: CRITERIA,
    subject: SESSION.subject,
    level: SESSION.level,
    answers,
  };

  console.log();
  console.log(`${BOLD}Markwise pipeline${RESET} ${DIM}(bare run, no UI)${RESET}`);
  rule();
  console.log(`Question   ${SESSION.question.slice(0, 58)}…`);
  console.log(`Answers    ${answers.length}`);
  console.log(`Model      ${CLAUDE_MODEL} ${DIM}(embeddings: ${EMBEDDING_MODEL})${RESET}`);
  console.log(`Criteria   ${CRITERIA.length} (${input.criteria.reduce((s, c) => s + c.marks, 0)} marks)`);
  if (thresholdArg) console.log(`Threshold  ${thresholdArg} ${DIM}(overridden)${RESET}`);
  rule();
  console.log();

  const started = Date.now();
  const seen = new Set<StageId>();

  const result = await runPipeline(input, (event) => {
    if (!seen.has(event.stage)) {
      seen.add(event.stage);
      process.stdout.write(`${CYAN}▸${RESET} ${event.stage}`);
    }
    if (event.progress >= 1) {
      process.stdout.write(` ${DIM}${event.detail ?? "done"}${RESET}\n`);
    }
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log();
  rule("═");
  console.log(`${BOLD}Result${RESET} — ${elapsed}s wall clock`);
  rule("═");

  const correct = result.answers.filter((a) => a.isCorrect).length;
  const lowConfidence = result.answers.filter((a) => a.confidence < 0.7).length;
  const real = result.clusters.filter((c) => !c.isOther);

  console.log(
    `${correct} correct · ${result.answers.length - correct} with an error · ` +
      `${real.length} misconception${real.length === 1 ? "" : "s"} found`,
  );
  if (lowConfidence > 0) {
    console.log(
      `${YELLOW}${lowConfidence} answer(s) below 0.7 confidence — these would be flagged for review${RESET}`,
    );
  }
  console.log();

  for (const cluster of result.clusters) {
    const share = ((cluster.memberIds.length / result.answers.length) * 100).toFixed(0);
    const damage = cluster.severity * cluster.memberIds.length;
    console.log(
      `${BOLD}${cluster.label}${RESET}` + (cluster.isOther ? ` ${DIM}(bucket)${RESET}` : ""),
    );
    console.log(
      `  ${cluster.memberIds.length} students (${share}%) · severity ${cluster.severity} · damage ${damage}`,
    );
    if (cluster.why) console.log(`  ${DIM}why: ${cluster.why}${RESET}`);
    if (cluster.downstream.length > 0) {
      console.log(`  ${DIM}breaks: ${cluster.downstream.join(", ")}${RESET}`);
    }

    // The signatures are the tuning surface. If these read as descriptions
    // rather than beliefs, fix the prompt before touching the threshold.
    const members = result.answers.filter((a) => cluster.memberIds.includes(a.id));
    for (const member of members.slice(0, 4)) {
      console.log(`    ${DIM}·${RESET} ${member.errorSignature ?? "(undiagnosed)"}`);
    }
    if (members.length > 4) {
      console.log(`    ${DIM}… and ${members.length - 4} more${RESET}`);
    }
    console.log();
  }

  const jsonPath = arg("json");
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");
    console.log(`${DIM}Full result written to ${jsonPath}${RESET}`);
  }
}

main().catch((error) => {
  console.error(`\n${RED}Pipeline failed:${RESET}`, error);
  process.exit(1);
});
