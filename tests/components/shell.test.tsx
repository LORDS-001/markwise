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

it("renders one semantic skip target and focuses it from the skip link", async () => {
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

  const skipLink = screen.getByRole("link", { name: "Skip to content" });
  const mainTarget = screen.getByRole("main");
  expect(skipLink).toHaveAttribute("href", "#main");
  expect(mainTarget).toHaveAttribute("id", "main");
  expect(mainTarget).toHaveAttribute("tabindex", "-1");
  expect(document.querySelectorAll("#main")).toHaveLength(1);

  await user.tab();
  expect(skipLink).toHaveFocus();
  await user.keyboard("{Enter}");

  expect(window.location.hash).toBe("#main");
  expect(mainTarget).toHaveFocus();
});

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
  const settingsTrigger = screen.getAllByRole("button", { name: "Settings" })[0];
  await user.click(settingsTrigger);
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  expect(settingsTrigger).toHaveFocus();
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
