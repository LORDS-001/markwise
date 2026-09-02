"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DARK_MEDIA_QUERY,
  DEFAULT_THEME,
  applyResolvedTheme,
  getSystemPrefersDark,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/components/theme/theme";

export type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function browserPreference() {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    return readThemePreference(window.localStorage);
  } catch {
    return DEFAULT_THEME;
  }
}

function browserSystemPreference() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return getSystemPrefersDark(window.matchMedia.bind(window));
}

function browserStorage() {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(browserPreference);
  const [systemPrefersDark, setSystemPrefersDark] =
    useState(browserSystemPreference);
  const resolvedTheme = resolveTheme(preference, systemPrefersDark);

  useLayoutEffect(() => {
    applyResolvedTheme(resolvedTheme, document.documentElement);
  }, [resolvedTheme]);

  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window.matchMedia !== "function") return;

    let query: MediaQueryList;
    let matches: boolean;
    try {
      query = window.matchMedia(DARK_MEDIA_QUERY);
      matches = query.matches;
    } catch {
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (active) setSystemPrefersDark(matches);
    });

    const onChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    if (
      typeof query.addEventListener === "function" &&
      typeof query.removeEventListener === "function"
    ) {
      query.addEventListener("change", onChange);
      return () => {
        active = false;
        query.removeEventListener("change", onChange);
      };
    }

    if (
      typeof query.addListener === "function" &&
      typeof query.removeListener === "function"
    ) {
      query.addListener(onChange);
      return () => {
        active = false;
        query.removeListener(onChange);
      };
    }

    return () => {
      active = false;
    };
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    const systemDark = browserSystemPreference();
    setSystemPrefersDark(systemDark);
    setPreferenceState(next);
    writeThemePreference(next, browserStorage());
    applyResolvedTheme(
      resolveTheme(next, systemDark),
      document.documentElement,
    );
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
