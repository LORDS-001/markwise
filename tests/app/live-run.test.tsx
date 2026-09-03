import { useLayoutEffect, useRef, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProcessingPage from "@/app/processing/page";
import { SessionProvider, useSession } from "@/components/session-provider";
import type { PipelineResult } from "@/lib/pipeline/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/processing",
}));

/**
 * Exercises the path a real batch takes: setup hands over a pending run, the
 * processing screen streams it, and the result lands in session state.
 *
 * Everything else in the suite covers the seeded demo class, which never
 * touches fetch, the NDJSON reader, or applyRun. Those are the parts that only
 * run when a lecturer marks their own batch — the parts that must not be first
 * exercised on stage.
 */

const RESULT: PipelineResult = {
  answers: [
    {
      id: "row-1",
      studentId: "EEE/1",
      initials: "AB",
      answer: "Z = R so I = 8 A",
      isCorrect: false,
      clusterId: "cl-1",
      errorSignature: "believes impedance equals resistance",
      evidenceSpan: "Z = R",
      confidence: 0.82,
      provisionalScore: 4,
      maxScore: 10,
      criteriaMet: [],
      criteriaMissed: ["c-1"],
      scoreRationale: "Substitution rests on a conceptual error.",
      status: "unreviewed",
    },
    {
      id: "row-2",
      studentId: "EEE/2",
      initials: "CD",
      answer: "X_L = 31.4, Z = 43.4, I = 5.5 A",
      isCorrect: true,
      clusterId: null,
      errorSignature: null,
      evidenceSpan: null,
      confidence: 0.95,
      provisionalScore: 10,
      maxScore: 10,
      criteriaMet: ["c-1"],
      criteriaMissed: [],
      scoreRationale: "Complete.",
      status: "unreviewed",
    },
  ],
  clusters: [
    {
      id: "cl-1",
      tone: 1,
      label: "Impedance is treated as resistance",
      why: "DC intuition carried forward.",
      memberIds: ["row-1"],
      severity: 4,
      downstream: ["Resonance in RLC circuits"],
      isOther: false,
    },
  ],
  reteachPacks: {},
  maxScore: 10,
};

/** Builds a response whose body streams the given NDJSON lines in chunks. */
function streamingResponse(lines: string[], chunkSize = Number.MAX_SAFE_INTEGER) {
  const payload = lines.join("");
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payload);
  let offset = 0;

  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (offset >= bytes.length) return { done: true, value: undefined };
            const end = Math.min(offset + chunkSize, bytes.length);
            const value = bytes.slice(offset, end);
            offset = end;
            return { done: false, value };
          },
        };
      },
    },
  } as unknown as Response;
}

const line = (event: unknown) => `${JSON.stringify(event)}\n`;

function StartsRun({ children }: { children: ReactNode }) {
  const { startRun } = useSession();
  const started = useRef(false);

  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    startRun({
      input: {
        question: "A series RL circuit…",
        scheme: "Full marks require…",
        criteria: [{ id: "c-1", label: "Reactance included", marks: 10 }],
        subject: "Electrical Engineering",
        level: "300 level",
        answers: [
          { studentRef: "EEE/1", text: "Z = R so I = 8 A" },
          { studentRef: "EEE/2", text: "X_L = 31.4, Z = 43.4, I = 5.5 A" },
        ],
      },
      prediction: "They'll forget reactance.",
    });
  }, [startRun]);

  return children;
}

/** Reads session state out so assertions can see what the run produced. */
function SessionProbe() {
  const { answers, clusters, isDemo, totalAnswers } = useSession();
  return (
    <div>
      <span data-testid="is-demo">{isDemo ? "demo" : "real"}</span>
      <span data-testid="total">{totalAnswers}</span>
      <span data-testid="clusters">{clusters.map((c) => c.label).join("|")}</span>
      <span data-testid="students">{answers.map((a) => a.studentId).join("|")}</span>
    </div>
  );
}

