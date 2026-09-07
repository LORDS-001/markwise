import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cluster, ReteachPack, StudentAnswer } from "@/lib/types";
import type { PipelineInput, PipelineResult } from "@/lib/pipeline/types";

interface AtomicClusterRow {
  client_ref: string;
  id: string;
}

interface AtomicAnswerRow extends AtomicClusterRow {
  diagnostic_token: string;
}

interface AtomicResult {
  session_id: string;
  cluster_rows: AtomicClusterRow[];
  answer_rows: AtomicAnswerRow[];
}

function correlationId() {
  return globalThis.crypto.randomUUID();
}

function validateRunShape(input: PipelineInput, result: PipelineResult) {
  if (
    !Array.isArray(input.criteria) ||
    !Array.isArray(result.answers) ||
    !Array.isArray(result.clusters) ||
    result.answers.some(
      (answer) =>
        !answer ||
        typeof answer.id !== "string" ||
        !answer.id ||
        typeof answer.studentId !== "string" ||
        typeof answer.answer !== "string",
    ) ||
    result.clusters.some(
      (cluster) =>
        !cluster ||
        typeof cluster.id !== "string" ||
        !cluster.id ||
        !Array.isArray(cluster.memberIds),
    )
  ) {
    throw new Error("The run has a malformed persistence shape.");
  }
  if (
    !Number.isInteger(result.maxScore) ||
    result.maxScore <= 0 ||
    input.criteria.some(
      (criterion) => !Number.isInteger(criterion.marks) || criterion.marks <= 0,
    )
  ) {
    throw new Error("The run contains invalid whole-mark values.");
  }
  const answerIds = new Set(result.answers.map((answer) => answer.id));
  const clusterIds = new Set(result.clusters.map((cluster) => cluster.id));
  if (answerIds.size !== result.answers.length || clusterIds.size !== result.clusters.length) {
    throw new Error("The run contains duplicate answer or cluster identities.");
  }
  for (const answer of result.answers) {
    if (
      !Number.isInteger(answer.provisionalScore) ||
      !Number.isInteger(answer.maxScore) ||
      answer.provisionalScore < 0 ||
      answer.provisionalScore > answer.maxScore ||
      (answer.clusterId && !clusterIds.has(answer.clusterId))
    ) {
      throw new Error("The run contains an invalid answer or cluster association.");
    }
  }
  const seenMembers = new Set<string>();
  for (const cluster of result.clusters) {
    for (const memberId of cluster.memberIds) {
      const answer = result.answers.find((item) => item.id === memberId);
      if (!answer || answer.clusterId !== cluster.id || seenMembers.has(memberId)) {
        throw new Error("The run contains inconsistent cluster membership.");
      }
      seenMembers.add(memberId);
    }
  }
  if (
    result.answers.some(
      (answer) => answer.clusterId !== null && !seenMembers.has(answer.id),
    ) ||
    Object.keys(result.reteachPacks ?? {}).some((clusterId) => !clusterIds.has(clusterId))
  ) {
    throw new Error("The run contains incomplete cluster membership.");
  }
}

function requireAtomicResult(value: unknown): AtomicResult {
  if (!value || typeof value !== "object") {
    throw new Error("The database did not return the saved run identity.");
  }

  const row = value as Partial<AtomicResult>;
  if (
    typeof row.session_id !== "string" ||
    !Array.isArray(row.cluster_rows) ||
    !Array.isArray(row.answer_rows)
  ) {
    throw new Error("The database returned an incomplete saved run.");
  }
  return row as AtomicResult;
}

