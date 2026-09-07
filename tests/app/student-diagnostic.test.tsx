import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StudentDiagnosticPage from "@/app/d/[token]/page";
import { ANSWERS, CLUSTERS } from "@/lib/mock";
import { readDiagnosticResponses } from "@/lib/diagnostic-store";

/**
 * The student's surface — PRD v2 §5 step 7.
 *
 * The privacy tests here are the point. A student reaching this page has no
 * account, so nothing but the token stands between them and the rest of the
 * class. If any of these ever fail, the page is leaking somebody's work.
 */

const route = { token: "" };
vi.mock("next/navigation", () => ({
  useParams: () => route,
}));

const submitDiagnosticAction = vi.hoisted(() => vi.fn());
const retryDiagnosticGradingAction = vi.hoisted(() => vi.fn());
const diagnosticForTokenAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions", () => ({
  submitDiagnosticAction,
  retryDiagnosticGradingAction,
  diagnosticForTokenAction,
}));

const IMPEDANCE = ANSWERS.find((a) => a.clusterId === "cl-impedance")!;
const CLUSTER = CLUSTERS.find((c) => c.id === "cl-impedance")!;

beforeEach(() => {
  window.localStorage.clear();
  submitDiagnosticAction.mockReset();
  retryDiagnosticGradingAction.mockReset();
  diagnosticForTokenAction.mockReset().mockResolvedValue(null);
  route.token = IMPEDANCE.diagnosticToken!;
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("shows this student their own misconception", () => {
  render(<StudentDiagnosticPage />);
  expect(
    screen.getByRole("heading", { level: 1, name: CLUSTER.label }),
  ).toBeVisible();
});

it("shows no other student's identity or answer", () => {
  const { container } = render(<StudentDiagnosticPage />);
  const text = container.textContent ?? "";

  // No student identifiers at all — not even this student's own.
  expect(text).not.toMatch(/EEE\/022\/\d+/);
  // No raw answer text from the batch.
  for (const other of ANSWERS.slice(0, 8)) {
    expect(text).not.toContain(other.answer);
  }
});

it("does not put the lecturer's session one click away", () => {
  render(<StudentDiagnosticPage />);
  expect(screen.queryByRole("link", { name: /score review/i })).toBeNull();
  expect(screen.queryByRole("link", { name: /misconception map/i })).toBeNull();
  expect(screen.queryByText("This session")).toBeNull();
});

it("tells a student with an unknown link that it opens nothing", async () => {
  route.token = "not-a-real-token";
  render(<StudentDiagnosticPage />);

  expect(
    await screen.findByRole("heading", { name: /doesn't open anything/i }),
  ).toBeVisible();
  expect(screen.queryByText(CLUSTER.label)).toBeNull();
});

it("will not send until something has been written", async () => {
  render(<StudentDiagnosticPage />);
  expect(screen.getByRole("button", { name: /send my answers/i })).toBeDisabled();
});

it("keeps seeded diagnostics local and explicitly ungraded", async () => {
  const user = userEvent.setup();
  render(<StudentDiagnosticPage />);

  const boxes = screen.getAllByRole("textbox");
  await user.type(boxes[0], "Z is the square root of R squared plus X squared.");
  await user.type(boxes[1], "Doubling frequency increases reactance and lowers current.");
  await user.click(screen.getByRole("button", { name: /send my answers/i }));

  expect(await screen.findByRole("status")).toHaveTextContent(/saved on this device/i);
  expect(screen.getByRole("status")).toHaveTextContent(/not automatically marked/i);
  expect(submitDiagnosticAction).not.toHaveBeenCalled();
  expect(readDiagnosticResponses()).toHaveLength(2);
  expect(readDiagnosticResponses().every((row) => row.verdict === null)).toBe(true);
});

it("restores a complete seeded attempt after remount and keeps it ungraded", async () => {
  const user = userEvent.setup();
  const first = render(<StudentDiagnosticPage />);

  await user.type(screen.getAllByRole("textbox")[0], "Saved demo answer one.");
  await user.type(screen.getAllByRole("textbox")[1], "Saved demo answer two.");
  await user.click(screen.getByRole("button", { name: /send my answers/i }));
  await screen.findByText(/saved on this device/i);

  first.unmount();
  render(<StudentDiagnosticPage />);

  expect(await screen.findByDisplayValue("Saved demo answer one.")).toBeDisabled();
  expect(screen.getByDisplayValue("Saved demo answer two.")).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(/saved on this device/i);
  expect(screen.getByRole("status")).toHaveTextContent(/not automatically marked/i);
  expect(screen.queryByRole("button", { name: /send my answers/i })).toBeNull();
});

it("keeps the seeded form retryable when browser storage rejects the write", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage is blocked", "SecurityError");
  });
  const user = userEvent.setup();
  render(<StudentDiagnosticPage />);

  await user.type(screen.getAllByRole("textbox")[0], "Unsaved demo answer one.");
  await user.type(screen.getAllByRole("textbox")[1], "Unsaved demo answer two.");
  await user.click(screen.getByRole("button", { name: /send my answers/i }));

  expect(await screen.findByRole("status")).toHaveTextContent(/could not be saved/i);
  expect(screen.queryByText(/^Your answers were saved on this device/i)).toBeNull();
  expect(screen.getAllByRole("textbox")[0]).toBeEnabled();
  expect(screen.getAllByRole("textbox")[1]).toBeEnabled();
  expect(screen.getByRole("button", { name: /send my answers/i })).toBeEnabled();
});

it("ignores malformed or incomplete stored demo attempts", async () => {
  window.localStorage.setItem(
    "markwise:diagnostics",
    JSON.stringify([
      null,
      {
        answerId: IMPEDANCE.id,
        questionIndex: 0,
        responseText: "Only one stored response.",
        verdict: null,
        rationale: "",
      },
    ]),
  );

  render(<StudentDiagnosticPage />);

  expect(readDiagnosticResponses()).toHaveLength(1);
  expect(await screen.findByDisplayValue("Only one stored response.")).toBeEnabled();
  expect(screen.getAllByRole("textbox")[1]).toHaveValue("");
  expect(screen.getByRole("button", { name: /send my answers/i })).toBeDisabled();
});

it("locks a saved attempt only after the server confirms it was recorded", async () => {
  route.token = "saved-token";
  diagnosticForTokenAction.mockResolvedValue({
    clusterLabel: "Trusted stored misconception",
    clusterWhy: "Stored context",
    lesson: [],
    questions: [{ prompt: "Stored Q1" }, { prompt: "Stored Q2" }],
    responses: [],
    status: "open",
  });
  submitDiagnosticAction.mockResolvedValue({
    ok: false,
    recorded: false,
    graded: false,
    error: "Your answers could not be recorded. Try again.",
  });

  const user = userEvent.setup();
  render(<StudentDiagnosticPage />);

  await screen.findByRole("heading", { name: "Trusted stored misconception" });
  await user.type(screen.getAllByRole("textbox")[0], "Some reasoning here.");
  await user.type(screen.getAllByRole("textbox")[1], "A second response.");
  await user.click(screen.getByRole("button", { name: /send my answers/i }));

  expect(await screen.findByRole("status")).toHaveTextContent(/could not be recorded/i);
  expect(screen.getByRole("button", { name: /send my answers/i })).toBeEnabled();
  expect(screen.getAllByRole("textbox")[0]).toBeEnabled();
  expect(readDiagnosticResponses()).toHaveLength(0);
});

it("uses the stored prompts, persists both answers, and shows returned verdicts", async () => {
  route.token = "saved-token";
  diagnosticForTokenAction.mockResolvedValue({
    clusterLabel: "Trusted stored misconception",
    clusterWhy: "Stored context",
    lesson: [],
    questions: [{ prompt: "Stored Q1" }, { prompt: "Stored Q2" }],
    responses: [],
    status: "open",
  });
  submitDiagnosticAction.mockResolvedValue({
    ok: true,
    recorded: true,
    graded: true,
    verdicts: [
      { verdict: "corrected", rationale: "Combines them in quadrature." },
      { verdict: "holds", rationale: "Still treats Z as R." },
    ],
  });

  const user = userEvent.setup();
  render(<StudentDiagnosticPage />);

  await screen.findByText("Stored Q1");
  await user.type(screen.getAllByRole("textbox")[0], "First saved answer.");
  await user.type(screen.getAllByRole("textbox")[1], "Second saved answer.");
  await user.click(screen.getByRole("button", { name: /send my answers/i }));

  expect(await screen.findByText("Combines them in quadrature.")).toBeVisible();
  expect(screen.getByText("Still treats Z as R.")).toBeVisible();
  expect(submitDiagnosticAction).toHaveBeenCalledWith({
    token: "saved-token",
    responses: ["First saved answer.", "Second saved answer."],
  });
  expect(submitDiagnosticAction).toHaveBeenCalledTimes(1);
  expect(readDiagnosticResponses()).toHaveLength(0);
});

it("restores persisted answers and verdicts without permitting another attempt", async () => {
  route.token = "saved-token";
  diagnosticForTokenAction.mockResolvedValue({
    clusterLabel: "Trusted stored misconception",
    clusterWhy: "",
    lesson: [],
    questions: [{ prompt: "Stored Q1" }, { prompt: "Stored Q2" }],
    responses: [
      { questionIndex: 0, responseText: "Saved one", verdict: "corrected", rationale: "Good." },
      { questionIndex: 1, responseText: "Saved two", verdict: "holds", rationale: "Still present." },
    ],
    status: "graded",
  });

  render(<StudentDiagnosticPage />);

  expect(await screen.findByDisplayValue("Saved one")).toBeDisabled();
  expect(screen.getByDisplayValue("Saved two")).toBeDisabled();
  expect(screen.getByText("Good.")).toBeVisible();
  expect(screen.getByText("Still present.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /send my answers/i })).toBeNull();
});

it("permits marking retry for an immutable saved attempt", async () => {
  route.token = "saved-token";
  diagnosticForTokenAction.mockResolvedValue({
    clusterLabel: "Trusted stored misconception",
    clusterWhy: "",
    lesson: [],
    questions: [{ prompt: "Stored Q1" }, { prompt: "Stored Q2" }],
    responses: [
      { questionIndex: 0, responseText: "Saved one", verdict: null, rationale: "" },
      { questionIndex: 1, responseText: "Saved two", verdict: null, rationale: "" },
    ],
    status: "ungraded",
  });
  retryDiagnosticGradingAction.mockResolvedValue({
    ok: true,
    recorded: true,
    graded: true,
    verdicts: [
      { verdict: "corrected", rationale: "Now graded." },
      { verdict: "corrected", rationale: "Now graded." },
    ],
  });

  const user = userEvent.setup();
  render(<StudentDiagnosticPage />);

  expect(await screen.findByDisplayValue("Saved one")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: /retry marking/i }));
  expect(await screen.findAllByText("Now graded.")).toHaveLength(2);
  expect(retryDiagnosticGradingAction).toHaveBeenCalledWith({ token: "saved-token" });
});
