import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRun, persistRun } from "@/lib/db/persist";
import type { PipelineInput, PipelineResult } from "@/lib/pipeline/types";
import type { Cluster, StudentAnswer } from "@/lib/types";

const INPUT: PipelineInput = {
  question: "A series RL circuit…",
  scheme: "Full marks require…",
  criteria: [{ id: "c-1", label: "Reactance included", marks: 2 }],
  subject: "Electrical Engineering",
  level: "300 level",
  answers: [],
};

function answer(id: string, studentId: string, clusterId: string | null): StudentAnswer {
  return {
    id,
    studentId,
    initials: "AB",
    answer: `answer ${id}`,
    isCorrect: clusterId === null,
    clusterId,
    errorSignature: clusterId ? "believes X" : null,
    evidenceSpan: null,
    confidence: 0.8,
    provisionalScore: 4,
    maxScore: 10,
    criteriaMet: [],
    criteriaMissed: ["c-1"],
    scoreRationale: "",
    status: "unreviewed",
  };
}

function cluster(id: string, memberIds: string[], isOther = false): Cluster {
  return {
    id,
    tone: isOther ? 6 : 1,
    label: isOther ? "Other" : `Cluster ${id}`,
    why: "",
    memberIds,
    severity: 3,
    downstream: [],
    isOther,
  };
}

const RESULT: PipelineResult = {
  answers: [
    answer("a-01", "EEE/1", "cl-1"),
    answer("a-02", "EEE/1", "cl-1"),
    answer("a-03", "EEE/3", "cl-other"),
  ],
  clusters: [
    cluster("cl-1", ["a-01", "a-02"]),
    cluster("cl-other", ["a-03"], true),
  ],
  reteachPacks: {},
  maxScore: 10,
};

type AtomicArgs = {
  p_input: Record<string, unknown>;
  p_clusters: Array<Record<string, unknown>>;
  p_answers: Array<Record<string, unknown>>;
  p_reteach_packs: Array<Record<string, unknown>>;
  p_prediction: string | null;
  p_course_code: string;
  p_course_title: string;
};

