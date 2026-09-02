"use server";

import type { Cluster, ReteachPack, ReviewStatus, StudentAnswer } from "@/lib/types";
import type { PipelineInput } from "@/lib/pipeline/types";
import { isPipelineConfigured } from "@/lib/pipeline/gemini";
import { generateReteachPack, otherBucketPack } from "@/lib/pipeline/reteach";
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
 * The cluster and its members come from the client rather than being re-read
 * here, because a lecturer who renamed, merged, or split a cluster must get a
 * lesson written against the corrected cluster — not the one the model
 * originally proposed.
 */
export async function generateReteachAction(params: {
  context: Omit<PipelineInput, "answers">;
  cluster: Cluster;
  members: StudentAnswer[];
  sessionId?: string | null;
}): Promise<ReteachResult> {
  const { context, cluster, members, sessionId } = params;

  if (cluster.isOther) {
    return { ok: true, pack: otherBucketPack(cluster.id, cluster.memberIds.length) };
  }

  if (!isPipelineConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "Reteach packs need GEMINI_API_KEY. The seeded demo class ships with its packs already written.",
    };
  }

  let pack: ReteachPack;
  try {
    pack = await generateReteachPack({ ...context, answers: [] }, cluster, members);
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

  if (sessionId && isPersistedId(cluster.id)) {
    try {
      const supabase = await client();
      await supabase?.from("reteach_packs").upsert(
        {
          session_id: sessionId,
          cluster_id: cluster.id,
          lesson: pack.lesson,
          diagnostics: pack.diagnostics,
        },
        { onConflict: "cluster_id" },
      );
    } catch {
      // Caching is a convenience; the lecturer already has the pack in hand.
    }
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
}): Promise<{ ok: boolean }> {
  if (!isPersistedId(params.answerId)) return { ok: true };
  const supabase = await client();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from("answers")
    .update({
      provisional_score: Math.max(0, Math.round(params.score)),
      review_status: params.status,
    })
    .eq("id", params.answerId);

  return { ok: !error };
}

export async function saveStatusAction(params: {
  answerIds: string[];
  status: ReviewStatus;
}): Promise<{ ok: boolean }> {
  const ids = params.answerIds.filter(isPersistedId);
  if (ids.length === 0) return { ok: true };
  const supabase = await client();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from("answers")
    .update({ review_status: params.status })
    .in("id", ids);

  return { ok: !error };
}

/* ------------------------------------------------------------------ */
/*  Cluster correction — PRD §5 step 8                                 */
/* ------------------------------------------------------------------ */

export async function renameClusterAction(params: {
  clusterId: string;
  label: string;
}): Promise<{ ok: boolean }> {
  if (!isPersistedId(params.clusterId)) return { ok: true };
  const supabase = await client();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from("clusters")
    .update({ label: params.label })
    .eq("id", params.clusterId);

  return { ok: !error };
}

/**
 * Moves answers between clusters. Covers merge, reject, and the remainder of
 * a split — all three are the same write, so they are one action.
 */
export async function reassignAnswersAction(params: {
  answerIds: string[];
  clusterId: string | null;
}): Promise<{ ok: boolean }> {
  const ids = params.answerIds.filter(isPersistedId);
  if (ids.length === 0) return { ok: true };
  if (params.clusterId !== null && !isPersistedId(params.clusterId)) {
    return { ok: true };
  }
  const supabase = await client();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from("answers")
    .update({ cluster_id: params.clusterId })
    .in("id", ids);

  return { ok: !error };
}

export async function deleteClusterAction(params: {
  clusterId: string;
}): Promise<{ ok: boolean }> {
  if (!isPersistedId(params.clusterId)) return { ok: true };
  const supabase = await client();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from("clusters")
    .delete()
    .eq("id", params.clusterId);

  return { ok: !error };
}

/** Creates the cluster a split produces, and returns its row id. */
export async function createClusterAction(params: {
  sessionId: string;
  cluster: Omit<Cluster, "id" | "memberIds">;
  rank: number;
}): Promise<{ ok: boolean; clusterId: string | null }> {
  if (!isPersistedId(params.sessionId)) return { ok: true, clusterId: null };
  const supabase = await client();
  if (!supabase) return { ok: true, clusterId: null };

  const { data, error } = await supabase
    .from("clusters")
    .insert({
      session_id: params.sessionId,
      label: params.cluster.label,
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
}): Promise<{ ok: boolean }> {
  if (!isPersistedId(params.sessionId)) return { ok: true };
  const supabase = await client();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from("sessions")
    .update({
      confirmed_at: new Date().toISOString(),
      confirmed_by: params.confirmedBy,
    })
    .eq("id", params.sessionId);

  return { ok: !error };
}
