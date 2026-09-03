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

vi.mock("@/lib/pipeline/run", () => ({ runPipeline }));
vi.mock("@/lib/supabase/server", () => ({ getServerClient: async () => null }));

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

function request(body: unknown) {
  return new Request("http://localhost/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/run/route");
  return POST(request(body));
}

beforeEach(() => {
  vi.resetModules();
  runPipeline.mockReset();
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
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
  ];

  for (const [name, body] of cases) {
    it(`rejects ${name} with a reason`, async () => {
      const response = await post(body);
      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(typeof payload.error).toBe("string");
      expect(payload.error.length).toBeGreaterThan(0);
      expect(runPipeline).not.toHaveBeenCalled();
    });
  }

  it("rejects a body that is not JSON", async () => {
    const response = await post("not json at all");
    expect(response.status).toBe(400);
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
});
