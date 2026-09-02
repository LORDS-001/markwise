import { useEffect, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReteachIndexPage from "@/app/reteach/page";
import ReteachPackPage from "@/app/reteach/[id]/page";
import { SessionProvider, useSession } from "@/components/session-provider";

const route = vi.hoisted(() => ({ id: "cl-arithmetic" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: route.id }),
}));

beforeEach(() => {
  route.id = "cl-arithmetic";
});

afterEach(() => {
  vi.restoreAllMocks();
});

function BeforeProcessing({ children }: { children: ReactNode }) {
  const { setProcessed } = useSession();
  useEffect(() => setProcessed(false), [setProcessed]);
  return children;
}

function WithSplitCluster({ children }: { children: ReactNode }) {
  const { clusters, splitOut } = useSession();
  useEffect(() => {
    if (clusters.some((cluster) => cluster.id === route.id)) return;
    const source = clusters.find((cluster) => cluster.id === "cl-impedance");
    const memberId = source?.memberIds[0];
    if (memberId) splitOut(source.id, [memberId], "Lecturer-created split");
  }, [clusters, splitOut]);
  return children;
}

function primaryActions(container: HTMLElement) {
  return container.querySelectorAll('[data-variant="primary"], a.bg-primary');
}

it("presents the cluster choices under one page heading", () => {
  render(
    <SessionProvider>
      <ReteachIndexPage />
    </SessionProvider>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Choose a misconception to reteach",
  );
  expect(screen.getAllByRole("link", { name: /View pack/i }).length).toBeGreaterThan(0);
});

it("makes copy the sole primary lesson action while keeping downloads secondary", () => {
  const { container } = render(
    <SessionProvider>
      <ReteachPackPage />
    </SessionProvider>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  const actions = screen.getByRole("region", { name: "Page actions" });
  expect(actions).toContainElement(screen.getByRole("button", { name: /copy lesson/i }));
  expect(screen.getByRole("button", { name: /copy lesson/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /download markdown/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /download roster csv/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /copy lesson/i })).toHaveAttribute(
    "data-variant",
    "primary",
  );
  expect(screen.getByRole("button", { name: /download markdown/i })).toHaveAttribute(
    "data-variant",
    "secondary",
  );
  expect(screen.getByRole("button", { name: /download roster csv/i })).toHaveAttribute(
    "data-variant",
    "secondary",
  );
  expect(primaryActions(container)).toHaveLength(1);
});

it("shows a clear sample-preview recovery state before processing", async () => {
  const { container } = render(
    <SessionProvider>
      <BeforeProcessing>
        <ReteachIndexPage />
      </BeforeProcessing>
    </SessionProvider>,
  );

  expect(
    await screen.findByRole("heading", { name: "The sample teaching packs aren't ready yet" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Prepare the sample analysis before choosing a seeded teaching pack to preview.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Preview sample analysis" })).toHaveAttribute(
    "href",
    "/processing",
  );
  expect(primaryActions(container).length).toBeLessThanOrEqual(1);
});

it("keeps a missing sample pack clear and limited to one recovery action", async () => {
  const splitTime = 123_456_789;
  vi.spyOn(Date, "now").mockReturnValue(splitTime);
  route.id = `cl-split-${splitTime.toString(36)}`;
  const { container } = render(
    <SessionProvider>
      <WithSplitCluster>
        <ReteachPackPage />
      </WithSplitCluster>
    </SessionProvider>,
  );

  expect(
    await screen.findByRole("heading", { name: "No sample pack for this cluster yet" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "This cluster was created by a split or merge, so a sample pack is not available for it yet.",
    ),
  ).toBeVisible();
  expect(screen.getAllByRole("link", { name: "Choose another cluster" })).toHaveLength(1);
  expect(primaryActions(container).length).toBeLessThanOrEqual(1);
});
