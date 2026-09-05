// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const admin = vi.hoisted(() => ({ rpc, from }));
const getAdminClient = vi.hoisted(() => vi.fn(() => admin));
const getServerClient = vi.hoisted(() => vi.fn());
const authorizeAiRequest = vi.hoisted(() => vi.fn());
const gradeDiagnostic = vi.hoisted(() => vi.fn());
const isPipelineConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ getServerClient }));
vi.mock("@/lib/server/ai-access", () => ({ authorizeAiRequest }));
vi.mock("@/lib/pipeline/grade-diagnostic", () => ({ gradeDiagnostic }));
vi.mock("@/lib/pipeline/gemini", () => ({ isPipelineConfigured }));

const TOKEN = "valid-saved-diagnostic-token";
const RESPONSES = ["First response", "Second response"];
const TRUSTED_QUESTIONS = [
  { prompt: "Stored Q1", holderAnswers: "Stored wrong 1", correctedAnswers: "Stored right 1" },
  { prompt: "Stored Q2", holderAnswers: "Stored wrong 2", correctedAnswers: "Stored right 2" },
];
const GRADED = [
  { verdict: "corrected", rationale: "Understands it." },
  { verdict: "holds", rationale: "Still shows it." },
];

beforeEach(() => {
  vi.resetModules();
  rpc.mockReset();
  from.mockReset();
  getAdminClient.mockReset().mockReturnValue(admin);
  getServerClient.mockReset();
  authorizeAiRequest.mockReset().mockResolvedValue({
    ok: true,
    supabase: admin,
    userId: "owner-1",
  });
  gradeDiagnostic.mockReset().mockResolvedValue(GRADED);
  isPipelineConfigured.mockReset().mockReturnValue(true);
});

