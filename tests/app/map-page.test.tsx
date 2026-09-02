import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import MapPage from "@/app/map/page";

const state = vi.hoisted(() => {
  const clusters = Array.from({ length: 13 }, (_, index) => ({
    id: "cluster-" + index,
    label: "Misconception " + (index + 1),
    why: "Students use addition where the method requires a combined value.",
    memberIds: ["answer-" + index],
    severity: 2,
    downstream: [],
    isOther: false,
    tone: (index % 6) + 1,
  }));
  return {
    session: {
      answers: [],
      clusters,
      prediction: "",
      sortMode: "spread",
      processed: true,
      confirmed: false,
      confirmedBy: "",
      reviewedCount: 0,
      needsAttention: 0,
      exportReady: false,
      setScore: vi.fn(),
      setStatus: vi.fn(),
      acceptAbove: vi.fn(),
      resetReview: vi.fn(),
      renameCluster: vi.fn(),
      rejectCluster: vi.fn(),
      mergeCluster: vi.fn(),
      splitOut: vi.fn(),
      setPrediction: vi.fn(),
      setSortMode: vi.fn(),
      setProcessed: vi.fn(),
      setConfirmed: vi.fn(),
      setConfirmedBy: vi.fn(),
    },
  };
});

vi.mock("@/components/session-provider", () => ({
  useSession: () => state.session,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

it("falls back to the complete ranked list when the bubble map is too dense", () => {
  render(<MapPage />);
  expect(screen.getByText("Map hidden at this cluster count")).toBeVisible();
  expect(screen.getAllByRole("link", { name: /Misconception/i })).toHaveLength(13);
});

it("keeps sample mechanics inside the prioritisation disclosure and explains their scope", async () => {
  const user = userEvent.setup();
  render(<MapPage />);

  const summary = screen.getByText("How prioritisation works");
  const disclosure = summary.closest("details");
  expect(disclosure).not.toBeNull();

  for (const mechanic of ["Threshold 0.32", "Average linkage", "Cosine distance"]) {
    expect(within(disclosure!).getByText(mechanic)).not.toBeVisible();
  }
  expect(
    screen.queryByText("Clustering runs in the app, not in an external service."),
  ).not.toBeInTheDocument();

  await user.click(summary);

  expect(
    within(disclosure!).getByText(
      "This page ranks seeded sample clusters for the preview; it does not process the lecturer entries from setup.",
    ),
  ).toBeVisible();
  for (const mechanic of ["Threshold 0.32", "Average linkage", "Cosine distance"]) {
    expect(within(disclosure!).getByText(mechanic)).toBeVisible();
  }
});
