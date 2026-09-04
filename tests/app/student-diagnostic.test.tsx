import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
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
const diagnosticForTokenAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions", () => ({
  submitDiagnosticAction,
  diagnosticForTokenAction,
}));

const IMPEDANCE = ANSWERS.find((a) => a.clusterId === "cl-impedance")!;
const CLUSTER = CLUSTERS.find((c) => c.id === "cl-impedance")!;

beforeEach(() => {
  window.localStorage.clear();
  submitDiagnosticAction.mockReset();
  diagnosticForTokenAction.mockReset().mockResolvedValue(null);
  route.token = IMPEDANCE.diagnosticToken!;
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

it("sends the answers and shows the verdicts", async () => {
  submitDiagnosticAction.mockResolvedValue({
    ok: true,
    verdicts: [
      { verdict: "corrected", rationale: "Combines them in quadrature." },
      { verdict: "holds", rationale: "Still treats Z as R." },
    ],
  });

  const user = userEvent.setup();
  render(<StudentDiagnosticPage />);

  const boxes = screen.getAllByRole("textbox");
  await user.type(boxes[0], "Z is the square root of R squared plus X squared.");
  await user.click(screen.getByRole("button", { name: /send my answers/i }));

  await waitFor(() =>
    expect(screen.getByText("Combines them in quadrature.")).toBeVisible(),
  );
  expect(screen.getByText("Still treats Z as R.")).toBeVisible();
});

it("records the answers even when marking fails", async () => {
  // A student cannot be asked to sit it twice, so their work must survive a
  // grader outage. Losing it to a quota error would be unrecoverable.
  submitDiagnosticAction.mockResolvedValue({
    ok: false,
    graded: false,
    error: "Your answers were recorded. They could not be marked automatically yet.",
  });

  const user = userEvent.setup();
  render(<StudentDiagnosticPage />);

  await user.type(screen.getAllByRole("textbox")[0], "Some reasoning here.");
  await user.click(screen.getByRole("button", { name: /send my answers/i }));

  await waitFor(() => expect(readDiagnosticResponses().length).toBeGreaterThan(0));
  const stored = readDiagnosticResponses();
  expect(stored[0].responseText).toContain("Some reasoning here.");
  // Ungraded, and explicitly not counted as a correction.
  expect(stored[0].verdict).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent(/could not be marked/i);
});

it("does not let the same student submit twice", async () => {
  submitDiagnosticAction.mockResolvedValue({
    ok: true,
    verdicts: [
      { verdict: "corrected", rationale: "Good." },
      { verdict: "corrected", rationale: "Good." },
    ],
  });

  const user = userEvent.setup();
  render(<StudentDiagnosticPage />);

  await user.type(screen.getAllByRole("textbox")[0], "An answer.");
  await user.click(screen.getByRole("button", { name: /send my answers/i }));

  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /send my answers/i })).toBeNull(),
  );
  expect(submitDiagnosticAction).toHaveBeenCalledTimes(1);
});