function renderRun() {
  return render(
    <SessionProvider>
      <StartsRun>
        <ProcessingPage />
        <SessionProbe />
      </StartsRun>
    </SessionProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // A finished run is written to sessionStorage so a reload does not discard a
  // lecturer's marking. jsdom keeps that store for the whole file, so without
  // clearing it each test would start already restored into the previous
  // test's run rather than on the demo class.
  window.sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("posts the batch to the run endpoint", async () => {
  fetchMock.mockResolvedValue(
    streamingResponse([line({ type: "result", sessionId: null, result: RESULT })]),
  );

  renderRun();

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/run");
  expect(init.method).toBe("POST");
  const body = JSON.parse(init.body);
  expect(body.input.answers).toHaveLength(2);
  expect(body.prediction).toBe("They'll forget reactance.");
});

it("lands the result in session state and leaves demo mode", async () => {
  fetchMock.mockResolvedValue(
    streamingResponse([line({ type: "result", sessionId: null, result: RESULT })]),
  );

  renderRun();

  await waitFor(() =>
    expect(screen.getByTestId("is-demo")).toHaveTextContent("real"),
  );
  expect(screen.getByTestId("total")).toHaveTextContent("2");
  expect(screen.getByTestId("students")).toHaveTextContent("EEE/1|EEE/2");
  expect(screen.getByTestId("clusters")).toHaveTextContent(
    "Impedance is treated as resistance",
  );
});

it("reassembles events split across chunk boundaries", async () => {
  // A single JSON object routinely spans two network chunks. Parsing each
  // chunk independently drops the event, and the run would appear to stall.
  fetchMock.mockResolvedValue(
    streamingResponse(
      [
        line({ type: "progress", stage: "extract", progress: 0.5 }),
        line({ type: "result", sessionId: null, result: RESULT }),
      ],
      7,
    ),
  );

  renderRun();

  await waitFor(() =>
    expect(screen.getByTestId("is-demo")).toHaveTextContent("real"),
  );
  expect(screen.getByTestId("students")).toHaveTextContent("EEE/1|EEE/2");
});

it("shows the run as complete once the result arrives", async () => {
  fetchMock.mockResolvedValue(
    streamingResponse([line({ type: "result", sessionId: null, result: RESULT })]),
  );

  renderRun();

  expect(
    await screen.findByRole("heading", { level: 1, name: "Sample analysis ready" }),
  ).toBeVisible();
});

it("surfaces a pipeline error instead of an empty map, and offers a retry", async () => {
  fetchMock.mockResolvedValue(
    streamingResponse([
      line({ type: "progress", stage: "extract", progress: 1 }),
      line({
        type: "error",
        message: "39 of 40 answers could not be read.",
      }),
    ]),
  );

  renderRun();

  expect(
    await screen.findByRole("heading", { level: 1, name: "The run stopped" }),
  ).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "39 of 40 answers could not be read.",
  );
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  // The batch must not be presented as a diagnosis of the class.
  expect(screen.getByTestId("is-demo")).toHaveTextContent("demo");
});

it("keeps the result when saving it failed, and says so", async () => {
  fetchMock.mockResolvedValue(
    streamingResponse([
      line({ type: "warning", message: "The run finished but could not be saved." }),
      line({ type: "result", sessionId: null, result: RESULT }),
    ]),
  );

  renderRun();

  await waitFor(() =>
    expect(screen.getByTestId("is-demo")).toHaveTextContent("real"),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "The run finished but could not be saved.",
  );
});

it("reports a refused request rather than hanging on the progress bar", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    body: null,
    json: async () => ({ error: "The marking pipeline is not configured." }),
  } as unknown as Response);

  renderRun();

  expect(
    await screen.findByRole("heading", { level: 1, name: "The run stopped" }),
  ).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "The marking pipeline is not configured.",
  );
});

it("does not start a second run for the same batch", async () => {
  fetchMock.mockResolvedValue(
    streamingResponse([line({ type: "result", sessionId: null, result: RESULT })]),
  );

  renderRun();

  await waitFor(() =>
    expect(screen.getByTestId("is-demo")).toHaveTextContent("real"),
  );
  // Re-running a finished batch would bill the lecturer twice and overwrite
  // the marking they are already looking at.
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
