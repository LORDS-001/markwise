import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import ExportPage from "@/app/export/page";
import { ANSWERS, CLUSTERS, CRITERIA } from "@/lib/mock";

const actions = vi.hoisted(() => ({
  confirmBatchAction: vi.fn(),
  flushChanges: vi.fn(),
}));
vi.mock("@/app/actions", () => actions);
vi.mock("@/components/account-link", () => ({ AccountLink: () => null }));
vi.mock("@/components/session-provider", () => ({
  useSession: () => {
    const [confirmed, setConfirmed] = useState(false);
    const [confirmedBy, setConfirmedBy] = useState("Dr. Test");
    return {
      answers: ANSWERS.map((answer) => ({ ...answer, maxScore: 20, status: "accepted" })),
      clusters: CLUSTERS,
      needsAttention: 0,
      exportReady: true,
      blockedCount: 0,
      flaggedCount: 0,
      confirmed, setConfirmed, confirmedBy, setConfirmedBy,
      totalAnswers: ANSWERS.length,
      context: { question: "Test question", criteria: CRITERIA },
      courseCode: "TEST 101", courseTitle: "Test course",
      sessionId: "11111111-1111-4111-8111-111111111111",
      flushChanges: actions.flushChanges,
    };
  },
}));

beforeEach(() => {
  actions.confirmBatchAction.mockReset().mockResolvedValue({ ok: true });
  actions.flushChanges.mockReset().mockResolvedValue(true);
});

it("keeps export unconfirmed when the database rejects confirmation", async () => {
  actions.confirmBatchAction.mockResolvedValue({ ok: false, error: "A flagged score still needs review." });
  render(<ExportPage />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Confirm reviewer" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/flagged score/i);
  expect(screen.queryByRole("button", { name: "Download XLSX" })).not.toBeInTheDocument();
});

it("waits for score changes to save before confirming a saved batch", async () => {
  actions.flushChanges.mockResolvedValue(false);
  render(<ExportPage />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Confirm reviewer" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/save|sync/i);
  expect(actions.confirmBatchAction).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Download XLSX" })).not.toBeInTheDocument();
});

it("uses this batch's maximum in the class summary", () => {
  render(<ExportPage />);
  expect(screen.getByText(/\/ 20$/)).toBeVisible();
});
