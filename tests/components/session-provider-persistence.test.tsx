import { useLayoutEffect, useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "@/components/session-provider";
import type { PipelineResult } from "@/lib/pipeline/types";

const actionMocks = vi.hoisted(() => ({
  saveScoreAction: vi.fn(),
  saveStatusAction: vi.fn(),
  renameClusterAction: vi.fn(),
  reassignAnswersAction: vi.fn(),
  deleteClusterAction: vi.fn(),
  createClusterAction: vi.fn(),
}));
const invalidateReteachPacksAction = vi.hoisted(() => vi.fn());
const updateClusterShapeAction = vi.hoisted(() => vi.fn());
const saveCompletedRunAction = vi.hoisted(() => vi.fn());
const getBrowserClient = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions", () => actionMocks);
vi.mock("@/app/session-actions", () => ({
  invalidateReteachPacksAction,
  updateClusterShapeAction,
  saveCompletedRunAction,
}));
vi.mock("@/lib/supabase/client", () => ({ getBrowserClient }));

const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const SOURCE_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_ID = "20000000-0000-4000-8000-000000000002";
const ANSWER_ID = "30000000-0000-4000-8000-000000000001";

const CONTEXT = {
  question: "A live question",
  scheme: "A live scheme",
  criteria: [{ id: "criterion", label: "Working", marks: 10 }],
  subject: "Engineering",
  level: "300 level",
};

const RESULT: PipelineResult = {
  answers: [
    {
      id: ANSWER_ID,
      studentId: "EEE/1",
      initials: "AB",
      answer: "Z = R",
      isCorrect: false,
      clusterId: SOURCE_ID,
      errorSignature: "believes impedance equals resistance",
      evidenceSpan: "Z = R",
      confidence: 0.8,
      provisionalScore: 4,
      maxScore: 10,
      criteriaMet: [],
      criteriaMissed: ["criterion"],
      scoreRationale: "",
      status: "unreviewed",
      diagnosticToken: "token-one",
    },
  ],
  clusters: [
    {
      id: SOURCE_ID,
      tone: 1,
      label: "Impedance is resistance",
      why: "DC intuition",
      memberIds: [ANSWER_ID],
      severity: 4,
      downstream: [],
      isOther: false,
    },
    {
      id: OTHER_ID,
      tone: 6,
      label: "Other",
      why: "One-offs",
      memberIds: [],
      severity: 1,
      downstream: [],
      isOther: true,
    },
  ],
  reteachPacks: {
    [SOURCE_ID]: {
      clusterId: SOURCE_ID,
      lesson: [{ heading: "Belief", body: "Body" }],
      diagnostics: [],
    },
    [OTHER_ID]: {
      clusterId: OTHER_ID,
      lesson: [{ heading: "One-offs", body: "Body" }],
      diagnostics: [],
    },
  },
  maxScore: 10,
};

function AppliesRun({ children }: { children: React.ReactNode }) {
  const { applyRun } = useSession();
  const applied = useRef(false);
  useLayoutEffect(() => {
    if (applied.current) return;
    applied.current = true;
    applyRun(RESULT, SESSION_ID, CONTEXT, {
      code: "EEE 301",
      title: "Circuit Theory",
    });
  }, [applyRun]);
  return children;
}

function MetadataProbe() {
  const { courseCode, courseTitle, isDemo } = useSession();
  return <p>{`${isDemo ? "demo" : "live"}|${courseCode}|${courseTitle}`}</p>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  getBrowserClient.mockReturnValue(null);
  invalidateReteachPacksAction.mockResolvedValue({ ok: true });
  updateClusterShapeAction.mockResolvedValue({ ok: true });
  saveCompletedRunAction.mockResolvedValue({ ok: true, sessionId: SESSION_ID, result: RESULT });
  for (const mock of Object.values(actionMocks)) mock.mockResolvedValue({ ok: true });
  actionMocks.createClusterAction.mockResolvedValue({ ok: true, clusterId: OTHER_ID });
});

