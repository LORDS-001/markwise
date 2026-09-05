import type { SupabaseClient } from "@supabase/supabase-js";
import { gradeDiagnostic } from "@/lib/pipeline/grade-diagnostic";
import { isPipelineConfigured } from "@/lib/pipeline/gemini";
import { authorizeAiRequest } from "@/lib/server/ai-access";
import { getAdminClient } from "@/lib/supabase/admin";
import type { DiagnosticResponse, DiagnosticVerdict } from "@/lib/types";

export interface TrustedDiagnosticQuestion {
  prompt: string;
  holderAnswers: string;
  correctedAnswers: string;
}

export type SubmitDiagnosticResult =
  | {
      ok: true;
      recorded: true;
      graded: true;
      verdicts: { verdict: DiagnosticVerdict; rationale: string }[];
    }
  | { ok: false; error: string; recorded: boolean; graded: false };

interface Claim {
  status: "invalid" | "incomplete" | "busy" | "claimed" | "graded";
  claimId?: string;
  misconception?: string;
  questions?: TrustedDiagnosticQuestion[];
  responses?: string[];
  verdicts?: unknown;
}

function value<T>(data: unknown): T | null {
  const resolved = Array.isArray(data) ? data[0] : data;
  return resolved && typeof resolved === "object" ? (resolved as T) : null;
}

function isVerdict(value: unknown): value is DiagnosticVerdict {
  return value === "holds" || value === "corrected" || value === "unclear";
}

function verdicts(value: unknown): {
  verdict: DiagnosticVerdict;
  rationale: string;
}[] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const parsed = value.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as { verdict?: unknown; rationale?: unknown };
    if (!isVerdict(row.verdict) || typeof row.rationale !== "string") return null;
    return { verdict: row.verdict, rationale: row.rationale };
  });
  return parsed.every((entry) => entry !== null)
    ? (parsed as { verdict: DiagnosticVerdict; rationale: string }[])
    : null;
}

function claimed(claim: Claim): claim is Claim & {
  status: "claimed";
  claimId: string;
  misconception: string;
  questions: TrustedDiagnosticQuestion[];
  responses: string[];
} {
  return (
    claim.status === "claimed" &&
    typeof claim.claimId === "string" &&
    claim.claimId.length > 0 &&
    typeof claim.misconception === "string" &&
    claim.misconception.trim().length > 0 &&
    Array.isArray(claim.questions) &&
    claim.questions.length === 2 &&
    claim.questions.every(
      (question) =>
        typeof question?.prompt === "string" &&
        typeof question?.holderAnswers === "string" &&
        typeof question?.correctedAnswers === "string",
    ) &&
    Array.isArray(claim.responses) &&
    claim.responses.length === 2 &&
    claim.responses.every((response) => typeof response === "string")
  );
}

async function release(supabase: SupabaseClient, token: string, claimId: string) {
  try {
    await supabase.rpc("release_diagnostic_grading", {
      p_token: token,
      p_claim_id: claimId,
    });
  } catch {
    // The fenced claim expires after five minutes. A cleanup failure must not
    // erase the fact that the immutable student attempt was recorded.
  }
}

async function readSavedVerdicts(
  supabase: SupabaseClient,
  token: string,
): Promise<{ verdict: DiagnosticVerdict; rationale: string }[] | null> {
  const { data, error } = await supabase.rpc("diagnostic_for_token", {
    p_token: token,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  return verdicts((row as { responses?: unknown } | null)?.responses);
}

async function gradeSaved(
  token: string,
  supabase: SupabaseClient,
): Promise<SubmitDiagnosticResult> {
  if (!isPipelineConfigured()) {
    return {
      ok: false,
      recorded: true,
      graded: false,
      error: "Your answers were recorded. They could not be marked automatically yet.",
    };
  }

  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.rpc("claim_diagnostic_grading", {
      p_token: token,
    }));
  } catch {
    return {
      ok: false,
      recorded: true,
      graded: false,
      error: "Your answers were recorded, but marking could not be started.",
    };
  }
  const claim = value<Claim>(data);
  if (error || !claim) {
    return {
      ok: false,
      recorded: true,
      graded: false,
      error: "Your answers were recorded, but marking could not be started.",
    };
  }
  const existing = claim.status === "graded" ? verdicts(claim.verdicts) : null;
  if (existing) {
    return { ok: true, recorded: true, graded: true, verdicts: existing };
  }
  if (claim.status === "busy") {
    return {
      ok: false,
      recorded: true,
      graded: false,
      error: "Your answers are recorded and marking is already in progress.",
    };
  }
  if (!claimed(claim)) {
    return {
      ok: false,
      recorded: true,
      graded: false,
      error: "Your answers are recorded, but the saved diagnostic cannot be marked.",
    };
  }

  let access: Awaited<ReturnType<typeof authorizeAiRequest>>;
  try {
    access = await authorizeAiRequest("diagnostic", token);
  } catch {
    await release(supabase, token, claim.claimId);
    return {
      ok: false,
      recorded: true,
      graded: false,
      error: "Your answers were recorded, but marking is temporarily unavailable.",
    };
  }
  if (!access.ok) {
    await release(supabase, token, claim.claimId);
    return { ok: false, recorded: true, graded: false, error: access.error };
  }

  try {
    const result = await gradeDiagnostic({
      misconception: claim.misconception,
      questions: claim.questions,
      responses: claim.responses,
    });
    const graded = verdicts(result);
    if (!graded) throw new Error("The grader did not return two valid verdicts.");

    const { data: completed, error: completeError } = await access.supabase.rpc(
      "complete_diagnostic_grading",
      {
        p_token: token,
        p_claim_id: claim.claimId,
        p_verdicts: graded,
      },
    );
    if (completeError || completed !== true) {
      await release(access.supabase, token, claim.claimId);
      return {
        ok: false,
        recorded: true,
        graded: false,
        error: "Your answers were recorded, but their verdicts could not be saved.",
      };
    }

    const saved = await readSavedVerdicts(access.supabase, token);
    if (!saved) {
      return {
        ok: false,
        recorded: true,
        graded: false,
        error: "Your answers were marked, but the saved verdicts could not be confirmed.",
      };
    }
    return { ok: true, recorded: true, graded: true, verdicts: saved };
  } catch (gradingError) {
    await release(access.supabase, token, claim.claimId);
    return {
      ok: false,
      recorded: true,
      graded: false,
      error:
        gradingError instanceof Error
          ? `Your answers were recorded, but marking failed: ${gradingError.message}`
          : "Your answers were recorded, but marking failed.",
    };
  }
}

