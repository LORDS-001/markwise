/**
 * Sweeps the clustering distance threshold — PRD §8, §10.
 *
 * Extraction is the expensive stage and clustering is deterministic given the
 * embeddings, so this separates them: embed the signatures once, then try
 * every threshold locally for free. Sweeping by re-running the whole pipeline
 * would cost 40 model calls per candidate value.
 *
 *   npm run pipeline:tune                     # authored signatures, as a floor
 *   npm run pipeline:tune -- --json run.json --labels human-labels.json
 *
 * Scored against the known grouping with pairwise precision/recall: of every
 * pair of answers the threshold puts together, how many genuinely share a
 * belief, and of every pair that genuinely shares one, how many were caught.
 * A single number for "are these clusters right" is what makes the choice
 * defensible rather than eyeballed.
 */

import { readFile } from "node:fs/promises";
import { ANSWERS } from "@/lib/mock";
import { agglomerativeCluster } from "@/lib/pipeline/cluster";
import { EMBEDDING_MODEL, embedTexts, isPipelineConfigured } from "@/lib/pipeline/gemini";
import { samplesFromExport, type TuningSample } from "@/lib/pipeline/tuning";

const ESC = "\x1b";
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const GREEN = `${ESC}[32m`;

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? (process.argv[index + 1] ?? null) : null;
}

type Sample = TuningSample;

async function loadSamples(): Promise<{ samples: Sample[]; source: string }> {
  const jsonPath = arg("json");

  if (jsonPath) {
    const labelsPath = arg("labels");
    if (!labelsPath) {
      throw new Error(
        "Exported runs require --labels with independently assigned human groups.",
      );
    }
    const raw = JSON.parse(await readFile(jsonPath, "utf8")) as unknown;
    const labels = JSON.parse(await readFile(labelsPath, "utf8")) as Record<
      string,
      unknown
    >;
    const samples = samplesFromExport(raw, labels);
    return {
      samples,
      source: `${jsonPath} (signatures) + ${labelsPath} (human truth)`,
    };
  }

  const samples = ANSWERS.filter((a) => !a.isCorrect && a.errorSignature).map(
    (a) => ({ signature: a.errorSignature!, truth: a.clusterId ?? "unknown" }),
  );
  return { samples, source: "seeded class (authored signatures)" };
}

/** Pairwise precision, recall and F1 against the known grouping. */
function score(groups: number[][], truth: string[]) {
  const assigned = new Array<number>(truth.length).fill(-1);
  groups.forEach((group, g) => group.forEach((i) => (assigned[i] = g)));

  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  for (let i = 0; i < truth.length; i += 1) {
    for (let j = i + 1; j < truth.length; j += 1) {
      const together = assigned[i] === assigned[j];
      // Singletons in the same one-off bucket do not genuinely share a belief,
      // so pairs inside it are not counted as pairs that should be together.
      const shouldBeTogether = truth[i] === truth[j] && truth[i] !== "cl-other";
      if (together && shouldBeTogether) truePositive += 1;
      else if (together && !shouldBeTogether) falsePositive += 1;
      else if (!together && shouldBeTogether) falseNegative += 1;
    }
  }

  const precision = truePositive / Math.max(1, truePositive + falsePositive);
  const recall = truePositive / Math.max(1, truePositive + falseNegative);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function bar(value: number, width = 18) {
  const filled = Math.round(value * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
}

async function main() {
  if (!isPipelineConfigured()) {
    console.error("GEMINI_API_KEY is not set.");
    process.exit(1);
  }

  const { samples, source } = await loadSamples();
  if (samples.length < 2) {
    console.error("Need at least two diagnosed answers to tune against.");
    process.exit(1);
  }

  console.log();
  console.log(`${BOLD}Threshold sweep${RESET}`);
  console.log(`${DIM}source: ${source}${RESET}`);
  console.log(`${DIM}signatures: ${samples.length} · embedding: ${EMBEDDING_MODEL}${RESET}`);
  console.log();

  const vectors = await embedTexts(samples.map((s) => s.signature));
  const truth = samples.map((s) => s.truth);
  const realGroups = new Set(truth.filter((t) => t !== "cl-other")).size;

  console.log(
    `${DIM}threshold  groups  ${"precision".padEnd(19)}${"recall".padEnd(19)}F1${RESET}`,
  );

  let best = { threshold: 0, f1: -1, groups: 0 };

  for (let t = 0.04; t <= 0.62001; t += 0.02) {
    const groups = agglomerativeCluster(vectors, t);
    const real = groups.filter((g) => g.length >= 2);
    const { precision, recall, f1 } = score(real, truth);

    if (f1 > best.f1) best = { threshold: t, f1, groups: real.length };

    console.log(
      `   ${t.toFixed(2)}      ${String(real.length).padStart(2)}    ` +
        `${bar(precision)} ${precision.toFixed(2)}  ` +
        `${bar(recall)} ${recall.toFixed(2)}  ` +
        `${f1.toFixed(3)}`,
    );
  }

  console.log();
  console.log(
    `${GREEN}${BOLD}Best: ${best.threshold.toFixed(2)}${RESET} ` +
      `— F1 ${best.f1.toFixed(3)}, ${best.groups} groups ` +
      `${DIM}(the known grouping has ${realGroups})${RESET}`,
  );
  console.log(
    `${DIM}Set DISTANCE_THRESHOLD in lib/pipeline/cluster.ts.${RESET}`,
  );
  console.log(
    `${DIM}Prefer precision over recall when they tie: a cluster that is wrong${RESET}`,
  );
  console.log(
    `${DIM}on stage costs more than one the lecturer has to merge by hand.${RESET}`,
  );
  console.log();
}

main().catch((error) => {
  console.error("\nSweep failed:", error);
  process.exit(1);
});