function atomicClient(
  respond?: (args: AtomicArgs) => { data: unknown; error: { message: string } | null },
) {
  const calls: Array<{ name: string; args: AtomicArgs }> = [];
  const client = {
    async rpc(name: string, args: AtomicArgs) {
      calls.push({ name, args });
      if (respond) return respond(args);

      return {
        data: {
          session_id: "10000000-0000-4000-8000-000000000001",
          cluster_rows: [...args.p_clusters].reverse().map((row, index) => ({
            client_ref: row.client_ref,
            id: `20000000-0000-4000-8000-00000000000${index}`,
          })),
          answer_rows: [...args.p_answers].reverse().map((row, index) => ({
            client_ref: row.client_ref,
            id: `30000000-0000-4000-8000-00000000000${index}`,
            diagnostic_token: `token-${String(row.client_ref)}`,
          })),
        },
        error: null,
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("persistRun", () => {
  it("persists the complete run in one atomic RPC", async () => {
    const { client, calls } = atomicClient();

    await persistRun({
      supabase: client,
      ownerId: "caller-supplied-owner-is-not-trusted",
      input: INPUT,
      result: RESULT,
      prediction: "They will omit reactance",
      courseCode: "EEE 301",
      courseTitle: "Circuit Theory",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("persist_run_atomic");
    expect(calls[0].args).toMatchObject({
      p_prediction: "They will omit reactance",
      p_course_code: "EEE 301",
      p_course_title: "Circuit Theory",
    });
    expect(calls[0].args).not.toHaveProperty("owner_id");
    expect(calls[0].args.p_answers).toHaveLength(3);
    expect(calls[0].args.p_clusters).toHaveLength(2);
  });

  it("uses per-answer correlation ids when duplicate refs return out of order", async () => {
    const { client } = atomicClient();

    const { result } = await persistRun({
      supabase: client,
      ownerId: "owner-1",
      input: INPUT,
      result: RESULT,
      prediction: null,
    });

    expect(new Set(result.answers.map((item) => item.id)).size).toBe(3);
    expect(result.answers.every((item) => item.diagnosticToken?.startsWith("token-"))).toBe(true);
    for (const savedCluster of result.clusters) {
      for (const memberId of savedCluster.memberIds) {
        const member = result.answers.find((item) => item.id === memberId);
        expect(member?.clusterId).toBe(savedCluster.id);
      }
    }
  });

  it("refuses to report a saved run when an answer token is missing", async () => {
    const { client } = atomicClient((args) => ({
      data: {
        session_id: "10000000-0000-4000-8000-000000000001",
        cluster_rows: args.p_clusters.map((row) => ({
          client_ref: row.client_ref,
          id: crypto.randomUUID(),
        })),
        answer_rows: args.p_answers.map((row, index) => ({
          client_ref: row.client_ref,
          id: crypto.randomUUID(),
          diagnostic_token: index === 1 ? null : `token-${index}`,
        })),
      },
      error: null,
    }));

    await expect(
      persistRun({
        supabase: client,
        ownerId: "owner-1",
        input: INPUT,
        result: RESULT,
        prediction: null,
      }),
    ).rejects.toThrow("diagnostic token");
  });

  it("surfaces an atomic save failure without falling back to partial inserts", async () => {
    const { client, calls } = atomicClient(() => ({
      data: null,
      error: { message: "answer constraint failed" },
    }));

    await expect(
      persistRun({
        supabase: client,
        ownerId: "owner-1",
        input: INPUT,
        result: RESULT,
        prediction: null,
      }),
    ).rejects.toThrow("answer constraint failed");
    expect(calls).toHaveLength(1);
  });

  it("rejects inconsistent cluster associations before calling the database", async () => {
    const { client, calls } = atomicClient();
    const broken: PipelineResult = {
      ...RESULT,
      clusters: [cluster("cl-1", ["a-03"]), cluster("cl-other", [], true)],
    };
    await expect(
      persistRun({
        supabase: client,
        ownerId: "owner-1",
        input: INPUT,
        result: broken,
        prediction: null,
      }),
    ).rejects.toThrow(/cluster/i);
    expect(calls).toHaveLength(0);
  });
});

type QueryResult = { data: unknown; error: { message: string } | null };

function loadClient(results: Record<string, QueryResult>) {
  const client = {
    from(table: string) {
      const result = results[table];
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => result,
        then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  };
  return client as unknown as SupabaseClient;
}

const SESSION_ROW = {
  id: "10000000-0000-4000-8000-000000000001",
  question: INPUT.question,
  marking_scheme: INPUT.scheme,
  criteria: INPUT.criteria,
  subject: INPUT.subject,
  level: INPUT.level,
  max_score: 10,
  prediction: "reactance",
  status: "ready",
  courses: { code: "EEE 301", title: "Circuit Theory" },
};

const CLUSTER_ROW = {
  id: "20000000-0000-4000-8000-000000000001",
  label: "Reactance omitted",
  why: "DC intuition",
  severity: 3,
  downstream: [],
  tone: 1,
  is_other: false,
  rank: 0,
  plane_x: null,
  plane_y: null,
};

const ANSWER_ROW = {
  id: "30000000-0000-4000-8000-000000000001",
  cluster_id: CLUSTER_ROW.id,
  student_ref: "EEE/1",
  initials: "AB",
  answer: "Z = R",
  is_correct: false,
  error_signature: "believes impedance equals resistance",
  evidence_span: "Z = R",
  confidence: 0.8,
  provisional_score: 4,
  criteria_met: [],
  criteria_missed: ["c-1"],
  score_rationale: "",
  review_status: "unreviewed",
  diagnostic_token: "student-secret",
};

describe("loadRun", () => {
  it("restores diagnostic tokens and course identity", async () => {
    const loaded = await loadRun(
      loadClient({
        sessions: { data: SESSION_ROW, error: null },
        clusters: { data: [CLUSTER_ROW], error: null },
        answers: { data: [ANSWER_ROW], error: null },
        reteach_packs: { data: [], error: null },
      }),
      SESSION_ROW.id,
    );

    expect(loaded?.result.answers[0].diagnosticToken).toBe("student-secret");
    expect(loaded?.course).toEqual({ code: "EEE 301", title: "Circuit Theory" });
  });

  it("rejects query errors instead of fabricating an empty run", async () => {
    await expect(
      loadRun(
        loadClient({
          sessions: { data: SESSION_ROW, error: null },
          clusters: { data: null, error: { message: "clusters unavailable" } },
          answers: { data: [], error: null },
          reteach_packs: { data: [], error: null },
        }),
        SESSION_ROW.id,
      ),
    ).rejects.toThrow("clusters unavailable");
  });

  it("rejects an incomplete saved run", async () => {
    await expect(
      loadRun(
        loadClient({
          sessions: { data: SESSION_ROW, error: null },
          clusters: { data: [], error: null },
          answers: { data: [ANSWER_ROW], error: null },
          reteach_packs: { data: [], error: null },
        }),
        SESSION_ROW.id,
      ),
    ).rejects.toThrow("incomplete");
  });
});
