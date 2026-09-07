import { createRef, useLayoutEffect, useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppNavigation, resolveStep } from "@/components/app-navigation";
import { SessionProvider, useSession } from "@/components/session-provider";
import { TopBar } from "@/components/top-bar";
import type { PipelineResult } from "@/lib/pipeline/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/sessions" }));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ status: "demo", email: null }),
}));
vi.mock("@/lib/supabase/client", () => ({ getBrowserClient: () => null }));

const saveStatusAction = vi.hoisted(() => vi.fn(async () => ({ ok: false, error: "offline" })));
vi.mock("@/app/actions", () => ({ saveStatusAction }));
vi.mock("@/app/session-actions", () => ({
  invalidateReteachPacksAction: vi.fn(async () => ({ ok: true })),
}));

const ANSWER_ID = "30000000-0000-4000-8000-000000000001";
const RESULT: PipelineResult = {
  answers: [
    {
      id: ANSWER_ID,
      studentId: "EEE/1",
      initials: "AB",
      answer: "Z = R",
      isCorrect: false,
      clusterId: null,
      errorSignature: "impedance equals resistance",
      evidenceSpan: "Z = R",
      confidence: 0.8,
      provisionalScore: 4,
      maxScore: 10,
      criteriaMet: [],
      criteriaMissed: [],
      scoreRationale: "",
      status: "unreviewed",
      diagnosticToken: "token",
    },
  ],
  clusters: [],
  reteachPacks: {},
  maxScore: 10,
};
const CONTEXT = { question: "Question", scheme: "Scheme", criteria: [], subject: "", level: "" };

function AppliesSavedRun({ children }: { children: React.ReactNode }) {
  const { applyRun } = useSession();
  const applied = useRef(false);
  useLayoutEffect(() => {
    if (applied.current) return;
    applied.current = true;
    applyRun(RESULT, "10000000-0000-4000-8000-000000000001", CONTEXT, {
      code: "EEE 301",
      title: "Circuit Theory",
    });
  }, [applyRun]);
  return children;
}

it("links to saved sessions as a separate recovery destination", () => {
  render(
    <SessionProvider>
      <AppNavigation onOpenSettings={vi.fn()} />
    </SessionProvider>,
  );
  expect(screen.getByRole("link", { name: /saved sessions/i })).toHaveAttribute("href", "/sessions");
  expect(resolveStep("/sessions")).toBe("/sessions");
});

it("labels the seeded demo truthfully", () => {
  render(
    <SessionProvider>
      <TopBar onOpenNavigation={vi.fn()} navigationTriggerRef={createRef()} />
    </SessionProvider>,
  );
  expect(screen.getByText("Demo class")).toBeVisible();
});

function EditButton() {
  const { setStatus } = useSession();
  return <button onClick={() => setStatus(ANSWER_ID, "accepted")}>Edit score state</button>;
}

it("shows saved identity and makes a failed mirrored edit visible", async () => {
  render(
    <SessionProvider>
      <AppliesSavedRun>
        <TopBar onOpenNavigation={vi.fn()} navigationTriggerRef={createRef()} />
        <EditButton />
      </AppliesSavedRun>
    </SessionProvider>,
  );

  expect(await screen.findByText("Saved session")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Edit score state" }));
  expect(await screen.findByText("Save failed")).toBeVisible();
});
