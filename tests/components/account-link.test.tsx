import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AccountLink } from "@/components/account-link";
import { AuthProvider } from "@/components/auth-provider";

vi.mock("@/lib/supabase/client", () => ({
  getBrowserClient: () => null,
}));

it("exposes the optional account state as a named region", () => {
  render(
    <AuthProvider>
      <AccountLink />
    </AuthProvider>,
  );
  expect(
    screen.getByRole("region", { name: "Account connection" }),
  ).toBeVisible();
});
