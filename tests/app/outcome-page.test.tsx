import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import OutcomePage from "@/app/outcome/page";
import { SessionProvider } from "@/components/session-provider";
import { recordDiagnosticResponses } from "@/lib/diagnostic-store";
import { ANSWERS, CLUSTERS } from "@/lib/mock";
import type { DiagnosticVerdict } from "@/lib/types";

/**
 * The before/after screen — PRD v2 §5 step 8.
 *
 * The figure it shows is the product's headline claim, so these tests are
 * mostly about what it must NOT say: no improvement that was not measured.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/outcome",
}));

const IMPEDANCE = CLUSTERS.find((c) => c.id === "cl-impedance")!;
const MEMBERS = ANSWERS.filter((a) => a.clusterId === "cl-impedance");

function answerFor(count: number, verdict: DiagnosticVerdict) {
  return MEMBERS.slice(0, count).flatMap((member) =>
    [0, 1].map((questionIndex) => ({
      answerId: member.id,
      questionIndex,
      responseText: "…",
      verdict,
      rationale: "",
    })),
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

function renderOutcome() {
  return render(
    <SessionProvider>
      <OutcomePage />
    </SessionProvider>,
  );
}

it("shows the affected group before anyone has answered", async () => {
  renderOutcome();
  expect(
    await screen.findByRole("heading", { level: 1, name: "Did it land?" }),
  ).toBeVisible();
  expect(screen.getByText(`${MEMBERS.length} students`)).toBeVisible();
});

it("says the change is not yet measurable when nobody has answered", async () => {
  renderOutcome();
  expect(await screen.findAllByText("Not yet measurable")).not.toHaveLength(0);
});

it("never reads a low response rate as improvement", async () => {
  // One student of fifteen answers, and is corrected. The screen must not
  // imply the misconception has nearly vanished.
  recordDiagnosticResponses(answerFor(1, "corrected"));
  renderOutcome();

  await screen.findByRole("heading", { level: 1, name: "Did it land?" });
  expect(
    screen.getByText(new RegExp(`${MEMBERS.length - 1} students have not answered`)),
  ).toBeVisible();
  // Every cluster carries the caveat, so there are several on the page.
  expect(
    screen.getAllByText(/Neither is counted as a correction/).length,
  ).toBeGreaterThan(0);
});

it("reports the misconception cleared only when every decided answer is corrected", async () => {
  recordDiagnosticResponses(answerFor(MEMBERS.length, "corrected"));
  renderOutcome();

  await screen.findByRole("heading", { level: 1, name: "Did it land?" });
  expect(screen.getByText("Cleared")).toBeVisible();
});

it("reports the share still holding it against decided answers", async () => {
  // Two answered: one corrected, one still holding. That is 50%, measured
  // against the two who answered — not against the whole cluster.
  recordDiagnosticResponses([
    ...answerFor(1, "corrected"),
    ...MEMBERS.slice(1, 2).flatMap((member) =>
      [0, 1].map((questionIndex) => ({
        answerId: member.id,
        questionIndex,
        responseText: "…",
        verdict: "holds" as DiagnosticVerdict,
        rationale: "",
      })),
    ),
  ]);
  renderOutcome();

  await screen.findByRole("heading", { level: 1, name: "Did it land?" });
  expect(screen.getByText("50% still hold it")).toBeVisible();
});

it("labels the result as evidence rather than proof", async () => {
  renderOutcome();
  await screen.findByRole("heading", { level: 1, name: "Did it land?" });

  // PRD v2 §5 step 8 and §12 both require this caveat to be on the screen.
  expect(
    screen.getByText(/not proof of long-term learning/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/not proof that the reteach caused the change/i),
  ).toBeInTheDocument();
});

it("names the misconception being measured", async () => {
  renderOutcome();
  await screen.findByRole("heading", { level: 1, name: "Did it land?" });
  expect(screen.getByText(IMPEDANCE.label)).toBeVisible();
});
