/**
 * Judges whether an error signature names a belief or merely describes an
 * answer — the failure PRD §11 calls fatal.
 *
 * "Student wrote the wrong formula" will not cluster with anything, because
 * two students holding the same misconception describe their answers
 * differently. "Believes reactance does not contribute to opposition" will,
 * because they hold the same proposition. Nothing downstream can recover a
 * signature that came back in the first shape, so this is measured directly
 * rather than inferred from how well the clustering happened to do.
 *
 * normaliseExtraction already discards a malformed signature at runtime. That
 * makes the product safe, not the prompt good: a run where most signatures are
 * discarded is a run diagnosing almost nobody, and it looks from the outside
 * like a class that simply had few shared errors. This judges what the model
 * actually produced, before the guard hides it.
 */

export interface SignatureVerdict {
  ok: boolean;
  /** Why it was rejected, phrased as the thing to fix. Null when accepted. */
  reason: string | null;
}

/**
 * The description-shaped phrasings the extraction prompt explicitly rejects.
 *
 * Taken from the prompt's own BAD list rather than invented here, so the
 * measurement and the instruction cannot drift apart: if the prompt starts
 * tolerating one of these, this test fails and says so.
 */
const DESCRIPTIONS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\bused? (?:the )?wrong\b|\bwrong (?:formula|equation|method)\b/i,
    reason: "names a wrong step without saying what the student thought it meant",
  },
  {
    // Only when the student is the subject. A negation about the subject
    // matter is a perfectly good belief — "reactance does not contribute to
    // opposition" is the claim to argue with, and the prompt lists it as a
    // model answer. What fails is a negation about the student's conduct.
    pattern:
      /\b(?:they|he|she|the student|the candidate)\s+(?:did ?n[o']t|does ?n[o']t|failed to|forgot to|omitted|never)\b/i,
    reason: "describes what the student did not do, which is a behaviour not a belief",
  },
  {
    pattern: /^(?:did ?n[o']t|failed to|forgot to|omitted)\b/i,
    reason: "describes what the answer lacked, which is a behaviour not a belief",
  },
  {
    pattern: /\b(?:calculation|arithmetic|computational|rounding) (?:error|mistake)\b/i,
    reason: "names an outcome rather than the belief that produced it",
  },
  {
    pattern: /\b(?:incomplete|unclear|vague|insufficient|poorly explained)\b/i,
    reason: "grades the answer's quality instead of naming a proposition",
  },
  {
    pattern: /\bmisunderstood\b|\bmisread\b|\bconfused about\b|\bunsure (?:about|of)\b/i,
    reason: "restates that the student was wrong without saying what they hold true",
  },
  {
    pattern: /\bshould have\b|\bought to have\b/i,
    reason: "states the correction rather than the belief being corrected",
  },
];

/** Words that carry no claim, so a signature made only of them asserts nothing. */
const EMPTY = /^(?:that\s+)?(?:the\s+)?(?:answer|question|student|it|this)\b/i;

export const SIGNATURE_MAX_LENGTH = 500;

/**
 * Accepts a signature only if it states something arguable.
 *
 * Deliberately strict about shape and silent about truth: whether the belief
 * is the one this student actually held is a judgement the authored pilot
 * class answers, not a regular expression.
 */
export function judgeSignatureShape(signature: string): SignatureVerdict {
  const trimmed = signature.trim();

  if (trimmed.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.length > SIGNATURE_MAX_LENGTH) {
    return { ok: false, reason: `longer than ${SIGNATURE_MAX_LENGTH} characters` };
  }
  if (!/^believes\s+\S/i.test(trimmed)) {
    return {
      ok: false,
      reason: "does not begin with \"believes\", so it is not stated as a belief",
    };
  }

  const claim = trimmed.replace(/^believes\s+/i, "");
  if (claim.split(/\s+/).length < 3) {
    return { ok: false, reason: "too short to name a proposition" };
  }
  if (EMPTY.test(claim)) {
    return {
      ok: false,
      reason: "refers to the answer rather than to the world",
    };
  }

  for (const { pattern, reason } of DESCRIPTIONS) {
    if (pattern.test(claim)) return { ok: false, reason };
  }

  return { ok: true, reason: null };
}

/**
 * Share of signatures that name a belief.
 *
 * Reported as a rate because one bad signature is noise and a third of them
 * is the product failing: the map is drawn from whatever survived, and
 * nothing on screen says how much did not.
 */
export function beliefRate(signatures: string[]): number {
  if (signatures.length === 0) return 1;
  const ok = signatures.filter((s) => judgeSignatureShape(s).ok).length;
  return ok / signatures.length;
}
