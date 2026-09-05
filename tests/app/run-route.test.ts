// @vitest-environment node
//
// The route is server code, and the pipeline refuses to initialise where a
// `window` exists — that guard is what stops an import chain dragging API keys
// into the client bundle. Running this file in jsdom would trip it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Validation at the run endpoint.
 *
 * This is where a malformed batch has to be turned away. Letting one through
 * spends a lecturer's quota to produce a diagnosis of nothing, and the failure
 * surfaces two minutes later as an empty map rather than as a refused request.
 */

const runPipeline = vi.hoisted(() => vi.fn());
const authorizeAiRequest = vi.hoisted(() => vi.fn());
const persistRun = vi.hoisted(() => vi.fn());

vi.mock("@/lib/pipeline/run", () => ({
  runPipeline,
  estimateMaximumPipelineRequests: (answerCount: number) =>
    answerCount + 1 + Math.floor(answerCount / 2),
}));
vi.mock("@/lib/server/ai-access", () => ({ authorizeAiRequest }));
vi.mock("@/lib/db/persist", () => ({ persistRun }));

const SUPABASE = { from: vi.fn() };

const VALID_INPUT = {
  question: "A series RL circuit…",
  scheme: "Full marks require the reactance…",
  criteria: [{ id: "c-1", label: "Reactance included", marks: 2 }],
  subject: "Electrical Engineering",
  level: "300 level",
  answers: [
    { studentRef: "EEE/1", text: "Z = R so I = 8 A" },
    { studentRef: "EEE/2", text: "X_L = 31.4 so Z = 43.4" },
  ],
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

async function post(body: unknown, headers?: Record<string, string>) {
  const { POST } = await import("@/app/api/run/route");
  return POST(request(body, headers));
}

beforeEach(() => {
  vi.resetModules();
  runPipeline.mockReset();
  authorizeAiRequest.mockReset();
  authorizeAiRequest.mockResolvedValue({
    ok: true,
    supabase: SUPABASE,
    userId: "user-1",
  });
  persistRun.mockReset();
  persistRun.mockImplementation(async ({ result }) => ({
    sessionId: "session-1",
    result,
  }));
  delete process.env.GEMINI_RPM;
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_RPM;
});

describe("refusing an unusable batch", () => {
  const cases: [string, unknown][] = [
    ["no question", { input: { ...VALID_INPUT, question: "  " } }],
    ["no marking scheme", { input: { ...VALID_INPUT, scheme: "" } }],
    ["no criteria", { input: { ...VALID_INPUT, criteria: [] } }],
    ["a single answer", { input: { ...VALID_INPUT, answers: [VALID_INPUT.answers[0]] } }],
    [
      "an empty answer",
      {
        input: {
          ...VALID_INPUT,
          answers: [VALID_INPUT.answers[0], { studentRef: "EEE/2", text: "   " }],
        },
      },
    ],
    [
      "a scheme worth no marks",
      {
        input: {
          ...VALID_INPUT,
          criteria: [{ id: "c-1", label: "Reactance included", marks: 0 }],
        },
      },
    ],
    ["no input at all", {}],
    [
      "a non-finite criterion mark",
      {
        input: {
          ...VALID_INPUT,
          criteria: [{ id: "c-1", label: "Reactance included", marks: "Infinity" }],
        },
      },
    ],
    [
      "a fractional criterion mark",
      {
        input: {
          ...VALID_INPUT,
          criteria: [{ id: "c-1", label: "Reactance included", marks: 1.5 }],
        },
      },
    ],
    [
      "a duplicate criterion id",
      {
        input: {
          ...VALID_INPUT,
          criteria: [
            { id: "c-1", label: "First", marks: 1 },
            { id: "c-1", label: "Second", marks: 1 },
          ],
        },
      },
    ],
    [
      "malformed optional metadata",
      { input: { ...VALID_INPUT, subject: { name: "Engineering" } } },
    ],
    [
      "an answer over 10,000 characters",
      {
        input: {
          ...VALID_INPUT,
          answers: [VALID_INPUT.answers[0], { studentRef: "EEE/2", text: "x".repeat(10_001) }],
        },
      },
    ],
  ];

  for (const [name, body] of cases) {
    it(`rejects ${name} with a reason`, async () => {
      const response = await post(body);
      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(typeof payload.error).toBe("string");
      expect(payload.error.length).toBeGreaterThan(0);
      expect(runPipeline).not.toHaveBeenCalled();
      expect(authorizeAiRequest).not.toHaveBeenCalled();
    });
  }

  it("rejects a body that is not JSON", async () => {
    const response = await post("not json at all");
    expect(response.status).toBe(400);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("rejects more than 100 answers before consuming an AI budget", async () => {
    const response = await post({
      input: {
        ...VALID_INPUT,
        answers: Array.from({ length: 101 }, (_, index) => ({
          studentRef: `student-${index}`,
          text: "A valid answer",
        })),
      },
    });

    expect(response.status).toBe(400);
    expect(authorizeAiRequest).not.toHaveBeenCalled();
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("enforces the streamed 1 MiB cap when Content-Length is missing", async () => {
    const oversized = JSON.stringify({
      input: { ...VALID_INPUT, question: "q".repeat(1024 * 1024) },
    });
    const response = await post(oversized);

    expect(response.status).toBe(413);
    expect(authorizeAiRequest).not.toHaveBeenCalled();
    expect(runPipeline).not.toHaveBeenCalled();
  });
});

describe("authorizing live work", () => {
  it("rejects an unauthenticated run without calling Gemini", async () => {
    authorizeAiRequest.mockResolvedValue({
      ok: false,
      error: "Sign in to run marking.",
      status: 401,
    });

    const response = await post({ input: VALID_INPUT });

    expect(response.status).toBe(401);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("returns a durable quota refusal without calling Gemini", async () => {
    authorizeAiRequest.mockResolvedValue({
      ok: false,
      error: "Daily AI limit reached. Try again tomorrow.",
      status: 429,
    });

    const response = await post({ input: VALID_INPUT });

    expect(response.status).toBe(429);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("rejects a batch that cannot pass the configured limiter within the run budget", async () => {
    const response = await post({
      input: {
        ...VALID_INPUT,
        answers: Array.from({ length: 50 }, (_, index) => ({
          studentRef: `student-${index}`,
          text: "A valid answer",
        })),
      },
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "batch_exceeds_runtime" });
    expect(authorizeAiRequest).not.toHaveBeenCalled();
    expect(runPipeline).not.toHaveBeenCalled();
  });
});

describe("when the pipeline is not configured", () => {
  it("refuses up front rather than failing mid-batch", async () => {
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();

    const response = await post({ input: VALID_INPUT });
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.code).toBe("not_configured");
    expect(runPipeline).not.toHaveBeenCalled();
  });
});

describe("accepting a usable batch", () => {
  const RESULT = {
    answers: [],
    clusters: [],
    reteachPacks: {},
    maxScore: 2,
  };

  it("streams NDJSON and passes the trimmed input through", async () => {
    runPipeline.mockResolvedValue(RESULT);

    const response = await post({
      input: { ...VALID_INPUT, question: "  A series RL circuit…  " },
      prediction: "They'll forget reactance.",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    // A buffering proxy would defeat the point of streaming progress.
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");

    const text = await response.text();
    const events = text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(events.at(-1)).toMatchObject({ type: "result" });

    expect(runPipeline).toHaveBeenCalledTimes(1);
    expect(runPipeline.mock.calls[0][0].question).toBe("A series RL circuit…");
    expect(runPipeline.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);
    expect(persistRun).toHaveBeenCalledWith(
      expect.objectContaining({ supabase: SUPABASE, ownerId: "user-1" }),
    );
  });

  it("reports a pipeline failure as an error event, not a broken stream", async () => {
    runPipeline.mockRejectedValue(new Error("39 of 40 answers could not be read."));

    const response = await post({ input: VALID_INPUT });
    expect(response.status).toBe(200);

    const events = (await response.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(events.at(-1)).toMatchObject({
      type: "error",
      message: "39 of 40 answers could not be read.",
    });
  });

  it("forwards progress events in order", async () => {
    runPipeline.mockImplementation(
      async (
        _input: unknown,
        onProgress: (event: { stage: string; progress: number }) => void,
      ) => {
        onProgress({ stage: "extract", progress: 0.5 });
        onProgress({ stage: "extract", progress: 1 });
        return RESULT;
      },
    );

    const response = await post({ input: VALID_INPUT });
    const events = (await response.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    expect(events.map((e) => e.type)).toEqual(["progress", "progress", "result"]);
    expect(events[0]).toMatchObject({ stage: "extract", progress: 0.5 });
  });

  it("admits a worst-case 40-answer run at the conservative default RPM", async () => {
    runPipeline.mockResolvedValue(RESULT);
    const response = await post({
      input: {
        ...VALID_INPUT,
        answers: Array.from({ length: 40 }, (_, index) => ({
          studentRef: `student-${index}`,
          text: "A valid answer",
        })),
      },
    });

    expect(response.status).toBe(200);
    await response.text();
    expect(runPipeline).toHaveBeenCalledTimes(1);
  });

  it("emits a separate warning event when embeddings degrade", async () => {
    runPipeline.mockImplementation(
      async (
        _input: unknown,
        onProgress: (event: {
          stage: string;
          progress: number;
          warning?: string;
        }) => void,
      ) => {
        onProgress({
          stage: "embed",
          progress: 1,
          warning: "Embedding was unavailable; answers remain unclustered.",
        });
        return RESULT;
      },
    );

    const response = await post({ input: VALID_INPUT });
    const events = (await response.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(events).toContainEqual({
      type: "warning",
      message: "Embedding was unavailable; answers remain unclustered.",
    });
  });

  it("ends a run that exceeds the total route budget with an error event", async () => {
    vi.useFakeTimers();
    runPipeline.mockImplementation(
      async (
        _input: unknown,
        _onProgress: unknown,
        options: { signal: AbortSignal },
      ) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
        }),
    );

    const response = await post({ input: VALID_INPUT });
    const body = response.text();
    await vi.advanceTimersByTimeAsync(270_000);
    const events = (await body)
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(events.at(-1)).toMatchObject({
      type: "error",
      message: expect.stringMatching(/run time budget/i),
    });
  });
});
