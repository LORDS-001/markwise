import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth-provider";
import { SessionProvider } from "@/components/session-provider";
import { AppShell } from "@/components/shell";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { installMatchMedia } from "../match-media";

vi.mock("next/navigation", () => ({
  usePathname: () => "/clusters/cl-impedance",
}));

vi.mock("@/lib/supabase/client", () => ({
  getBrowserClient: () => null,
}));

beforeEach(() => installMatchMedia(false));

it("keeps child routes oriented under their labelled parent step", () => {
  render(
    <ThemeProvider>
      <AuthProvider>
        <SessionProvider>
          <AppShell>
            <p>Cluster evidence</p>
          </AppShell>
        </SessionProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  const steps = screen.getByRole("navigation", { name: "Session steps" });
  expect(within(steps).getByRole("link", { name: /Misconception map/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
    "Detail",
  );
});

it("opens Settings from the labelled navigation", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <AuthProvider>
        <SessionProvider>
          <AppShell>
            <p>Content</p>
          </AppShell>
        </SessionProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

it("closes mobile navigation for Settings and restores focus to its trigger", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <AuthProvider>
        <SessionProvider>
          <AppShell>
            <p>Content</p>
          </AppShell>
        </SessionProvider>
      </AuthProvider>
    </ThemeProvider>,
  );

  const navigationTrigger = screen.getByRole("button", { name: "Open navigation" });
  await user.click(navigationTrigger);
  const navigation = screen.getByRole("dialog", { name: "Navigation" });
  await user.click(within(navigation).getByRole("button", { name: "Settings" }));

  expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeVisible();

  await user.keyboard("{Escape}");
  expect(navigationTrigger).toHaveFocus();
});