export async function submitSavedDiagnostic(params: {
  token: string;
  responses: string[];
}): Promise<SubmitDiagnosticResult> {
  const token = typeof params.token === "string" ? params.token.trim() : "";
  if (!token || token.length > 256) {
    return { ok: false, recorded: false, graded: false, error: "This link has an invalid code." };
  }
  if (
    !Array.isArray(params.responses) ||
    params.responses.length !== 2 ||
    params.responses.some(
      (response) =>
        typeof response !== "string" ||
        response.trim().length === 0 ||
        response.trim().length > 10_000,
    )
  ) {
    return {
      ok: false,
      recorded: false,
      graded: false,
      error: "Answer both questions using no more than 10,000 characters each.",
    };
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return {
      ok: false,
      recorded: false,
      graded: false,
      error: "Your answers could not be recorded because secure persistence is unavailable.",
    };
  }

  try {
    const { data, error } = await supabase.rpc("submit_diagnostic_attempt", {
      p_token: token,
      p_responses: params.responses.map((response) => response.trim()),
    });
    const result = value<{ status?: string }>(data);
    if (error || !result) throw new Error("submission failed");
    if (["invalid", "invalid_pack", "invalid_responses", "incomplete"].includes(result.status ?? "")) {
      return {
        ok: false,
        recorded: false,
        graded: false,
        error: "This diagnostic could not accept a complete attempt.",
      };
    }
    return gradeSaved(token, supabase);
  } catch {
    return {
      ok: false,
      recorded: false,
      graded: false,
      error: "Your answers could not be recorded. Try again.",
    };
  }
}

export async function retrySavedDiagnostic(token: string): Promise<SubmitDiagnosticResult> {
  token = typeof token === "string" ? token.trim() : "";
  if (!token || token.length > 256) {
    return { ok: false, recorded: false, graded: false, error: "This link has an invalid code." };
  }
  const supabase = getAdminClient();
  if (!supabase) {
    return {
      ok: false,
      recorded: true,
      graded: false,
      error: "Marking cannot be retried because secure persistence is unavailable.",
    };
  }
  return gradeSaved(token, supabase);
}

export async function readStudentDiagnostic(
  supabase: SupabaseClient,
  token: string,
): Promise<{
  clusterLabel: string;
  clusterWhy: string;
  lesson: { heading: string; body: string }[];
  questions: { prompt: string }[];
  responses: DiagnosticResponse[];
  status: "open" | "ungraded" | "grading" | "graded";
} | null> {
  token = typeof token === "string" ? token.trim() : "";
  if (token.length < 8 || token.length > 256) return null;
  const { data, error } = await supabase.rpc("diagnostic_for_token", { p_token: token });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as Record<string, unknown>;
  const questions = Array.isArray(row.questions)
    ? row.questions
        .filter((question) => typeof question?.prompt === "string")
        .map((question) => ({ prompt: String(question.prompt) }))
    : [];
  const responses = Array.isArray(row.responses)
    ? row.responses.map((response) => ({
        answerId: token,
        questionIndex: Number(response.questionIndex),
        responseText: String(response.responseText ?? ""),
        verdict: isVerdict(response.verdict) ? response.verdict : null,
        rationale: String(response.rationale ?? ""),
      }))
    : [];
  const rawStatus = row.grading_status;
  const status =
    rawStatus === "ungraded" || rawStatus === "grading" || rawStatus === "graded"
      ? rawStatus
      : "open";
  return {
    clusterLabel: String(row.cluster_label ?? ""),
    clusterWhy: String(row.cluster_why ?? ""),
    lesson: Array.isArray(row.lesson)
      ? (row.lesson as { heading: string; body: string }[])
      : [],
    questions,
    responses,
    status,
  };
}
