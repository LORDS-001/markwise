import { useEffect, useRef, type ReactNode } from "react";
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

function WithSplitToneClusters({ children }: { children: ReactNode }) {
  const { clusters, splitOut } = useSession();
  const memberIds = useRef(
    clusters.find((cluster) => cluster.id === "cl-impedance")?.memberIds.slice(0, 3) ?? [],
  );
  useEffect(() => {
    let cancelled = false;
    async function createSplits() {
      for (const [index, label] of [
        "Tone four split",
        "Tone five split",
        "Tone six split",
      ].entries()) {
        await new Promise((resolve) => window.setTimeout(resolve, 20));
        if (cancelled) return;
        const memberId = memberIds.current[index];
        if (memberId) splitOut("cl-impedance", [memberId], label);
      }
    }
    void createSplits();
    return () => {
      cancelled = true;
    };
  }, [splitOut]);
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

it("uses exhaustive foregrounds for seeded and split-created cluster ranks", async () => {
  render(
    <SessionProvider>
      <WithSplitToneClusters>
        <ReteachIndexPage />
      </WithSplitToneClusters>
    </SessionProvider>,
  );

  const expectations = [
    ["Other / one-off errors", 0],
    ["Tone four split", 4],
    ["Tone five split", 5],
    ["Tone six split", 6],
  ] as const;
  for (const [label, tone] of expectations) {
    const link = await screen.findByRole("link", { name: new RegExp(label, "i") });
    const badge = link.querySelector("span.rounded-full");
    expect(badge).not.toBeNull();
    expect(badge).toHaveClass(`bg-[var(--c${tone})]`, `text-on-c${tone}`);
    expect(badge).not.toHaveClass("text-white");
  }
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

it("uses mapped cluster classes for lesson counts and diagnostic ranks", () => {
  render(
    <SessionProvider>
      <ReteachPackPage />
    </SessionProvider>,
  );

  for (const label of ["11", "1", "2"]) {
    const badge = screen.getByText(label, { selector: "span.rounded-full" });
    expect(badge).toHaveClass("bg-[var(--c2)]", "text-on-c2");
    expect(badge).not.toHaveClass("text-white");
  }
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

it("guards a direct teaching-pack route before sample processing", async () => {
  const { container } = render(
    <SessionProvider>
      <BeforeProcessing>
        <ReteachPackPage />
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
  expect(primaryActions(container)).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Copy lesson" })).not.toBeInTheDocument();
});

it("keeps a missing sample pack clear and limited to one recovery action", async () => {
  const splitId = "40000000-0000-4000-8000-000000000001";
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(splitId);
  route.id = `cl-split-${splitId}`;
  const { container } = render(
    <SessionProvider>
      <WithSplitCluster>
        <ReteachPackPage />
      </WithSplitCluster>
    </SessionProvider>,
  );

  expect(
    await screen.findByRole("heading", { name: "No pack for this cluster yet" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Generate a five-minute micro-lesson written against this specific belief, plus two diagnostic questions to confirm the fix landed.",
    ),
  ).toBeVisible();
  // A cluster with no pack is now an invitation to generate one, not a dead
  // end — but generating stays the single primary action on the screen.
  expect(
    screen.getByRole("button", { name: "Generate reteach pack" }),
  ).toBeVisible();
  expect(screen.getAllByRole("link", { name: "Choose another cluster" })).toHaveLength(1);
  expect(primaryActions(container).length).toBeLessThanOrEqual(1);
});
