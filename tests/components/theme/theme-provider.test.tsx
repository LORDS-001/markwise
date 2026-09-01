import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/components/theme/theme-provider";
import { THEME_STORAGE_KEY } from "@/components/theme/theme";
import { installMatchMedia } from "../../match-media";

function Probe() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <output aria-label="preference">{preference}</output>
      <output aria-label="resolved theme">{resolvedTheme}</output>
      <button onClick={() => setPreference("system")}>Use device setting</button>
      <button onClick={() => setPreference("dark")}>Dark</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    installMatchMedia(false);
  });

  it("hydrates from a valid stored preference and applies it to the root", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText("preference")).toHaveTextContent("dark");
    expect(screen.getByLabelText("resolved theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("tracks operating-system changes only while system is selected", async () => {
    const media = installMatchMedia(false);
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Use device setting" }));
    expect(screen.getByLabelText("resolved theme")).toHaveTextContent("light");
    act(() => media.setMatches(true));
    expect(screen.getByLabelText("resolved theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("removes the media listener after leaving system preference", async () => {
    const media = installMatchMedia(false);
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Use device setting" }));
    expect(media.listenerCount()).toBe(1);
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(media.listenerCount()).toBe(0);
    act(() => media.setMatches(false));
    expect(screen.getByLabelText("resolved theme")).toHaveTextContent("dark");
  });

  it("updates the current tab even when persistence is unavailable", async () => {
    const user = userEvent.setup();
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    storageSpy.mockRestore();
  });
});
