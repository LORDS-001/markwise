import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import MapPage from "@/app/map/page";
import { SessionProvider, useSession } from "@/components/session-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function MapWithSessionControls() {
  const { clusters, rejectCluster } = useSession();
  const activeClusters = clusters.filter(
    (cluster) => !cluster.isOther && cluster.memberIds.length > 0,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => activeClusters.forEach((cluster) => rejectCluster(cluster.id))}
      >
        Reject all active clusters
      </button>
      <MapPage />
    </>
  );
}

it("offers one clear recovery action when the session has no active clusters", async () => {
  const user = userEvent.setup();
  render(
    <SessionProvider>
      <MapWithSessionControls />
    </SessionProvider>,
  );

  await user.click(screen.getByRole("button", { name: "Reject all active clusters" }));

  const heading = await screen.findByRole("heading", { name: "No misconceptions to map" });
  const emptyState = heading.parentElement;
  expect(emptyState).not.toBeNull();
  expect(within(emptyState!).getByText(/no active misconception clusters to review/i)).toBeVisible();
  expect(within(emptyState!).getAllByRole("link")).toHaveLength(1);
  expect(within(emptyState!).getByRole("link", { name: "Return to setup" })).toHaveAttribute(
    "href",
    "/",
  );
});