/**
 * Saves every row for a finished run in one PostgreSQL transaction.
 *
 * `ownerId` remains in the TypeScript interface so callers can pass the user
 * verified by the AI gate. It is deliberately never sent to PostgreSQL: the
 * RPC derives ownership from `auth.uid()`, preventing a caller from assigning
 * a run to another account.
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
  const { supabase, input, result } = options;
  validateRunShape(input, result);
  const clusterClientRef = new Map(
    result.clusters.map((cluster) => [cluster.id, correlationId()]),
  );
  const answerClientRef = new Map(
    result.answers.map((answer) => [answer.id, correlationId()]),
  );

  const p_clusters = result.clusters.map((cluster, rank) => ({
    client_ref: clusterClientRef.get(cluster.id),
    label: cluster.label,
    why: cluster.why,
    severity: cluster.severity,
    downstream: cluster.downstream,
    tone: cluster.tone,
    is_other: cluster.isOther,
    rank,
    plane_x: cluster.x ?? null,
    plane_y: cluster.y ?? null,
  }));

  const p_answers = result.answers.map((answer) => ({
    client_ref: answerClientRef.get(answer.id),
    cluster_client_ref: answer.clusterId
      ? (clusterClientRef.get(answer.clusterId) ?? null)
      : null,
    student_ref: answer.studentId,
    initials: answer.initials,
    answer: answer.answer,
    is_correct: answer.isCorrect,
    error_signature: answer.errorSignature,
    evidence_span: answer.evidenceSpan,
    confidence: answer.confidence,
    provisional_score: answer.provisionalScore,
    criteria_met: answer.criteriaMet,
    criteria_missed: answer.criteriaMissed,
    score_rationale: answer.scoreRationale,
    review_status: answer.status,
  }));

  const p_reteach_packs = Object.entries(result.reteachPacks ?? {}).map(
    ([clusterId, pack]) => ({
      cluster_client_ref: clusterClientRef.get(clusterId),
      lesson: pack.lesson,
      diagnostics: pack.diagnostics,
    }),
  );

  const { data, error } = await supabase.rpc("persist_run_atomic", {
    p_input: {
      question: input.question,
      marking_scheme: input.scheme,
      criteria: input.criteria,
      subject: input.subject,
      level: input.level,
      max_score: result.maxScore,
    },
    p_clusters,
    p_answers,
    p_reteach_packs,
    p_prediction: options.prediction,
    p_course_code: options.courseCode?.trim() ?? "",
    p_course_title: options.courseTitle?.trim() ?? "",
  });

  if (error) throw new Error(`Could not save the run: ${error.message}`);
  const saved = requireAtomicResult(data);

  const clusterIdByRef = new Map<string, string>();
  for (const row of saved.cluster_rows) {
    if (typeof row.client_ref === "string" && typeof row.id === "string") {
      clusterIdByRef.set(row.client_ref, row.id);
    }
  }
  const answerByRef = new Map<string, AtomicAnswerRow>();
  for (const row of saved.answer_rows) {
    if (typeof row.client_ref === "string") answerByRef.set(row.client_ref, row);
  }

  const newClusterId = new Map<string, string>();
  for (const cluster of result.clusters) {
    const ref = clusterClientRef.get(cluster.id);
    const id = ref ? clusterIdByRef.get(ref) : undefined;
    if (!id) throw new Error("The database returned an incomplete cluster mapping.");
    newClusterId.set(cluster.id, id);
  }

  const newAnswer = new Map<string, AtomicAnswerRow>();
  for (const answer of result.answers) {
    const ref = answerClientRef.get(answer.id);
    const row = ref ? answerByRef.get(ref) : undefined;
    if (!row?.id) throw new Error("The database returned an incomplete answer mapping.");
    if (!row.diagnostic_token) {
      throw new Error("The database did not generate a diagnostic token for every answer.");
    }
    newAnswer.set(answer.id, row);
  }

  const answers: StudentAnswer[] = result.answers.map((answer) => ({
    ...answer,
    id: newAnswer.get(answer.id)!.id,
    clusterId: answer.clusterId ? (newClusterId.get(answer.clusterId) ?? null) : null,
    diagnosticToken: newAnswer.get(answer.id)!.diagnostic_token,
  }));

  const clusters: Cluster[] = result.clusters.map((cluster) => ({
    ...cluster,
    id: newClusterId.get(cluster.id)!,
    memberIds: cluster.memberIds.map((id) => newAnswer.get(id)?.id ?? id),
  }));

  const reteachPacks: Record<string, ReteachPack> = {};
  for (const [clusterId, pack] of Object.entries(result.reteachPacks ?? {})) {
    const savedClusterId = newClusterId.get(clusterId);
    if (!savedClusterId) continue;
    reteachPacks[savedClusterId] = { ...pack, clusterId: savedClusterId };
  }

  return {
    sessionId: saved.session_id,
    result: { ...result, answers, clusters, reteachPacks },
  };
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
  diagnostic_token: string | null;
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
  plane_x: number | null;
  plane_y: number | null;
}

interface CourseRelation {
  code?: string | null;
  title?: string | null;
}

function courseFromRelation(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  const course = (relation ?? {}) as CourseRelation;
  return { code: course.code ?? "", title: course.title ?? "" };
}

/** Reads an owned, ready run back into the shape the client screens consume. */
export async function loadRun(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{
  result: PipelineResult;
  prediction: string;
  input: Omit<PipelineInput, "answers">;
  course: { code: string; title: string };
} | null> {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select(
      "id, question, marking_scheme, criteria, subject, level, max_score, prediction, status, courses(code, title)",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) throw new Error(`Could not load the session: ${sessionError.message}`);
  if (!session || session.status !== "ready") return null;

  const [clustersQuery, answersQuery, packsQuery] = await Promise.all([
    supabase
      .from("clusters")
      .select(
        "id, label, why, severity, downstream, tone, is_other, rank, plane_x, plane_y",
      )
      .eq("session_id", sessionId)
      .order("rank", { ascending: true }),
    supabase
      .from("answers")
      .select(
        "id, cluster_id, student_ref, initials, answer, is_correct, error_signature, evidence_span, confidence, provisional_score, criteria_met, criteria_missed, score_rationale, review_status, diagnostic_token",
      )
      .eq("session_id", sessionId),
    supabase
      .from("reteach_packs")
      .select("cluster_id, lesson, diagnostics")
      .eq("session_id", sessionId),
  ]);

  if (clustersQuery.error) {
    throw new Error(`Could not load the clusters: ${clustersQuery.error.message}`);
  }
  if (answersQuery.error) {
    throw new Error(`Could not load the answers: ${answersQuery.error.message}`);
  }
  if (packsQuery.error) {
    throw new Error(`Could not load the reteach packs: ${packsQuery.error.message}`);
  }

  const clusterRows = (clustersQuery.data ?? []) as ClusterRow[];
  const answerRows = (answersQuery.data ?? []) as AnswerRow[];
  const clusterIds = new Set(clusterRows.map((row) => row.id));
  if (answerRows.some((row) => row.cluster_id && !clusterIds.has(row.cluster_id))) {
    throw new Error("The saved run is incomplete: an answer's cluster is missing.");
  }
  if (answerRows.some((row) => !row.diagnostic_token)) {
    throw new Error("The saved run is incomplete: an answer's diagnostic token is missing.");
  }

  const maxScore = (session.max_score as number) ?? 10;
  const answers: StudentAnswer[] = answerRows.map((row) => ({
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
    diagnosticToken: row.diagnostic_token!,
  }));

  const clusters: Cluster[] = clusterRows.map((row) => ({
    id: row.id,
    tone: Math.max(0, Math.min(6, row.tone)) as Cluster["tone"],
    label: row.label,
    why: row.why ?? "",
    memberIds: answers.filter((answer) => answer.clusterId === row.id).map((answer) => answer.id),
    severity: row.severity ?? 1,
    downstream: row.downstream ?? [],
    isOther: row.is_other,
    x: row.plane_x ?? undefined,
    y: row.plane_y ?? undefined,
  }));

  const reteachPacks: Record<string, ReteachPack> = {};
  for (const row of packsQuery.data ?? []) {
    const clusterId = row.cluster_id as string;
    if (!clusterIds.has(clusterId)) {
      throw new Error("The saved run is incomplete: a reteach pack's cluster is missing.");
    }
    reteachPacks[clusterId] = {
      clusterId,
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
    course: courseFromRelation(session.courses),
  };
}
