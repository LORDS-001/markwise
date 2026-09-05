"use server";

import type {
  Cluster,
  DiagnosticResponse,
  ReteachPack,
  ReviewStatus,
  StudentAnswer,
} from "@/lib/types";
import type { PipelineInput } from "@/lib/pipeline/types";
import { isPipelineConfigured } from "@/lib/pipeline/gemini";
import { generateReteachPack, otherBucketPack } from "@/lib/pipeline/reteach";
import {
  readStudentDiagnostic,
  retrySavedDiagnostic,
  submitSavedDiagnostic,
  type SubmitDiagnosticResult as SecureSubmitDiagnosticResult,
} from "@/lib/db/diagnostics";
import { authorizeAiRequest } from "@/lib/server/ai-access";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Server actions — every mutation in the app, per PRD §9.
 *
 * All of them degrade rather than throw when Supabase is unconfigured: the
 * seeded demo class must stay fully usable with no environment at all, which
 * is what keeps the deployed demo alive if a variable goes missing during
 * judging (README, and PRD §11's "clusters look arbitrary on stage" mitigation
 * applies just as much to a screen that will not load).
 */

async function client() {
  try {
    return await getServerClient();
  } catch {
    return null;
  }
}

/** True when a real row id, rather than a provisional local one like "cl-1". */
function isPersistedId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/* ------------------------------------------------------------------ */
/*  Step 6 — reteach pack generation                                   */
/* ------------------------------------------------------------------ */

export type ReteachResult =
  | { ok: true; pack: ReteachPack }
  | { ok: false; error: string; code?: "not_configured" };

/**
 * Generates the micro-lesson and diagnostic for one cluster.
 *
 * The client supplies row references for a saved run. The marking context,
 * corrected cluster, and members are re-read through the verified lecturer
 * session before any quota is consumed.
 */
