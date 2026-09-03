import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cluster, ReteachPack, StudentAnswer } from "@/lib/types";
import type { PipelineInput, PipelineResult } from "@/lib/pipeline/types";

/**
 * Writes a finished run to Supabase and returns it re-keyed to the row ids.
 *
 * The pipeline invents provisional ids ("cl-1", "a-01") because it must work
 * with no database at all. Once rows exist, the client switches to the real
 * uuids so that every later edit — a score, a rename, a merge — addresses a
 * row directly instead of going through a translation table that could drift.
 */
export async function persistRun(options: {
  supabase: SupabaseClient;
  ownerId: string;
  input: PipelineInput;
  result: PipelineResult;
  prediction: string | null;
  courseCode?: string;
  courseTitle?: string;
}): Promise<{ sessionId: string; result: PipelineResult }> {
  const { supabase, ownerId, input, result, prediction } = options;

  let courseId: string | null = null;
  if (options.courseCode?.trim()) {
    const { data: course, error } = await supabase
      .from("courses")
      .insert({
        owner_id: ownerId,
        code: options.courseCode.trim(),
        title: options.courseTitle?.trim() ?? "",
      })
      .select("id")
      .single();
    // A course is a folder, not an identity — failing to create one must not
    // cost the lecturer the batch, so the session is saved without it.
    if (!error && course) courseId = course.id as string;
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      owner_id: ownerId,
      course_id: courseId,
      question: input.question,
      marking_scheme: input.scheme,
      criteria: input.criteria,
      subject: input.subject,
      level: input.level,
      max_score: result.maxScore,
      prediction,
      status: "ready",
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    throw new Error(`Could not save the session: ${sessionError?.message}`);
  }

  const sessionId = session.id as string;

  const { data: clusterRows, error: clusterError } = await supabase
    .from("clusters")
    .insert(
      result.clusters.map((c, index) => ({
        session_id: sessionId,
        label: c.label,
        why: c.why,
        severity: c.severity,
        downstream: c.downstream,
        tone: c.tone,
        is_other: c.isOther,
        rank: index,
      })),
    )
    .select("id, rank");

  if (clusterError || !clusterRows) {
    throw new Error(`Could not save the clusters: ${clusterError?.message}`);
  }

  // Rank is the insertion order, which is the only stable way to line the
  // returned rows back up with the clusters they came from.
  const clusterIdByRank = new Map<number, string>(
    clusterRows.map((row) => [row.rank as number, row.id as string]),
  );
  const newClusterId = new Map<string, string>();
  result.clusters.forEach((cluster, index) => {
    const id = clusterIdByRank.get(index);
    if (id) newClusterId.set(cluster.id, id);
  });

  const { data: answerRows, error: answerError } = await supabase
    .from("answers")
    .insert(
      result.answers.map((a) => ({
        session_id: sessionId,
        cluster_id: a.clusterId ? (newClusterId.get(a.clusterId) ?? null) : null,
        student_ref: a.studentId,
        initials: a.initials,
        answer: a.answer,
        is_correct: a.isCorrect,
        error_signature: a.errorSignature,
        evidence_span: a.evidenceSpan,
        confidence: a.confidence,
        provisional_score: a.provisionalScore,
        criteria_met: a.criteriaMet,
        criteria_missed: a.criteriaMissed,
        score_rationale: a.scoreRationale,
        review_status: a.status,
      })),
    )
    .select("id, student_ref");

  if (answerError || !answerRows) {
    throw new Error(`Could not save the answers: ${answerError?.message}`);
  }

  /*
   * Matched on student_ref, not on array position.
   *
   * PostgreSQL does not promise that INSERT ... RETURNING hands rows back in
   * the order they were supplied, and when it does not, positional mapping
   * gives each answer another student's row id — so every later write keyed on
   * that id, every score and every status, lands on the wrong student with
   * nothing on screen to show it.
   *
   * Duplicate refs in one batch are consumed in arrival order, which is
   * correct for them too: two rows with the same ref are interchangeable.
   */
  const rowsByRef = new Map<string, string[]>();
  for (const row of answerRows) {
    const ref = String(row.student_ref ?? "");
    const queue = rowsByRef.get(ref);
    if (queue) queue.push(row.id as string);
    else rowsByRef.set(ref, [row.id as string]);
  }

  const newAnswerId = new Map<string, string>();
  result.answers.forEach((answer, index) => {
    const queue = rowsByRef.get(answer.studentId);
    const matched = queue?.shift();
    // Position is the last resort, for the case where the database returned a
    // ref we never sent. Losing the id entirely would be worse.
    const fallback = answerRows[index]?.id as string | undefined;
    const id = matched ?? fallback;
    if (id) newAnswerId.set(answer.id, id);
  });

  const answers: StudentAnswer[] = result.answers.map((a) => ({
    ...a,
    id: newAnswerId.get(a.id) ?? a.id,
    clusterId: a.clusterId ? (newClusterId.get(a.clusterId) ?? null) : null,
  }));

  const clusters: Cluster[] = result.clusters.map((c) => ({
    ...c,
    id: newClusterId.get(c.id) ?? c.id,
    memberIds: c.memberIds.map((id) => newAnswerId.get(id) ?? id),
  }));

  return { sessionId, result: { ...result, answers, clusters } };
}

