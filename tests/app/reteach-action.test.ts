// @vitest-environment node
//
// Server action. The pipeline refuses to initialise where a `window` exists,
// so this cannot run under jsdom.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Cluster, StudentAnswer } from "@/lib/types";

/**
 * Reteach pack generation — PRD §6 step 6.
 *
 * The one-off bucket is the case worth pinning. Generating a lesson for
 * answers that share no belief would assert a pattern that is not there, in
 * the screen whose entire job is to say what the class got wrong together.
 */

const generateReteachPack = vi.hoisted(() => vi.fn());
const authorizeAiRequest = vi.hoisted(() => vi.fn());
const getServerClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/pipeline/reteach", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pipeline/reteach")>();
  return { ...actual, generateReteachPack };
});
vi.mock("@/lib/supabase/server", () => ({ getServerClient }));
vi.mock("@/lib/server/ai-access", () => ({ authorizeAiRequest }));

const SESSION_ID = "b2407103-e48e-4b38-891d-50bea6615799";
const CLUSTER_ID = "1a749f63-6d61-4dcc-85bd-aa0b46f27413";

function query(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "upsert"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
  return builder;
}

function savedClient(packSaved = true, isOther = false) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "sessions") {
        return query({
          data: {
            id: SESSION_ID,
            question: CONTEXT.question,
            marking_scheme: CONTEXT.scheme,
            criteria: CONTEXT.criteria,
            subject: CONTEXT.subject,
            level: CONTEXT.level,
            max_score: 10,
          },
          error: null,
        });
      }
      if (table === "clusters") {
        return query({
          data: {
            id: CLUSTER_ID,
            session_id: SESSION_ID,
            label: "Trusted saved label",
            why: "Trusted saved reason",
            severity: 4,
            downstream: ["Resonance"],
            tone: 1,
            is_other: isOther,
          },
          error: null,
        });
      }
      if (table === "answers") {
        return query({
          data: MEMBERS.map((member) => ({
            id: member.id,
            student_ref: member.studentId,
            initials: member.initials,
            answer: member.answer,
            is_correct: member.isCorrect,
            cluster_id: CLUSTER_ID,
            error_signature: member.errorSignature,
            evidence_span: member.evidenceSpan,
            confidence: member.confidence,
            provisional_score: member.provisionalScore,
            criteria_met: member.criteriaMet,
            criteria_missed: member.criteriaMissed,
            score_rationale: member.scoreRationale,
            review_status: member.status,
          })),
          error: null,
        });
      }
      if (table === "reteach_packs") {
        return query({
          data: packSaved ? { id: "pack-1" } : null,
          error: packSaved ? null : { message: "write failed" },
        });
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

const CONTEXT = {
  question: "A series RL circuit…",
  scheme: "Full marks require…",
  criteria: [{ id: "c-1", label: "Reactance included", marks: 2 }],
  subject: "Electrical Engineering",
  level: "300 level",
};

function cluster(over: Partial<Cluster> = {}): Cluster {
  return {
    id: CLUSTER_ID,
    tone: 1,
    label: "Impedance is treated as resistance",
    why: "DC intuition carried forward.",
    memberIds: ["a-01"],
    severity: 4,
    downstream: ["Resonance"],
    isOther: false,
    ...over,
  };
}

const MEMBERS: StudentAnswer[] = [
  {
    id: "a-01",
    studentId: "EEE/1",
    initials: "AB",
    answer: "Z = R so I = 8 A",
    isCorrect: false,
    clusterId: "cl-1",
    errorSignature: "believes impedance equals resistance",
    evidenceSpan: "Z = R",
    confidence: 0.8,
    provisionalScore: 4,
    maxScore: 10,
    criteriaMet: [],
    criteriaMissed: ["c-1"],
    scoreRationale: "",
    status: "unreviewed",
  },
];

async function generate(params: {
  cluster?: Cluster;
  members?: StudentAnswer[];
  sessionId?: string | null;
}) {
  const { generateReteachAction } = await import("@/app/actions");
  return generateReteachAction({
    context: CONTEXT,
    cluster: params.cluster ?? cluster(),
    members: params.members ?? MEMBERS,
    sessionId: params.sessionId === undefined ? SESSION_ID : params.sessionId,
  });
}

beforeEach(() => {
  vi.resetModules();
  generateReteachPack.mockReset();
  getServerClient.mockResolvedValue(savedClient());
  authorizeAiRequest.mockReset().mockResolvedValue({
    ok: true,
    supabase: savedClient(),
    userId: "owner-1",
  });
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("generateReteachAction", () => {
  it("returns the generated pack", async () => {
    generateReteachPack.mockResolvedValue({
      clusterId: CLUSTER_ID,
      lesson: [{ heading: "The belief", body: "Said plainly." }],
      diagnostics: [
        { prompt: "Q1", holderAnswers: "wrong", correctedAnswers: "right" },
      ],
    });

    const result = await generate({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.lesson).toHaveLength(1);
      expect(result.pack.diagnostics).toHaveLength(1);
    }
  });

  it("declines to invent a lesson for the one-off bucket", async () => {
    const result = await generate({
      cluster: cluster({ id: "cl-other", isOther: true, memberIds: ["a", "b"] }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.lesson[0].heading).toMatch(/no shared belief/i);
      // No diagnostic, because there is no single belief to discriminate on.
      expect(result.pack.diagnostics).toHaveLength(0);
    }
    // And no model call was made to produce it.
    expect(generateReteachPack).not.toHaveBeenCalled();
  });

  it("opens a stored Other bucket without a model key or consuming AI quota", async () => {
    delete process.env.GEMINI_API_KEY;
    getServerClient.mockResolvedValue(savedClient(true, true));
    const result = await generate({ cluster: cluster({ isOther: true }) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pack.diagnostics).toEqual([]);
    expect(authorizeAiRequest).not.toHaveBeenCalled();
    expect(generateReteachPack).not.toHaveBeenCalled();
  });

  it("reports an unconfigured pipeline rather than failing opaquely", async () => {
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();

    const result = await generate({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_configured");
      expect(result.error).toMatch(/GEMINI_API_KEY/);
    }
    expect(generateReteachPack).not.toHaveBeenCalled();
  });

  it("surfaces a generation failure as a message, not an exception", async () => {
    generateReteachPack.mockRejectedValue(new Error("Gemini 429: quota"));

    const result = await generate({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("429");
  });

  it("refuses an empty lesson instead of rendering a blank pack", async () => {
    generateReteachPack.mockResolvedValue({
      clusterId: CLUSTER_ID,
      lesson: [],
      diagnostics: [],
    });

    const result = await generate({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty lesson/i);
  });

  it("uses the owned saved cluster instead of caller-supplied context", async () => {
    generateReteachPack.mockResolvedValue({
      clusterId: CLUSTER_ID,
      lesson: [{ heading: "h", body: "b" }],
      diagnostics: [],
    });

    await generate({ cluster: cluster({ label: "FORGED CALLER LABEL" }) });

    expect(generateReteachPack).toHaveBeenCalledTimes(1);
    const [, passedCluster] = generateReteachPack.mock.calls[0];
    expect(passedCluster.label).toBe("Trusted saved label");
  });

  it("reports a failed pack write instead of claiming the generated pack persisted", async () => {
    getServerClient.mockResolvedValue(savedClient(false));
    authorizeAiRequest.mockResolvedValue({
      ok: true,
      supabase: savedClient(false),
      userId: "owner-1",
    });
    generateReteachPack.mockResolvedValue({
      clusterId: CLUSTER_ID,
      lesson: [{ heading: "h", body: "b" }],
      diagnostics: [],
    });

    const result = await generate({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/could not be saved/i);
  });
});
