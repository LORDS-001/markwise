import { useLayoutEffect, useRef, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ExportPage from "@/app/export/page";
import { AuthProvider } from "@/components/auth-provider";
import { SessionProvider, useSession } from "@/components/session-provider";
import type { ReviewStatus } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/export",
}));

// The ready state renders the account link, which needs auth context. No
// Supabase here: the gate is client-side logic and must hold without it.
vi.mock("@/lib/supabase/client", () => ({
  getBrowserClient: () => null,
}));

/**
 * Drives every answer to one status, then renders the export screen.
 *
 * PRD §6 step 7: "nothing exports while any score is unreviewed or flagged
 * low-confidence." The flagged half of that is the one worth pinning — a
 * flagged row has been read, so any gate keyed on "has the lecturer looked at
 * this" lets exactly the scores they objected to through to the registry.
 */
function AllAnswersAt({
  status,
  flagFirst,
  children,
}: {
  status: ReviewStatus;
  flagFirst?: boolean;
  children: ReactNode;
}) {
  const { answers, setStatus } = useSession();
  // Guarded: each setStatus produces a new `answers`, so an unguarded effect
  // keyed on it would re-run forever.
  const prepared = useRef(false);

  useLayoutEffect(() => {
    if (prepared.current) return;
    prepared.current = true;
    answers.forEach((answer, index) =>
      setStatus(answer.id, flagFirst && index === 0 ? "flagged" : status),
    );
  }, [answers, setStatus, status, flagFirst]);

  return children;
}

it("opens the gate once every row is accepted", async () => {
  render(
    <AuthProvider>
      <SessionProvider>
      <AllAnswersAt status="accepted">
        <ExportPage />
      </AllAnswersAt>
      </SessionProvider>
    </AuthProvider>,
  );

  expect(
    await screen.findByRole("heading", { level: 1, name: "Export reviewed results" }),
  ).toBeVisible();
});

it("keeps the gate shut when a single row is flagged", async () => {
  render(
    <AuthProvider>
      <SessionProvider>
      <AllAnswersAt status="accepted" flagFirst>
        <ExportPage />
      </AllAnswersAt>
      </SessionProvider>
    </AuthProvider>,
  );

  expect(
    await screen.findByRole("heading", { level: 1, name: "Export is locked" }),
  ).toBeVisible();
  // The count must reflect the flagged row. Reading "0 of 40 still need you"
  // beside a locked gate would look like a bug in the gate rather than a row
  // the lecturer still has to settle.
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: /^1 of \d+ rows still need you$/,
    }),
  ).toBeVisible();
});

it("explains a flagged row as the lecturer's own objection, not an unread one", async () => {
  render(
    <AuthProvider>
      <SessionProvider>
      <AllAnswersAt status="accepted" flagFirst>
        <ExportPage />
      </AllAnswersAt>
      </SessionProvider>
    </AuthProvider>,
  );

  expect(
    await screen.findByText(/flagged — you raised those yourself/),
  ).toBeVisible();
});

it("keeps the gate shut while rows are merely unreviewed", async () => {
  render(
    <AuthProvider>
      <SessionProvider>
      <ExportPage />
      </SessionProvider>
    </AuthProvider>,
  );

  expect(
    screen.getByRole("heading", { level: 1, name: "Export is locked" }),
  ).toBeVisible();
});

it("treats an edited score as settled, since editing is a decision", async () => {
  render(
    <AuthProvider>
      <SessionProvider>
      <AllAnswersAt status="edited">
        <ExportPage />
      </AllAnswersAt>
      </SessionProvider>
    </AuthProvider>,
  );

  expect(
    await screen.findByRole("heading", { level: 1, name: "Export reviewed results" }),
  ).toBeVisible();
});