describe("saved diagnostic actions", () => {
  it("rejects anything other than exactly two non-empty bounded responses", async () => {
    const { submitDiagnosticAction } = await import("@/app/actions");

    await expect(
      submitDiagnosticAction({ token: TOKEN, responses: ["Only one"] }),
    ).resolves.toMatchObject({ ok: false, recorded: false });
    await expect(
      submitDiagnosticAction({ token: TOKEN, responses: ["One", " "] }),
    ).resolves.toMatchObject({ ok: false, recorded: false });
    await expect(
      submitDiagnosticAction({ token: TOKEN, responses: ["One", "x".repeat(10_001)] }),
    ).resolves.toMatchObject({ ok: false, recorded: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not claim recording succeeded when the atomic write fails", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "write failed" } });
    const { submitDiagnosticAction } = await import("@/app/actions");

    const result = await submitDiagnosticAction({ token: TOKEN, responses: RESPONSES });

    expect(result).toMatchObject({ ok: false, recorded: false, graded: false });
    expect(gradeDiagnostic).not.toHaveBeenCalled();
    expect(authorizeAiRequest).not.toHaveBeenCalled();
  });

  it("grades only the immutable server-stored misconception and rubric", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "submit_diagnostic_attempt") {
        return { data: { status: "recorded" }, error: null };
      }
      if (name === "claim_diagnostic_grading") {
        return {
          data: {
            status: "claimed",
            claimId: "8c03f85e-ccee-49da-8c85-d6bb0cf2cb28",
            misconception: "Trusted stored misconception",
            questions: TRUSTED_QUESTIONS,
            responses: RESPONSES,
          },
          error: null,
        };
      }
      if (name === "complete_diagnostic_grading") {
        return { data: true, error: null };
      }
      if (name === "diagnostic_for_token") {
        return {
          data: [{ responses: GRADED.map((entry, questionIndex) => ({
            questionIndex,
            responseText: RESPONSES[questionIndex],
            ...entry,
          })) }],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    const { submitDiagnosticAction } = await import("@/app/actions");
    const forged = {
      token: TOKEN,
      responses: RESPONSES,
      misconception: "FORGED",
      questions: [{ prompt: "FORGED", holderAnswers: "", correctedAnswers: "" }],
    } as Parameters<typeof submitDiagnosticAction>[0];
    const result = await submitDiagnosticAction(forged);

    expect(result).toEqual({ ok: true, recorded: true, graded: true, verdicts: GRADED });
    expect(gradeDiagnostic).toHaveBeenCalledWith({
      misconception: "Trusted stored misconception",
      questions: TRUSTED_QUESTIONS,
      responses: RESPONSES,
    });
    expect(authorizeAiRequest).toHaveBeenCalledWith("diagnostic", TOKEN);
    expect(rpc).toHaveBeenCalledWith("complete_diagnostic_grading", {
      p_token: TOKEN,
      p_claim_id: "8c03f85e-ccee-49da-8c85-d6bb0cf2cb28",
      p_verdicts: GRADED,
    });
  });

  it("does not start a second paid grader while an attempt is claimed", async () => {
    rpc
      .mockResolvedValueOnce({ data: { status: "ungraded" }, error: null })
      .mockResolvedValueOnce({ data: { status: "busy" }, error: null });
    const { submitDiagnosticAction } = await import("@/app/actions");

    const result = await submitDiagnosticAction({ token: TOKEN, responses: RESPONSES });

    expect(result).toMatchObject({ ok: false, recorded: true, graded: false });
    expect(authorizeAiRequest).not.toHaveBeenCalled();
    expect(gradeDiagnostic).not.toHaveBeenCalled();
  });

  it("keeps a saved attempt truthful when authorization and claim release fail", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "submit_diagnostic_attempt") {
        return { data: { status: "recorded" }, error: null };
      }
      if (name === "claim_diagnostic_grading") {
        return {
          data: {
            status: "claimed",
            claimId: "8c03f85e-ccee-49da-8c85-d6bb0cf2cb28",
            misconception: "Trusted stored misconception",
            questions: TRUSTED_QUESTIONS,
            responses: RESPONSES,
          },
          error: null,
        };
      }
      if (name === "release_diagnostic_grading") throw new Error("release failed");
      throw new Error(`Unexpected RPC ${name}`);
    });
    authorizeAiRequest.mockRejectedValue(new Error("gate unavailable"));
    const { submitDiagnosticAction } = await import("@/app/actions");

    const result = await submitDiagnosticAction({ token: TOKEN, responses: RESPONSES });

    expect(result).toMatchObject({ ok: false, recorded: true, graded: false });
  });

  it("retries grading without resubmitting or replacing response text", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_diagnostic_grading") {
        return {
          data: {
            status: "claimed",
            claimId: "8c03f85e-ccee-49da-8c85-d6bb0cf2cb28",
            misconception: "Trusted stored misconception",
            questions: TRUSTED_QUESTIONS,
            responses: RESPONSES,
          },
          error: null,
        };
      }
      if (name === "complete_diagnostic_grading") return { data: true, error: null };
      if (name === "diagnostic_for_token") {
        return { data: [{ responses: GRADED }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    const { retryDiagnosticGradingAction } = await import("@/app/actions");

    await retryDiagnosticGradingAction({ token: TOKEN });

    expect(rpc.mock.calls.some(([name]) => name === "submit_diagnostic_attempt")).toBe(false);
    expect(gradeDiagnostic).toHaveBeenCalledWith({
      misconception: "Trusted stored misconception",
      questions: TRUSTED_QUESTIONS,
      responses: RESPONSES,
    });
  });

  it("returns only student-safe prompts and the persisted attempt state", async () => {
    getServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{
          cluster_label: "Stored misconception",
          cluster_why: "Why",
          lesson: [],
          questions: [{
            prompt: "Safe prompt",
            holderAnswers: "must never leave server",
            correctedAnswers: "must never leave server",
          }],
          responses: [],
          grading_status: "open",
        }],
        error: null,
      }),
    });
    const { diagnosticForTokenAction } = await import("@/app/actions");

    const result = await diagnosticForTokenAction(TOKEN);

    expect(result?.questions).toEqual([{ prompt: "Safe prompt" }]);
    expect(JSON.stringify(result)).not.toContain("must never leave server");
  });
});

describe("lecturer mutation actions", () => {
  const ANSWER_ID = "1a749f63-6d61-4dcc-85bd-aa0b46f27413";
  const SESSION_ID = "b2407103-e48e-4b38-891d-50bea6615799";

  it("rejects non-finite scores before issuing a database write", async () => {
    getServerClient.mockResolvedValue({ from });
    const { saveScoreAction } = await import("@/app/actions");

    await expect(
      saveScoreAction({ answerId: ANSWER_ID, score: Number.NaN, status: "edited" }),
    ).resolves.toMatchObject({ ok: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("checks a score against the stored session maximum", async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: ANSWER_ID, sessions: { max_score: 10 } },
      error: null,
    });
    from.mockReturnValue(query);
    getServerClient.mockResolvedValue({ from });
    const { saveScoreAction } = await import("@/app/actions");

    await expect(
      saveScoreAction({ answerId: ANSWER_ID, score: 11, status: "edited" }),
    ).resolves.toMatchObject({ ok: false });
    expect(query.update).toBeUndefined();
  });

  it("refuses batch confirmation while any saved row is unreviewed or flagged", async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn().mockResolvedValue({
      data: [{ review_status: "accepted" }, { review_status: "flagged" }],
      error: null,
    });
    from.mockImplementation((table: string) => {
      expect(table).toBe("answers");
      return query;
    });
    getServerClient.mockResolvedValue({ from });
    const { confirmBatchAction } = await import("@/app/actions");

    await expect(
      confirmBatchAction({ sessionId: SESSION_ID, confirmedBy: "Dr Reviewer" }),
    ).resolves.toMatchObject({ ok: false });
    expect(from).toHaveBeenCalledTimes(1);
  });
});