it("keeps course metadata after pendingRun is cleared and restores it on refresh", async () => {
  const first = render(
    <SessionProvider>
      <AppliesRun>
        <MetadataProbe />
      </AppliesRun>
    </SessionProvider>,
  );

  expect(screen.getByText("live|EEE 301|Circuit Theory")).toBeVisible();
  await waitFor(() =>
    expect(window.sessionStorage.getItem("markwise:run:local")).toContain("EEE 301"),
  );
  first.unmount();

  render(
    <SessionProvider>
      <MetadataProbe />
    </SessionProvider>,
  );
  expect(await screen.findByText("live|EEE 301|Circuit Theory")).toBeVisible();
});

function RejectProbe() {
  const { answers, clusters, reteachPacks, rejectCluster, flushChanges } = useSession();
  const other = clusters.find((cluster) => cluster.isOther);
  return (
    <div>
      <button onClick={() => rejectCluster(SOURCE_ID)}>Reject</button>
      <button onClick={() => void flushChanges()}>Flush</button>
      <p data-testid="cluster-id">{answers[0].clusterId}</p>
      <p data-testid="other-members">{other?.memberIds.join(",")}</p>
      <p data-testid="packs">{Object.keys(reteachPacks).join(",")}</p>
    </div>
  );
}

it("rejects a UUID cluster into the actual Other UUID and invalidates stale packs", async () => {
  render(
    <SessionProvider>
      <AppliesRun>
        <RejectProbe />
      </AppliesRun>
    </SessionProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  expect(screen.getByTestId("cluster-id")).toHaveTextContent(OTHER_ID);
  expect(screen.getByTestId("other-members")).toHaveTextContent(ANSWER_ID);
  expect(screen.getByTestId("packs")).toBeEmptyDOMElement();
  await act(async () => void (await screen.getByRole("button", { name: "Flush" }).click()));
  await waitFor(() => expect(actionMocks.reassignAnswersAction).toHaveBeenCalled());
  expect(actionMocks.reassignAnswersAction).toHaveBeenCalledWith({
    answerIds: [ANSWER_ID],
    clusterId: OTHER_ID,
  });
});

function SaveProbe() {
  const { setStatus, flushChanges, saving, saveError } = useSession();
  const [flushed, setFlushed] = useState("pending");
  return (
    <div>
      <button onClick={() => setStatus(ANSWER_ID, "accepted")}>Accept</button>
      <button onClick={() => setStatus(ANSWER_ID, "flagged")}>Flag</button>
      <button onClick={async () => setFlushed(String(await flushChanges()))}>Flush</button>
      <p data-testid="saving">{String(saving)}</p>
      <p data-testid="error">{saveError}</p>
      <p data-testid="flushed">{flushed}</p>
    </div>
  );
}

it("exposes failed mirrored saves and makes flushChanges fail", async () => {
  actionMocks.saveStatusAction.mockResolvedValue({ ok: false, error: "database offline" });
  render(
    <SessionProvider>
      <AppliesRun>
        <SaveProbe />
      </AppliesRun>
    </SessionProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  fireEvent.click(screen.getByRole("button", { name: "Flush" }));

  await waitFor(() => expect(screen.getByTestId("flushed")).toHaveTextContent("false"));
  expect(screen.getByTestId("error")).toHaveTextContent("database offline");
});

function ScoreFailureProbe() {
  const { setScore, saveError, flushChanges, answers } = useSession();
  const [flushed, setFlushed] = useState("pending");
  return (
    <div>
      <button onClick={() => setScore(ANSWER_ID, 7)}>Edit score</button>
      <button onClick={() => setScore(ANSWER_ID, 7.5)}>Edit fractional score</button>
      <button onClick={async () => setFlushed(String(await flushChanges()))}>Check flush</button>
      <p data-testid="score-error">{saveError}</p>
      <p data-testid="score-flush">{flushed}</p>
      <p data-testid="score-value">{answers[0].provisionalScore}</p>
    </div>
  );
}

it("keeps a rejected score edit dirty after unmount and refresh", async () => {
  actionMocks.saveScoreAction.mockResolvedValue({ ok: false, error: "score not saved" });
  const first = render(
    <SessionProvider>
      <AppliesRun>
        <ScoreFailureProbe />
      </AppliesRun>
    </SessionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit score" }));
  await waitFor(() => expect(screen.getByTestId("score-error")).toHaveTextContent("score not saved"));
  await waitFor(() =>
    expect(window.sessionStorage.getItem("markwise:run:local")).toContain('"saveState":"failed"'),
  );
  first.unmount();

  render(
    <SessionProvider>
      <ScoreFailureProbe />
    </SessionProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("score-error")).not.toBeEmptyDOMElement());
  fireEvent.click(screen.getByRole("button", { name: "Check flush" }));
  await waitFor(() => expect(screen.getByTestId("score-flush")).toHaveTextContent("false"));
});

function AppliesUnsavedRun({ children }: { children: React.ReactNode }) {
  const { applyRun } = useSession();
  const applied = useRef(false);
  useLayoutEffect(() => {
    if (applied.current) return;
    applied.current = true;
    applyRun(RESULT, null, CONTEXT, { code: "EEE 301", title: "Circuit Theory" }, "Prediction");
  }, [applyRun]);
  return children;
}

function RetrySaveProbe() {
  const { retrySave, sessionId, saveError, flushChanges } = useSession();
  const [flushed, setFlushed] = useState("pending");
  return (
    <div>
      <button onClick={() => void retrySave()}>Retry save</button>
      <button onClick={async () => setFlushed(String(await flushChanges()))}>Flush retry</button>
      <p data-testid="retry-session">{sessionId}</p>
      <p data-testid="retry-error">{saveError}</p>
      <p data-testid="retry-flush">{flushed}</p>
    </div>
  );
}

it("can retry the initial atomic save without rerunning AI", async () => {
  render(
    <SessionProvider>
      <AppliesUnsavedRun>
        <RetrySaveProbe />
      </AppliesUnsavedRun>
    </SessionProvider>,
  );
  expect(screen.getByTestId("retry-error")).not.toBeEmptyDOMElement();
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(screen.getByTestId("retry-session")).toHaveTextContent(SESSION_ID));
  fireEvent.click(screen.getByRole("button", { name: "Flush retry" }));
  await waitFor(() => expect(screen.getByTestId("retry-flush")).toHaveTextContent("true"));
  expect(saveCompletedRunAction).toHaveBeenCalledTimes(1);
});

it("rounds a fractional edit before both local and remote state", async () => {
  render(
    <SessionProvider>
      <AppliesRun>
        <ScoreFailureProbe />
      </AppliesRun>
    </SessionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit fractional score" }));
  expect(screen.getByTestId("score-value")).toHaveTextContent("8");
  await waitFor(() => expect(actionMocks.saveScoreAction).toHaveBeenCalled());
  expect(actionMocks.saveScoreAction).toHaveBeenCalledWith({
    answerId: ANSWER_ID,
    score: 8,
    status: "edited",
  });
});

it("serializes mirrored writes so later edits cannot overtake earlier ones", async () => {
  let active = 0;
  let maxActive = 0;
  actionMocks.saveStatusAction.mockImplementation(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return { ok: true };
  });
  render(
    <SessionProvider>
      <AppliesRun>
        <SaveProbe />
      </AppliesRun>
    </SessionProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  fireEvent.click(screen.getByRole("button", { name: "Flag" }));
  fireEvent.click(screen.getByRole("button", { name: "Flush" }));

  expect(await screen.findByText("true")).toBeVisible();
  expect(maxActive).toBe(1);
});

function ConfirmationProbe() {
  const { confirmed, setConfirmed, setStatus } = useSession();
  return (
    <div>
      <button onClick={() => setConfirmed(true)}>Confirm</button>
      <button onClick={() => setStatus(ANSWER_ID, "accepted")}>Change review</button>
      <p data-testid="confirmed">{String(confirmed)}</p>
    </div>
  );
}

it("invalidates confirmation when review state changes", () => {
  render(
    <SessionProvider>
      <AppliesRun>
        <ConfirmationProbe />
      </AppliesRun>
    </SessionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(screen.getByTestId("confirmed")).toHaveTextContent("true");
  fireEvent.click(screen.getByRole("button", { name: "Change review" }));
  expect(screen.getByTestId("confirmed")).toHaveTextContent("false");
});

function MergeProbe() {
  const { mergeCluster, flushChanges } = useSession();
  return (
    <button
      onClick={async () => {
        mergeCluster(SOURCE_ID, OTHER_ID);
        await flushChanges();
      }}
    >
      Merge
    </button>
  );
}

it("mirrors merged severity and downstream fields so reload stays coherent", async () => {
  render(
    <SessionProvider>
      <AppliesRun>
        <MergeProbe />
      </AppliesRun>
    </SessionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Merge" }));
  await waitFor(() => expect(updateClusterShapeAction).toHaveBeenCalled());
  expect(updateClusterShapeAction).toHaveBeenCalledWith({
    clusterId: OTHER_ID,
    severity: 4,
    downstream: [],
  });
});

function SplitRenameProbe() {
  const { clusters, splitOut, renameCluster, flushChanges } = useSession();
  const split = clusters.find((cluster) => cluster.label === "New split");
  return (
    <div>
      <button onClick={() => splitOut(SOURCE_ID, [ANSWER_ID], "New split")}>Split</button>
      <button disabled={!split} onClick={() => split && renameCluster(split.id, "Renamed split")}>
        Rename split
      </button>
      <button onClick={() => void flushChanges()}>Flush aliases</button>
    </div>
  );
}

it("resolves a temporary split id before a queued follow-up edit", async () => {
  const realSplitId = "40000000-0000-4000-8000-000000000001";
  let resolveCreate!: (value: { ok: true; clusterId: string }) => void;
  actionMocks.createClusterAction.mockReturnValue(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );
  render(
    <SessionProvider>
      <AppliesRun>
        <SplitRenameProbe />
      </AppliesRun>
    </SessionProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Split" }));
  await waitFor(() => expect(actionMocks.createClusterAction).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Rename split" }));
  resolveCreate({ ok: true, clusterId: realSplitId });
  fireEvent.click(screen.getByRole("button", { name: "Flush aliases" }));

  await waitFor(() => expect(actionMocks.renameClusterAction).toHaveBeenCalled());
  expect(actionMocks.renameClusterAction).toHaveBeenCalledWith({
    clusterId: realSplitId,
    label: "Renamed split",
  });
});

it("restores only the snapshot scoped to the authenticated account", async () => {
  const authClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: "account-a" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  };
  getBrowserClient.mockReturnValue(authClient);
  window.sessionStorage.setItem(
    "markwise:run:user:account-b",
    JSON.stringify({
      answers: RESULT.answers,
      clusters: RESULT.clusters,
      reteachPacks: {},
      context: CONTEXT,
      prediction: "",
      sessionId: SESSION_ID,
      courseCode: "WRONG 999",
      courseTitle: "Another account",
      ownerKey: "user:account-b",
    }),
  );
  window.sessionStorage.setItem(
    "markwise:run:user:account-a",
    JSON.stringify({
      answers: RESULT.answers,
      clusters: RESULT.clusters,
      reteachPacks: {},
      context: CONTEXT,
      prediction: "",
      sessionId: SESSION_ID,
      courseCode: "EEE 301",
      courseTitle: "Circuit Theory",
      ownerKey: "user:account-a",
    }),
  );

  render(
    <SessionProvider>
      <MetadataProbe />
    </SessionProvider>,
  );

  expect(await screen.findByText("live|EEE 301|Circuit Theory")).toBeVisible();
  expect(screen.queryByText(/WRONG 999/)).not.toBeInTheDocument();
});
