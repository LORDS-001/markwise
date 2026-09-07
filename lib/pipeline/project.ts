import { cosineDistance } from "./cluster";

/**
 * Projects high-dimensional cluster centroids onto a plane — PRD §7.4, which
 * asks for bubbles "positioned by embedding-space proximity so related
 * misconceptions sit near each other".
 *
 * Classical multidimensional scaling: build the matrix of pairwise distances,
 * double-centre it, and take the two leading eigenvectors. That is the
 * projection which best preserves the distances actually measured, rather than
 * a layout that merely looks arranged.
 *
 * Written by hand for the same reason the clustering is: a handful of points
 * needs no library, and the positions are then explainable on stage.
 */

/** The mean of a set of vectors — a cluster's position in embedding space. */
export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dimensions = vectors[0].length;
  const sum = new Array<number>(dimensions).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dimensions; i += 1) sum[i] += vector[i] ?? 0;
  }
  return sum.map((total) => total / vectors.length);
}

export interface PlanePoint {
  x: number;
  y: number;
}

/**
 * Finds the leading eigenvector of a symmetric matrix by power iteration,
 * returning its eigenvalue too.
 *
 * Deterministic: the starting vector is fixed rather than random, so the same
 * clusters always land in the same place. A map that reshuffled between two
 * visits to the same run would read as instability in the analysis.
 */
function leadingEigen(
  matrix: number[][],
  iterations = 128,
): { vector: number[]; value: number } {
  const n = matrix.length;
  // A fixed, non-uniform seed. A uniform one is orthogonal to the leading
  // eigenvector of some centred matrices and would converge to nothing.
  let vector = Array.from({ length: n }, (_, i) => Math.cos(i + 1));

  for (let step = 0; step < iterations; step += 1) {
    const next = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) {
      let total = 0;
      for (let j = 0; j < n; j += 1) total += matrix[i][j] * vector[j];
      next[i] = total;
    }

    const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
    if (norm < 1e-12) return { vector: new Array<number>(n).fill(0), value: 0 };

    vector = next.map((x) => x / norm);
  }

  // Rayleigh quotient gives the signed eigenvalue; the norm above is |λ|.
  let quotient = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) quotient += vector[i] * matrix[i][j] * vector[j];
  }

  return { vector, value: quotient };
}

/** Removes a found component so the next iteration finds the following one. */
function deflate(matrix: number[][], vector: number[], value: number): number[][] {
  return matrix.map((row, i) =>
    row.map((cell, j) => cell - value * vector[i] * vector[j]),
  );
}

/**
 * Lays centroids out on the unit square, preserving their relative distances
 * as closely as two dimensions allow.
 *
 * Coordinates are normalised to 0..1 so the map can scale them to whatever
 * canvas it has. Fewer than three points have no meaningful projection, so
 * they are spread evenly instead of being stacked at one spot.
 */
export function projectToPlane(vectors: number[][]): PlanePoint[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0.5, y: 0.5 }];
  if (n === 2) {
    return [
      { x: 0.25, y: 0.5 },
      { x: 0.75, y: 0.5 },
    ];
  }

  // Squared distances, as classical MDS requires.
  const squared = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 0;
      const d = cosineDistance(vectors[i], vectors[j]);
      return d * d;
    }),
  );

  // Double-centring: B = -0.5 · J·D²·J, with J the centring matrix. This turns
  // distances into inner products, which is what has eigenvectors to take.
  const rowMean = squared.map((row) => row.reduce((s, x) => s + x, 0) / n);
  const grandMean = rowMean.reduce((s, x) => s + x, 0) / n;
  const centred = squared.map((row, i) =>
    row.map((cell, j) => -0.5 * (cell - rowMean[i] - rowMean[j] + grandMean)),
  );

  const first = leadingEigen(centred);
  const second = leadingEigen(deflate(centred, first.vector, first.value));

  // Coordinates are the eigenvectors scaled by the square root of their
  // eigenvalues. A negative eigenvalue means that axis carries no real
  // variance, so it collapses to zero rather than producing a fake spread.
  const scale = (value: number) => (value > 0 ? Math.sqrt(value) : 0);
  const xs = first.vector.map((v) => v * scale(first.value));
  const ys = second.vector.map((v) => v * scale(second.value));

  return normalise(xs, ys);
}

/** Fits both axes into 0..1, keeping the aspect ratio of the projection. */
function normalise(xs: number[], ys: number[]): PlanePoint[] {
  const spanOf = (values: number[]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { min, max, span: max - min };
  };

  const x = spanOf(xs);
  const y = spanOf(ys);
  // One shared scale, so a set of clusters that genuinely varies more along
  // one axis still looks that way instead of being stretched to fill a square.
  const span = Math.max(x.span, y.span);

  if (span < 1e-9) {
    // Every centroid landed in the same place. Spread them on a circle rather
    // than stacking them, which would render as one bubble hiding the rest.
    return xs.map((_, i) => {
      const angle = (2 * Math.PI * i) / xs.length;
      return {
        x: 0.5 + 0.35 * Math.cos(angle),
        y: 0.5 + 0.35 * Math.sin(angle),
      };
    });
  }

  const centreOffset = (value: number, axis: { min: number; span: number }) =>
    (value - axis.min) / span + (span - axis.span) / (2 * span);

  return xs.map((value, i) => ({
    x: clamp01(centreOffset(value, x)),
    y: clamp01(centreOffset(ys[i], y)),
  }));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
