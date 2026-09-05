"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRun, persistRun } from "@/lib/db/persist";
import { getServerClient } from "@/lib/supabase/server";
import type { PipelineInput, PipelineResult } from "@/lib/pipeline/types";

export interface SavedSessionSummary {
  id: string;
  question: string;
  createdAt: string;
  courseCode: string;
  courseTitle: string;
}

async function ownedClient(): Promise<
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; error: string }
> {
  try {
    const supabase = await getServerClient();
    if (!supabase) return { ok: false, error: "Sign in to access saved sessions." };
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { ok: false, error: "Sign in to access saved sessions." };
    }
    return { ok: true, supabase, userId: data.user.id };
  } catch {
    return { ok: false, error: "Saved sessions are unavailable right now." };
  }
}

function courseRelation(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  const course = (relation ?? {}) as { code?: string | null; title?: string | null };
  return { code: course.code ?? "", title: course.title ?? "" };
}

export async function listSessionsAction(): Promise<
  | { ok: true; sessions: SavedSessionSummary[] }
  | { ok: false; error: string }
> {
  const owner = await ownedClient();
  if (!owner.ok) return owner;

  const { data, error } = await owner.supabase
    .from("sessions")
    .select("id, question, created_at, courses(code, title)")
    .eq("owner_id", owner.userId)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    sessions: (data ?? []).map((row) => {
      const course = courseRelation(row.courses);
      return {
        id: row.id as string,
        question: row.question as string,
        createdAt: row.created_at as string,
        courseCode: course.code,
        courseTitle: course.title,
      };
    }),
  };
}

export async function loadSessionAction(params: { sessionId: string }) {
  const owner = await ownedClient();
  if (!owner.ok) return owner;
  if (!params.sessionId.trim()) return { ok: false as const, error: "Session not found." };

  try {
    const run = await loadRun(owner.supabase, params.sessionId);
    if (!run) return { ok: false as const, error: "Session not found or not ready." };
    return { ok: true as const, run };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "The session could not be loaded.",
    };
  }
}

export async function invalidateReteachPacksAction(params: {
  clusterIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const owner = await ownedClient();
  if (!owner.ok) return owner;
  const ids = Array.from(new Set(params.clusterIds.filter(Boolean)));
  if (ids.length === 0) return { ok: true };

  const { error } = await owner.supabase
    .from("reteach_packs")
    .delete()
    .in("cluster_id", ids);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updateClusterShapeAction(params: {
  clusterId: string;
  severity: number;
  downstream: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const owner = await ownedClient();
  if (!owner.ok) return owner;
  const { error } = await owner.supabase
    .from("clusters")
    .update({ severity: params.severity, downstream: params.downstream })
    .eq("id", params.clusterId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function saveCompletedRunAction(params: {
  input: Omit<PipelineInput, "answers">;
  result: PipelineResult;
  prediction: string;
  course: { code: string; title: string };
}) {
  const owner = await ownedClient();
  if (!owner.ok) return owner;

  if (
    !params ||
    typeof params !== "object" ||
    !params.input ||
    typeof params.input !== "object" ||
    !params.result ||
    typeof params.result !== "object" ||
    !params.course ||
    typeof params.course !== "object" ||
    typeof params.input.question !== "string" ||
    typeof params.input.scheme !== "string" ||
    typeof params.input.subject !== "string" ||
    typeof params.input.level !== "string" ||
    typeof params.prediction !== "string" ||
    typeof params.course.code !== "string" ||
    typeof params.course.title !== "string" ||
    !Array.isArray(params.input.criteria) ||
    !Array.isArray(params.result.answers) ||
    !Array.isArray(params.result.clusters) ||
    !params.result.reteachPacks ||
    typeof params.result.reteachPacks !== "object"
  ) {
    return { ok: false as const, error: "The completed run is malformed." };
  }

  let encoded = "";
  try {
    encoded = JSON.stringify(params);
  } catch {
    return { ok: false as const, error: "The completed run is malformed." };
  }
  if (Buffer.byteLength(encoded, "utf8") > 4 * 1024 * 1024) {
    return { ok: false as const, error: "The completed run is larger than 4 MiB." };
  }
  if (params.result.answers.length > 100) {
    return { ok: false as const, error: "A run can contain at most 100 answers." };
  }
  if (params.input.question.length > 20_000 || params.input.scheme.length > 20_000) {
    return { ok: false as const, error: "The question or marking scheme is too long." };
  }
  if (
    params.input.criteria.length > 50 ||
    params.result.clusters.length > 101 ||
    !Number.isInteger(params.result.maxScore) ||
    params.result.maxScore <= 0 ||
    params.result.maxScore > 50_000 ||
    params.input.criteria.some(
      (criterion) =>
        !criterion ||
        typeof criterion.id !== "string" ||
        typeof criterion.label !== "string" ||
        !Number.isInteger(criterion.marks) ||
        criterion.marks <= 0 ||
        criterion.marks > 1_000,
    ) ||
    params.result.answers.some(
      (answer) =>
        !answer ||
        typeof answer.id !== "string" ||
        typeof answer.studentId !== "string" ||
        typeof answer.answer !== "string" ||
        answer.answer.length > 10_000 ||
        !Number.isInteger(answer.provisionalScore) ||
        !Number.isInteger(answer.maxScore),
    ) ||
    params.result.clusters.some(
      (cluster) =>
        !cluster ||
        typeof cluster.id !== "string" ||
        !Array.isArray(cluster.memberIds),
    )
  ) {
    return { ok: false as const, error: "The completed run contains invalid values." };
  }

  try {
    const saved = await persistRun({
      supabase: owner.supabase,
      ownerId: owner.userId,
      input: {
        ...params.input,
        answers: params.result.answers.map((answer) => ({
          studentRef: answer.studentId,
          text: answer.answer,
        })),
      },
      result: params.result,
      prediction: params.prediction,
      courseCode: params.course.code,
      courseTitle: params.course.title,
    });
    return { ok: true as const, ...saved };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "The completed run could not be saved.",
    };
  }
}