interface AnswerRow {
  id: string;
  cluster_id: string | null;
  student_ref: string;
  initials: string | null;
  answer: string;
  is_correct: boolean | null;
  error_signature: string | null;
  evidence_span: string | null;
  confidence: number | null;
  provisional_score: number | null;
  criteria_met: string[] | null;
  criteria_missed: string[] | null;
  score_rationale: string | null;
  review_status: StudentAnswer["status"];
}

interface ClusterRow {
  id: string;
  label: string;
  why: string | null;
  severity: number | null;
  downstream: string[] | null;
  tone: number;
  is_other: boolean;
  rank: number;
}

/** Reads a saved run back into the shape the screens consume. */
export async function loadRun(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{
  result: PipelineResult;
  prediction: string;
  input: Omit<PipelineInput, "answers">;
} | null> {
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, question, marking_scheme, criteria, subject, level, max_score, prediction, status",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.status !== "ready") return null;

  const [{ data: clusterRows }, { data: answerRows }] = await Promise.all([
    supabase
      .from("clusters")
      .select("id, label, why, severity, downstream, tone, is_other, rank")
      .eq("session_id", sessionId)
      .order("rank", { ascending: true }),
    supabase
      .from("answers")
      .select(
        "id, cluster_id, student_ref, initials, answer, is_correct, error_signature, evidence_span, confidence, provisional_score, criteria_met, criteria_missed, score_rationale, review_status",
      )
      .eq("session_id", sessionId),
  ]);

  const maxScore = (session.max_score as number) ?? 10;

  const answers: StudentAnswer[] = ((answerRows ?? []) as AnswerRow[]).map(
    (row) => ({
      id: row.id,
      studentId: row.student_ref,
      initials: row.initials ?? "—",
      answer: row.answer,
      isCorrect: row.is_correct ?? false,
      clusterId: row.cluster_id,
      errorSignature: row.error_signature,
      evidenceSpan: row.evidence_span,
      confidence: row.confidence ?? 0,
      provisionalScore: row.provisional_score ?? 0,
      maxScore,
      criteriaMet: row.criteria_met ?? [],
      criteriaMissed: row.criteria_missed ?? [],
      scoreRationale: row.score_rationale ?? "",
      status: row.review_status,
    }),
  );

  const clusters: Cluster[] = ((clusterRows ?? []) as ClusterRow[]).map(
    (row) => ({
      id: row.id,
      tone: Math.max(0, Math.min(6, row.tone)) as Cluster["tone"],
      label: row.label,
      why: row.why ?? "",
      memberIds: answers.filter((a) => a.clusterId === row.id).map((a) => a.id),
      severity: row.severity ?? 1,
      downstream: row.downstream ?? [],
      isOther: row.is_other,
    }),
  );

  const { data: packRows } = await supabase
    .from("reteach_packs")
    .select("cluster_id, lesson, diagnostics")
    .eq("session_id", sessionId);

  const reteachPacks: Record<string, ReteachPack> = {};
  for (const row of packRows ?? []) {
    reteachPacks[row.cluster_id as string] = {
      clusterId: row.cluster_id as string,
      lesson: (row.lesson ?? []) as ReteachPack["lesson"],
      diagnostics: (row.diagnostics ?? []) as ReteachPack["diagnostics"],
    };
  }

  return {
    result: { answers, clusters, reteachPacks, maxScore },
    prediction: (session.prediction as string | null) ?? "",
    input: {
      question: session.question as string,
      scheme: (session.marking_scheme as string) ?? "",
      criteria: (session.criteria ?? []) as PipelineInput["criteria"],
      subject: (session.subject as string) ?? "",
      level: (session.level as string) ?? "",
    },
  };
}
