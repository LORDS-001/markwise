import type { DiagnosticResponse } from "./types";

/**
 * Diagnostic responses, shared between the student's page and the lecturer's
 * outcome screen.
 *
 * localStorage rather than sessionStorage, and deliberately: the student opens
 * their link in a different tab from the one the lecturer is watching, and
 * sessionStorage is per-tab. Without this the outcome screen would never see a
 * submission on a deployment with no database.
 *
 * This is the fallback path. When Supabase is configured the responses are
 * also written there, and that copy is the durable one — this survives only as
 * long as the browser.
 */

const STORAGE_KEY = "markwise:diagnostics";

function isDiagnosticResponse(value: unknown): value is DiagnosticResponse {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.answerId === "string" &&
    row.answerId.length > 0 &&
    typeof row.questionIndex === "number" &&
    Number.isInteger(row.questionIndex) &&
    row.questionIndex >= 0 &&
    typeof row.responseText === "string" &&
    (row.verdict === null ||
      row.verdict === "holds" ||
      row.verdict === "corrected" ||
      row.verdict === "unclear") &&
    typeof row.rationale === "string"
  );
}

export function readDiagnosticResponses(): DiagnosticResponse[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDiagnosticResponse) : [];
  } catch {
    // Blocked storage, private browsing, or a corrupt entry. An empty set is
    // the honest answer: nothing measured rather than something invented.
    return [];
  }
}

/**
 * Records one student's answers, replacing any earlier attempt at the same
 * question so a re-submission does not double-count them.
 */
export function recordDiagnosticResponses(
  incoming: DiagnosticResponse[],
): { ok: boolean; responses: DiagnosticResponse[] } {
  if (typeof window === "undefined") return { ok: false, responses: incoming };

  const existing = readDiagnosticResponses();
  const key = (r: DiagnosticResponse) => `${r.answerId}#${r.questionIndex}`;
  const replaced = new Set(incoming.map(key));
  const merged = [...existing.filter((r) => !replaced.has(key(r))), ...incoming];

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return { ok: true, responses: merged };
  } catch {
    // Over quota or blocked. The caller must not claim this was saved.
    return { ok: false, responses: existing };
  }
}

export function clearDiagnosticResponses(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}

/** Fires when another tab records a response, so the outcome screen updates. */
export function subscribeToDiagnostics(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
