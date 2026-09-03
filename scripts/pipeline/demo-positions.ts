/**
 * Computes the seeded class's cluster positions once, so the demo shows the
 * embedding-space map rather than falling back to a grid.
 *
 * These are real projections of the demo's own signatures — not decorative
 * coordinates. Baking them in keeps the demo working with no API key, which is
 * what stops a missing environment variable taking the live URL down.
 *
 *   npm run pipeline:demo-positions
 *
 * Costs one embedding call. Re-run only if the seeded signatures change.
 */

import { ANSWERS, CLUSTERS } from "@/lib/mock";
import { embedTexts, isPipelineConfigured } from "@/lib/pipeline/gemini";
import { centroid, projectToPlane } from "@/lib/pipeline/project";

async function main() {
  if (!isPipelineConfigured()) {
    console.error("GEMINI_API_KEY is not set.");
    process.exit(1);
  }

  // The one-off bucket holds answers that share no belief, so it has no
  // position in belief space and is left off the projection.
  const real = CLUSTERS.filter((c) => !c.isOther);

  const signaturesPerCluster = real.map((cluster) =>
    ANSWERS.filter(
      (a) => a.clusterId === cluster.id && a.errorSignature,
    ).map((a) => a.errorSignature!),
  );

  const flat = signaturesPerCluster.flat();
  console.log(`Embedding ${flat.length} signatures across ${real.length} clusters…`);
  const vectors = await embedTexts(flat);

  let cursor = 0;
  const centroids = signaturesPerCluster.map((signatures) => {
    const slice = vectors.slice(cursor, cursor + signatures.length);
    cursor += signatures.length;
    return centroid(slice);
  });

  const points = projectToPlane(centroids);

  console.log("\nPaste into CLUSTER_SPEC in lib/mock.ts:\n");
  real.forEach((cluster, i) => {
    console.log(
      `  ${cluster.id}:  x: ${points[i].x.toFixed(4)}, y: ${points[i].y.toFixed(4)}`,
    );
  });
  console.log();
}

main().catch((error) => {
  console.error("\nFailed:", error);
  process.exit(1);
});
