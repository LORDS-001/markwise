import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  getSystemPrefersDark,
  isThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_BOOTSTRAP_SCRIPT,
  writeThemePreference,
} from "@/components/theme/theme";

describe("theme domain", () => {
  it("accepts only the three supported preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
  });

  it("falls back to light for missing, invalid, or inaccessible storage", () => {
    expect(readThemePreference(undefined)).toBe(DEFAULT_THEME);
    expect(readThemePreference({ getItem: () => "sepia" })).toBe(DEFAULT_THEME);
    expect(readThemePreference({ getItem: () => { throw new Error("storage blocked"); } })).toBe(DEFAULT_THEME);
  });

  it("resolves system preference without changing explicit choices", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("reads the operating-system preference and tolerates media-query failure", () => {
    expect(getSystemPrefersDark(() => ({ matches: true }) as MediaQueryList)).toBe(true);
    expect(getSystemPrefersDark(() => { throw new Error("media query unavailable"); })).toBe(false);
  });

  it("persists only the supported preference and tolerates write failures", () => {
    const setItem = vi.fn();
    writeThemePreference("system", { setItem });
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "system");
    expect(() => writeThemePreference("dark", { setItem: () => { throw new Error("storage blocked"); } })).not.toThrow();
  });

  it("applies both the root attribute and native color scheme", () => {
    applyResolvedTheme("dark", document.documentElement);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("runs the bootstrap against the stored preference before React state exists", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    Function(THEME_BOOTSTRAP_SCRIPT)();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
