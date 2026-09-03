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

vi.mock("@/lib/pipeline/reteach", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pipeline/reteach")>();
  return { ...actual, generateReteachPack };
});
vi.mock("@/lib/supabase/server", () => ({ getServerClient: async () => null }));

const CONTEXT = {
  question: "A series RL circuit…",
  scheme: "Full marks require…",
  criteria: [{ id: "c-1", label: "Reactance included", marks: 2 }],
  subject: "Electrical Engineering",
  level: "300 level",
};

function cluster(over: Partial<Cluster> = {}): Cluster {
  return {
    id: "cl-1",
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
}) {
  const { generateReteachAction } = await import("@/app/actions");
  return generateReteachAction({
    context: CONTEXT,
    cluster: params.cluster ?? cluster(),
    members: params.members ?? MEMBERS,
    sessionId: null,
  });
}

beforeEach(() => {
  vi.resetModules();
  generateReteachPack.mockReset();
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("generateReteachAction", () => {
  it("returns the generated pack", async () => {
    generateReteachPack.mockResolvedValue({
      clusterId: "cl-1",
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
      clusterId: "cl-1",
      lesson: [],
      diagnostics: [],
    });

    const result = await generate({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty lesson/i);
  });

  it("passes the cluster as it stands, so a rename reaches the lesson", async () => {
    // A lecturer who renamed or split a cluster must get a lesson written
    // against the corrected cluster, not the one the model first proposed.
    generateReteachPack.mockResolvedValue({
      clusterId: "cl-1",
      lesson: [{ heading: "h", body: "b" }],
      diagnostics: [],
    });

    await generate({ cluster: cluster({ label: "Renamed by the lecturer" }) });

    expect(generateReteachPack).toHaveBeenCalledTimes(1);
    const [, passedCluster] = generateReteachPack.mock.calls[0];
    expect(passedCluster.label).toBe("Renamed by the lecturer");
  });
});
