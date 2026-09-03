import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistRun } from "@/lib/db/persist";
import type { PipelineInput, PipelineResult } from "@/lib/pipeline/types";
import type { Cluster, StudentAnswer } from "@/lib/types";

/**
 * A Supabase stand-in that records what it was asked to write and replays
 * chosen rows back.
 *
 * `reverseAnswerRows` exists because PostgreSQL does not promise that
 * INSERT ... RETURNING hands rows back in the order they were supplied.
 * Persisting a run has to survive that, and a test that always replays rows in
 * order would never notice it does not.
 */
function fakeSupabase(options: { reverseAnswerRows?: boolean } = {}) {
  const inserted: Record<string, unknown[]> = {};

  const uuid = (table: string, index: number) =>
    `${index.toString(16).padStart(8, "0")}-0000-4000-8000-${table
      .slice(0, 12)
      .padEnd(12, "0")}`;

  const client = {
    from(table: string) {
      return {
        insert(rows: unknown) {
          const list = Array.isArray(rows) ? rows : [rows];
          inserted[table] = [...(inserted[table] ?? []), ...list];

          const built = list.map((row, index) => {
            const source = row as Record<string, unknown>;
            return {
              // Encodes the student so a test can tell whose row came back,
              // and stays unique per row so two answers sharing a student ref
              // still get distinct ids — as a real database would give them.
              id:
                table === "answers"
                  ? `row-${String(source.student_ref)}#${index}`
                  : uuid(table, index),
              rank: source.rank,
              student_ref: source.student_ref,
            };
          });

          const data =
            table === "answers" && options.reverseAnswerRows
              ? [...built].reverse()
              : built;

          return {
            select() {
              // Multi-row inserts await the builder directly; single-row
              // inserts call .single() on it. A real promise with the method
              // attached satisfies both without reimplementing thenables.
              const pending = Promise.resolve({ data, error: null });
              return Object.assign(pending, {
                single: async () => ({ data: data[0], error: null }),
              });
            },
          };
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, inserted };
}

const INPUT: Omit<PipelineInput, "answers"> & { answers: [] } = {
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
    answer: `answer from ${studentId}`,
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

function cluster(id: string, memberIds: string[]): Cluster {
  return {
    id,
    tone: 1,
    label: `Cluster ${id}`,
    why: "",
    memberIds,
    severity: 3,
    downstream: [],
    isOther: false,
  };
}

const RESULT: PipelineResult = {
  answers: [
    answer("a-01", "EEE/1", "cl-1"),
    answer("a-02", "EEE/2", "cl-1"),
    answer("a-03", "EEE/3", "cl-2"),
  ],
  clusters: [cluster("cl-1", ["a-01", "a-02"]), cluster("cl-2", ["a-03"])],
  reteachPacks: {},
  maxScore: 10,
};

describe("persistRun", () => {
  it("re-keys answers and clusters to the row ids", async () => {
    const { client } = fakeSupabase();
    const { result } = await persistRun({
      supabase: client,
      ownerId: "owner-1",
      input: INPUT as PipelineInput,
      result: RESULT,
      prediction: null,
    });

    for (const a of result.answers) {
      expect(a.id).toMatch(/^row-EEE\/\d#\d$/);
      expect(a.id.startsWith(`row-${a.studentId}#`)).toBe(true);
    }
    for (const c of result.clusters) {
      expect(c.id).toMatch(/^[0-9a-f]{8}-0000-4000-8000-/);
    }
  });

  it("keeps every answer pointing at the cluster it was in", async () => {
    const { client } = fakeSupabase();
    const { result } = await persistRun({
      supabase: client,
      ownerId: "owner-1",
      input: INPUT as PipelineInput,
      result: RESULT,
      prediction: null,
    });

    const idOf = (studentId: string) =>
      result.answers.find((a) => a.studentId === studentId)!.clusterId;

    // The first two shared a cluster and must still share one; the third was
    // on its own and must not have joined them.
    expect(idOf("EEE/1")).toBe(idOf("EEE/2"));
    expect(idOf("EEE/3")).not.toBe(idOf("EEE/1"));
  });

  it("keeps cluster membership consistent with the answers", async () => {
    const { client } = fakeSupabase();
    const { result } = await persistRun({
      supabase: client,
      ownerId: "owner-1",
      input: INPUT as PipelineInput,
      result: RESULT,
      prediction: null,
    });

    for (const c of result.clusters) {
      for (const memberId of c.memberIds) {
        const member = result.answers.find((a) => a.id === memberId);
        expect(member, `member ${memberId} missing from answers`).toBeDefined();
        expect(member!.clusterId).toBe(c.id);
      }
    }
  });

  it("survives the database returning inserted rows out of order", async () => {
    // Positional mapping silently pairs each answer with another student's
    // row: scores save against the wrong student and answers join the wrong
    // cluster, with nothing on screen to show it happened.
    const { client } = fakeSupabase({ reverseAnswerRows: true });
    const { result } = await persistRun({
      supabase: client,
      ownerId: "owner-1",
      input: INPUT as PipelineInput,
      result: RESULT,
      prediction: null,
    });

    // The decisive check: each answer must carry ITS OWN row. Positional
    // mapping hands EEE/1 the row holding EEE/3's work, so every later write
    // keyed on that id — every score, every status — lands on the wrong
    // student, silently.
    for (const a of result.answers) {
      expect(
        a.id.startsWith(`row-${a.studentId}#`),
        `${a.studentId} is carrying another student's row (${a.id})`,
      ).toBe(true);
    }

    const idOf = (studentId: string) =>
      result.answers.find((a) => a.studentId === studentId)!.clusterId;
    expect(idOf("EEE/1")).toBe(idOf("EEE/2"));
    expect(idOf("EEE/3")).not.toBe(idOf("EEE/1"));

    for (const c of result.clusters) {
      for (const memberId of c.memberIds) {
        expect(result.answers.find((a) => a.id === memberId)).toBeDefined();
      }
    }
  });

  it("gives two answers sharing a student ref distinct rows", async () => {
    // A CSV can carry the same identifier twice. Matching on ref must not
    // collapse both answers onto one row and lose a student's work.
    const duplicated: PipelineResult = {
      ...RESULT,
      answers: [
        answer("a-01", "EEE/1", "cl-1"),
        answer("a-02", "EEE/1", "cl-1"),
        answer("a-03", "EEE/3", "cl-2"),
      ],
      clusters: [cluster("cl-1", ["a-01", "a-02"]), cluster("cl-2", ["a-03"])],
    };

    const { client } = fakeSupabase();
    const { result } = await persistRun({
      supabase: client,
      ownerId: "owner-1",
      input: INPUT as PipelineInput,
      result: duplicated,
      prediction: null,
    });

    const ids = result.answers.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("writes the answer rows with their own student refs", async () => {
    const { client, inserted } = fakeSupabase();
    await persistRun({
      supabase: client,
      ownerId: "owner-1",
      input: INPUT as PipelineInput,
      result: RESULT,
      prediction: null,
    });

    const refs = (inserted.answers as { student_ref: string }[]).map(
      (r) => r.student_ref,
    );
    expect(refs).toEqual(["EEE/1", "EEE/2", "EEE/3"]);
  });
});
