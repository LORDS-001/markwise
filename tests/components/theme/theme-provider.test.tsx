import { act, render, screen, waitFor } from "@testing-library/react";
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

  it("falls back to light when creating the system media query throws", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("media queries blocked");
      }),
    });

    expect(() =>
      render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByLabelText("preference")).toHaveTextContent("system");
    expect(screen.getByLabelText("resolved theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("uses and symmetrically cleans up the legacy media-query listener API", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    let matches = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const query = {
      get matches() {
        return matches;
      },
      addListener(listener: (event: MediaQueryListEvent) => void) {
        listeners.add(listener);
      },
      removeListener(listener: (event: MediaQueryListEvent) => void) {
        listeners.delete(listener);
      },
    } as MediaQueryList;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => query),
    });

    const view = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(listeners.size).toBe(1);

    act(() => {
      matches = true;
      listeners.forEach((listener) =>
        listener({ matches, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent),
      );
    });
    expect(screen.getByLabelText("resolved theme")).toHaveTextContent("dark");

    view.unmount();
    expect(listeners.size).toBe(0);
  });

  it("keeps the snapshot when modern listener registration throws", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    const query = {
      matches: true,
      addEventListener() {
        throw new Error("modern registration blocked");
      },
      removeEventListener() {},
    } as unknown as MediaQueryList;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => query),
    });

    expect(() =>
      render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByLabelText("resolved theme")).toHaveTextContent("dark");
  });

  it("does not surface modern listener cleanup failures", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    const query = {
      matches: false,
      addEventListener() {},
      removeEventListener() {
        throw new Error("modern cleanup blocked");
      },
    } as unknown as MediaQueryList;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => query),
    });

    const view = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(() => view.unmount()).not.toThrow();
  });

  it("keeps the snapshot when legacy listener registration throws", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    const query = {
      matches: true,
      addListener() {
        throw new Error("legacy registration blocked");
      },
      removeListener() {},
    } as unknown as MediaQueryList;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => query),
    });

    expect(() =>
      render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByLabelText("resolved theme")).toHaveTextContent("dark");
  });

  it("does not surface legacy listener cleanup failures", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    const query = {
      matches: false,
      addListener() {},
      removeListener() {
        throw new Error("legacy cleanup blocked");
      },
    } as unknown as MediaQueryList;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => query),
    });

    const view = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(() => view.unmount()).not.toThrow();
  });

  it("synchronously reads the live query state when system tracking starts", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    const initialQuery = { matches: false } as MediaQueryList;
    let liveSnapshotRead = false;
    const liveQuery = {
      get matches() {
        liveSnapshotRead = true;
        return true;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValueOnce(initialQuery).mockReturnValue(liveQuery),
    });

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(liveSnapshotRead).toBe(true);
    await waitFor(() =>
      expect(screen.getByLabelText("resolved theme")).toHaveTextContent("dark"),
    );
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