export async function generateReteachAction(params: {
  context: Omit<PipelineInput, "answers">;
  cluster: Cluster;
  members: StudentAnswer[];
  sessionId?: string | null;
}): Promise<ReteachResult> {
  const { cluster, sessionId } = params;

  if (cluster.isOther && !isPersistedId(cluster.id)) {
    return { ok: true, pack: otherBucketPack(cluster.id, cluster.memberIds.length) };
  }

  if (!sessionId || !isPersistedId(sessionId) || !isPersistedId(cluster.id)) {
    return {
      ok: false,
      error: "Save this run before generating a live reteach pack.",
    };
  }

  const supabase = await client();
  if (!supabase) {
    return { ok: false, error: "Secure persistence is unavailable." };
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false, error: "Sign in before opening a saved reteach pack." };
  }

  const [{ data: storedSession, error: sessionError }, { data: storedCluster, error: clusterError }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("id, question, marking_scheme, criteria, subject, level, max_score")
        .eq("id", sessionId)
        .maybeSingle(),
      supabase
        .from("clusters")
        .select("id, session_id, label, why, severity, downstream, tone, is_other")
        .eq("id", cluster.id)
        .eq("session_id", sessionId)
        .maybeSingle(),
    ]);
  if (sessionError || clusterError || !storedSession || !storedCluster) {
    return { ok: false, error: "The saved cluster context could not be loaded." };
  }

  const { data: storedMembers, error: memberError } = await supabase
    .from("answers")
    .select(
      "id, student_ref, initials, answer, is_correct, cluster_id, error_signature, evidence_span, confidence, provisional_score, criteria_met, criteria_missed, score_rationale, review_status",
    )
    .eq("session_id", sessionId)
    .eq("cluster_id", cluster.id);
  if (memberError || !storedMembers) {
    return { ok: false, error: "The saved cluster members could not be loaded." };
  }

  const trustedCluster: Cluster = {
    id: String(storedCluster.id),
    tone: Math.max(0, Math.min(6, Number(storedCluster.tone))) as Cluster["tone"],
    label: String(storedCluster.label),
    why: String(storedCluster.why ?? ""),
    severity: Math.max(1, Math.min(5, Number(storedCluster.severity ?? 1))),
    downstream: Array.isArray(storedCluster.downstream) ? storedCluster.downstream : [],
    isOther: Boolean(storedCluster.is_other),
    memberIds: storedMembers.map((member) => String(member.id)),
  };
  if (trustedCluster.isOther) {
    return {
      ok: true,
      pack: otherBucketPack(trustedCluster.id, trustedCluster.memberIds.length),
    };
  }
  if (!isPipelineConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "Reteach packs need GEMINI_API_KEY. The seeded demo class ships with its packs already written.",
    };
  }

  const access = await authorizeAiRequest("reteach");
  if (!access.ok) return { ok: false, error: access.error };
  const trustedContext: Omit<PipelineInput, "answers"> = {
    question: String(storedSession.question),
    scheme: String(storedSession.marking_scheme ?? ""),
    criteria: Array.isArray(storedSession.criteria) ? storedSession.criteria : [],
    subject: String(storedSession.subject ?? ""),
    level: String(storedSession.level ?? ""),
  };
  const trustedMembers: StudentAnswer[] = storedMembers.map((member) => ({
    id: String(member.id),
    studentId: String(member.student_ref),
    initials: String(member.initials ?? "—"),
    answer: String(member.answer ?? ""),
    isCorrect: Boolean(member.is_correct),
    clusterId: String(member.cluster_id),
    errorSignature: member.error_signature ? String(member.error_signature) : null,
    evidenceSpan: member.evidence_span ? String(member.evidence_span) : null,
    confidence: Number(member.confidence ?? 0),
    provisionalScore: Number(member.provisional_score ?? 0),
    maxScore: Number(storedSession.max_score ?? 10),
    criteriaMet: Array.isArray(member.criteria_met) ? member.criteria_met : [],
    criteriaMissed: Array.isArray(member.criteria_missed) ? member.criteria_missed : [],
    scoreRationale: String(member.score_rationale ?? ""),
    status: member.review_status as ReviewStatus,
  }));

  let pack: ReteachPack;
  try {
    pack = await generateReteachPack(
      { ...trustedContext, answers: [] },
      trustedCluster,
      trustedMembers,
    );
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The reteach pack could not be generated.",
    };
  }

  if (pack.lesson.length === 0) {
    return {
      ok: false,
      error: "The model returned an empty lesson. Try again.",
    };
  }

  try {
      const { data: saved, error } = await supabase.from("reteach_packs").upsert(
        {
          session_id: sessionId,
          cluster_id: trustedCluster.id,
          lesson: pack.lesson,
          diagnostics: pack.diagnostics,
        },
        { onConflict: "cluster_id" },
      ).select("id").maybeSingle();
      if (error || !saved) {
        return { ok: false, error: "The reteach pack was generated but could not be saved." };
      }
    } catch {
      return { ok: false, error: "The reteach pack was generated but could not be saved." };
    }

  return { ok: true, pack };
}

/* ------------------------------------------------------------------ */
/*  Score review — PRD §7.7                                            */
/* ------------------------------------------------------------------ */

export async function saveScoreAction(params: {
  answerId: string;
  score: number;
  status: ReviewStatus;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPersistedId(params.answerId)) return { ok: true };
  if (
    !Number.isFinite(params.score) ||
    params.score < 0 ||
    !["unreviewed", "accepted", "edited", "flagged"].includes(params.status)
  ) {
    return { ok: false, error: "The score or review status is invalid." };
  }
  const supabase = await client();
  if (!supabase) return { ok: false, error: "Secure persistence is unavailable." };

  const { data: answer, error: readError } = await supabase
    .from("answers")
    .select("id, sessions!inner(max_score)")
    .eq("id", params.answerId)
    .maybeSingle();
  const related = (answer as { sessions?: { max_score?: unknown } | { max_score?: unknown }[] } | null)
    ?.sessions;
  const maxScore = Number(Array.isArray(related) ? related[0]?.max_score : related?.max_score);
  if (readError || !answer || !Number.isFinite(maxScore) || params.score > maxScore) {
    return { ok: false, error: "The score is outside this saved session's range." };
  }

  const { data: saved, error } = await supabase
    .from("answers")
    .update({
      provisional_score: Math.round(params.score),
      review_status: params.status,
    })
    .eq("id", params.answerId)
    .select("id")
    .maybeSingle();

  return error || !saved
    ? { ok: false, error: "The score could not be saved." }
    : { ok: true };
}

