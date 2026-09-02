/**
 * Agglomerative (bottom-up) clustering on cosine distance — PRD §6 step 3.
 *
 * Not k-means: the number of misconceptions in a class is unknown ahead of
 * time and is precisely the thing being discovered, so fixing k would
 * presuppose the answer. A distance threshold does not.
 *
 * Written by hand rather than pulled from a service. Under 100 answers the
 * exact O(n³) algorithm is far below anything a lecturer would notice, and
 * keeping it in-process means the whole product ships on one deployment.
 */

/** Cosine distance in [0, 2]. Zero vectors are treated as maximally distant. */
export function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineDistance: dimension mismatch (${a.length} vs ${b.length})`,
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 1;
  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // Guard against the float drift that puts similarity a hair outside [-1, 1].
  return 1 - Math.min(1, Math.max(-1, similarity));
}

/**
 * Groups vector indices by average-linkage agglomerative clustering.
 *
 * Merges the closest pair of clusters until no pair is within `threshold`.
 * Distances between merged clusters are updated by the Lance-Williams formula,
 * which is exact for average linkage (UPGMA) — the alternative, recomputing
 * every pairwise mean from scratch, gives identical results far more slowly.
 *
 * Returns groups ordered largest first, each group's indices ascending.
 */
export function agglomerativeCluster(
  vectors: number[][],
  threshold: number,
): number[][] {
  if (vectors.length === 0) return [];
  if (vectors.length === 1) return [[0]];

  const n = vectors.length;
  // Live clusters, addressed by their original slot. `members[i] === null`
  // means slot i was absorbed by an earlier merge.
  const members: (number[] | null)[] = vectors.map((_, i) => [i]);
  const distance: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = cosineDistance(vectors[i], vectors[j]);
      distance[i][j] = d;
      distance[j][i] = d;
    }
  }

  for (;;) {
    let bestA = -1;
    let bestB = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < n; i += 1) {
      if (members[i] === null) continue;
      for (let j = i + 1; j < n; j += 1) {
        if (members[j] === null) continue;
        if (distance[i][j] < bestDistance) {
          bestDistance = distance[i][j];
          bestA = i;
          bestB = j;
        }
      }
    }

    if (bestA === -1 || bestDistance > threshold) break;

    const groupA = members[bestA]!;
    const groupB = members[bestB]!;
    const sizeA = groupA.length;
    const sizeB = groupB.length;

    // Lance-Williams average linkage, applied before the merge so the sizes
    // used as weights are still the pre-merge ones.
    for (let k = 0; k < n; k += 1) {
      if (k === bestA || k === bestB || members[k] === null) continue;
      const merged =
        (sizeA * distance[bestA][k] + sizeB * distance[bestB][k]) /
        (sizeA + sizeB);
      distance[bestA][k] = merged;
      distance[k][bestA] = merged;
    }

    members[bestA] = [...groupA, ...groupB].sort((x, y) => x - y);
    members[bestB] = null;
  }

  return members
    .filter((group): group is number[] => group !== null)
    .sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/**
 * The distance threshold, tuned on the 40-answer pilot set (PRD §8).
 *
 * Raising it merges distinct beliefs into one vague cluster; lowering it
 * shatters a real shared belief into singletons that the "Other" bucket then
 * swallows. Re-tune here, against real answers, never against synthetic ones.
 */
export const DISTANCE_THRESHOLD = 0.32;

/**
 * Groups smaller than this are not a class-level pattern. They are collected
 * into the "Other / one-off errors" bucket rather than shown as clusters,
 * per PRD §6 step 4.
 */
export const MIN_CLUSTER_SIZE = 2;
