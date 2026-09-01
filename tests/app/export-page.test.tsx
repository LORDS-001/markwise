import { useEffect, useRef, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ExportPage from "@/app/export/page";
import { AuthProvider } from "@/components/auth-provider";
import { SessionProvider, useSession } from "@/components/session-provider";

vi.mock("@/lib/supabase/client", () => ({
  getBrowserClient: () => null,
}));

function ReviewedSession({ children }: { children: ReactNode }) {
  const { answers, setStatus } = useSession();
  const prepared = useRef(false);
  useEffect(() => {
    if (prepared.current) return;
    prepared.current = true;
    answers.forEach((answer) => setStatus(answer.id, "accepted"));
  }, [answers, setStatus]);
  return children;
}

it("orders confirmation, format, preview, and one next action", async () => {
  const { container } = render(
    <AuthProvider>
      <SessionProvider>
        <ReviewedSession>
          <ExportPage />
        </ReviewedSession>
      </SessionProvider>
    </AuthProvider>,
  );
  expect(
    await screen.findByRole("heading", { level: 1, name: "Export reviewed results" }),
  ).toBeVisible();
  expect(screen.getByText("Choose a format")).toBeVisible();
  expect(screen.getByText("Preview")).toBeVisible();
  expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
});