export async function saveStatusAction(params: {
  answerIds: string[];
  status: ReviewStatus;
}): Promise<{ ok: boolean; error?: string }> {
  if (!["unreviewed", "accepted", "edited", "flagged"].includes(params.status)) {
    return { ok: false, error: "The review status is invalid." };
  }
  const ids = params.answerIds.filter(isPersistedId);
  if (ids.length === 0) return { ok: true };
  if (ids.length !== params.answerIds.length) {
    return { ok: false, error: "Some answer references are invalid." };
  }
  const supabase = await client();
  if (!supabase) return { ok: false, error: "Secure persistence is unavailable." };

  const { data, error } = await supabase
    .from("answers")
    .update({ review_status: params.status })
    .in("id", ids)
    .select("id");

  return error || !data || data.length !== ids.length
    ? { ok: false, error: "The review status could not be saved." }
    : { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Cluster correction — PRD §5 step 8                                 */
/* ------------------------------------------------------------------ */

export async function renameClusterAction(params: {
  clusterId: string;
  label: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPersistedId(params.clusterId)) return { ok: true };
  const label = params.label.trim();
  if (!label || label.length > 500) {
    return { ok: false, error: "The cluster label is invalid." };
  }
  const supabase = await client();
  if (!supabase) return { ok: false, error: "Secure persistence is unavailable." };

  const { data, error } = await supabase
    .from("clusters")
    .update({ label })
    .eq("id", params.clusterId)
    .select("id")
    .maybeSingle();

  return error || !data
    ? { ok: false, error: "The cluster name could not be saved." }
    : { ok: true };
}

/**
 * Moves answers between clusters. Covers merge, reject, and the remainder of
 * a split — all three are the same write, so they are one action.
 */
export async function reassignAnswersAction(params: {
  answerIds: string[];
  clusterId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const ids = params.answerIds.filter(isPersistedId);
  if (ids.length === 0) return { ok: true };
  if (ids.length !== params.answerIds.length) {
    return { ok: false, error: "Some answer references are invalid." };
  }
  if (params.clusterId !== null && !isPersistedId(params.clusterId)) {
    return { ok: false, error: "The target cluster reference is invalid." };
  }
  const supabase = await client();
  if (!supabase) return { ok: false, error: "Secure persistence is unavailable." };

  const { data: answers, error: answerError } = await supabase
    .from("answers")
    .select("id, session_id")
    .in("id", ids);
  const sessionIds = new Set((answers ?? []).map((answer) => String(answer.session_id)));
  if (answerError || !answers || answers.length !== ids.length || sessionIds.size !== 1) {
    return { ok: false, error: "The saved answers could not be verified." };
  }

  if (params.clusterId !== null) {
    const { data: target, error: targetError } = await supabase
      .from("clusters")
      .select("id, session_id")
      .eq("id", params.clusterId)
      .maybeSingle();
    if (targetError || !target || !sessionIds.has(String(target.session_id))) {
      return { ok: false, error: "Answers cannot move to a cluster in another session." };
    }
  }

  const { data, error } = await supabase
    .from("answers")
    .update({ cluster_id: params.clusterId })
    .in("id", ids)
    .select("id");

  return error || !data || data.length !== ids.length
    ? { ok: false, error: "The cluster assignment could not be saved." }
    : { ok: true };
}

export async function deleteClusterAction(params: {
  clusterId: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPersistedId(params.clusterId)) return { ok: true };
  const supabase = await client();
  if (!supabase) return { ok: false, error: "Secure persistence is unavailable." };

  const { data, error } = await supabase
    .from("clusters")
    .delete()
    .eq("id", params.clusterId)
    .select("id")
    .maybeSingle();

  return error || !data
    ? { ok: false, error: "The cluster could not be deleted." }
    : { ok: true };
}

/** Creates the cluster a split produces, and returns its row id. */
export async function createClusterAction(params: {
  sessionId: string;
  cluster: Omit<Cluster, "id" | "memberIds">;
  rank: number;
}): Promise<{ ok: boolean; clusterId: string | null }> {
  if (
    !isPersistedId(params.sessionId) ||
    !params.cluster.label.trim() ||
    params.cluster.label.trim().length > 500 ||
    !Number.isInteger(params.cluster.severity) ||
    params.cluster.severity < 1 ||
    params.cluster.severity > 5 ||
    !Number.isInteger(params.rank) ||
    params.rank < 0
  ) {
    return { ok: false, clusterId: null };
  }
  const supabase = await client();
  if (!supabase) return { ok: false, clusterId: null };

  const { data, error } = await supabase
    .from("clusters")
    .insert({
      session_id: params.sessionId,
      label: params.cluster.label.trim(),
      why: params.cluster.why,
      severity: params.cluster.severity,
      downstream: params.cluster.downstream,
      tone: params.cluster.tone,
      is_other: params.cluster.isOther,
      rank: params.rank,
    })
    .select("id")
    .single();

  return { ok: !error, clusterId: (data?.id as string | undefined) ?? null };
}

/* ------------------------------------------------------------------ */
/*  Export gate — PRD §6 step 7                                        */
/* ------------------------------------------------------------------ */

export async function confirmBatchAction(params: {
  sessionId: string;
  confirmedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const confirmedBy = params.confirmedBy.trim();
  if (!isPersistedId(params.sessionId) || !confirmedBy || confirmedBy.length > 200) {
    return { ok: false, error: "A valid saved session and reviewer are required." };
  }
  const supabase = await client();
  if (!supabase) return { ok: false, error: "Secure persistence is unavailable." };

  const { data: answers, error: answersError } = await supabase
    .from("answers")
    .select("review_status")
    .eq("session_id", params.sessionId);
  if (
    answersError ||
    !answers ||
    answers.length === 0 ||
    answers.some((answer) =>
      answer.review_status === "unreviewed" || answer.review_status === "flagged"
    )
  ) {
    return {
      ok: false,
      error: "Every saved score must be reviewed and no row may remain flagged.",
    };
  }

  const { data: saved, error } = await supabase
    .from("sessions")
    .update({
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy,
    })
    .eq("id", params.sessionId)
    .select("id")
    .maybeSingle();

  return error || !saved
    ? { ok: false, error: "The confirmation could not be saved." }
    : { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Steps 7 and 8 — the personalised diagnostic and its measurement    */
/* ------------------------------------------------------------------ */

export type SubmitDiagnosticResult = SecureSubmitDiagnosticResult;

export async function submitDiagnosticAction(params: {
  token: string;
  responses: string[];
}): Promise<SubmitDiagnosticResult> {
  return submitSavedDiagnostic(params);
}

export async function retryDiagnosticGradingAction(params: {
  token: string;
}): Promise<SubmitDiagnosticResult> {
  return retrySavedDiagnostic(params.token);
}

export async function diagnosticForTokenAction(token: string) {
  const supabase = await client();
  if (!supabase) return null;
  return readStudentDiagnostic(supabase, token);
}

/**
 * Every diagnostic response for one session, for the outcome screen.
 *
 * Read through the ordinary row level security policy rather than a
 * SECURITY DEFINER function: this one is called by the lecturer, who has an
 * account, so the policy already expresses "sessions I own" exactly.
 */
export async function diagnosticResponsesForSessionAction(
  sessionId: string,
): Promise<DiagnosticResponse[]> {
  if (!isPersistedId(sessionId)) return [];

  const supabase = await client();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("diagnostic_responses")
    .select("answer_id, question_index, response_text, verdict, rationale, answers!inner(session_id)")
    .eq("answers.session_id", sessionId);

  if (error || !data) return [];

  return data.map((row) => ({
    answerId: row.answer_id as string,
    questionIndex: row.question_index as number,
    responseText: (row.response_text as string) ?? "",
    verdict: (row.verdict as DiagnosticResponse["verdict"]) ?? null,
    rationale: (row.rationale as string) ?? "",
  }));
}
