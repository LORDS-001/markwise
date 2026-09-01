import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/components/auth-provider";

vi.mock("@/lib/supabase/client", () => ({
  getBrowserClient: () => null,
}));

function Probe() {
  const { error, linkEmail } = useAuth();
  return (
    <>
      <button
        onClick={async () => {
          await linkEmail("lecturer@example.edu");
        }}
      >
        Connect
      </button>
      <output>{error}</output>
    </>
  );
}

it("reports unavailable linking without claiming session persistence", async () => {
  const user = userEvent.setup();
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Connect" }));
  expect(screen.getByText("Account linking is unavailable in this preview.")).toBeVisible();
});
