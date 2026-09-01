# Markwise Theme and Shell Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build the semantic light/dark theme system, accessible Settings panel, compact framed application shell, and reusable lecturer-first UI primitives.

**Architecture:** Keep app/layout.tsx as the server-owned root and place interactive appearance state in a narrow client ThemeProvider. A synchronous inline bootstrap sets the resolved data-theme attribute before first paint, while shared semantic CSS tokens drive Tailwind utilities and all components. Reusable OverlayPanel, SettingsDialog, Disclosure, PageHeader, and ActionArea units keep focus behavior and hierarchy out of the route pages.

**Tech Stack:** Next.js 16.3.3 App Router, React 19.2.8, strict TypeScript 5, Tailwind CSS 4, Vitest, jsdom, React Testing Library, Lucide React.

**Spec:** docs/superpowers/specs/2026-09-01-sluice-inspired-ui-theme-design.md

## Global Constraints

- Retain Manrope for interface and reading text.
- Retain IBM Plex Mono for compact metadata, labels, counters, and technical values.
- Preserve Markwise's navy and cyan brand colors.
- Navigation remains compact, always labeled, and seven stages long.
- Light is the fallback when no valid stored preference exists.
- Appearance choices are exactly Light, Dark, and Use device setting.
- Store only the appearance string under markwise-theme; never store answers, lecturer names, email addresses, or session data as part of this work.
- Keep app/layout.tsx a Server Component and keep the existing domain pages and providers on their current client boundaries.
- Do not change grading, clustering, authentication, session, review, or export behavior.
- Use 4-pixel base spacing, an 8-point layout rhythm, 12-16 pixel card radii, and 10-pixel field radii.
- Meet WCAG 2.1 AA contrast, keyboard, focus, dialog, drawer, and reduced-motion requirements.
- Read these bundled Next.js 16.3.3 guides before editing production code:
  - node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
  - node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
  - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md
  - node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md
  - node_modules/next/dist/docs/01-app/01-getting-started/11-css.md

---

### Task 1: Add the test harness and theme-domain contract

**Files:**

- Modify: package.json
- Modify: package-lock.json
- Create: vitest.config.mts
- Create: vitest.setup.ts
- Create: tests/match-media.ts
- Create: tests/components/theme/theme.test.ts
- Create: components/theme/theme.ts

**Interfaces:**

- Consumes: Browser Storage, MediaQueryList, and document.documentElement when available.
- Produces:
  - ThemePreference = "light" | "dark" | "system"
  - ResolvedTheme = "light" | "dark"
  - THEME_STORAGE_KEY = "markwise-theme"
  - DEFAULT_THEME = "light"
  - isThemePreference(value: unknown): value is ThemePreference
  - readThemePreference(storage?: Pick<Storage, "getItem">): ThemePreference
  - writeThemePreference(preference: ThemePreference, storage?: Pick<Storage, "setItem">): void
  - resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme
  - getSystemPrefersDark(matchMedia?: Window["matchMedia"]): boolean
  - applyResolvedTheme(theme: ResolvedTheme, root?: HTMLElement): void
  - THEME_BOOTSTRAP_SCRIPT: string

- [ ] **Step 1: Install the smallest Next-documented component-test stack**

Run:

~~~powershell
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths @testing-library/user-event @testing-library/jest-dom
~~~

Add these scripts to package.json:

~~~json
{
  "test": "vitest",
  "test:run": "vitest run",
  "typecheck": "tsc --noEmit --incremental false"
}
~~~

Create vitest.config.mts:

~~~typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    clearMocks: true,
  },
});
~~~

Create vitest.setup.ts:

~~~typescript
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  document.documentElement.style.colorScheme = "light";
  vi.restoreAllMocks();
});
~~~

- [ ] **Step 2: Add a deterministic matchMedia test helper**

Create tests/match-media.ts:

~~~typescript
import { vi } from "vitest";

export function installMatchMedia(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const mediaQuery = {
    media: "(prefers-color-scheme: dark)",
    get matches() {
      return matches;
    },
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });

  return {
    setMatches(next: boolean) {
      matches = next;
      const event = {
        matches,
        media: mediaQuery.media,
      } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
    listenerCount() {
      return listeners.size;
    },
  };
}
~~~

- [ ] **Step 3: Write the failing theme-domain tests**

Create tests/components/theme/theme.test.ts:

~~~typescript
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
    expect(
      readThemePreference({
        getItem: () => {
          throw new Error("storage blocked");
        },
      }),
    ).toBe(DEFAULT_THEME);
  });

  it("resolves system preference without changing explicit choices", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("reads the operating-system preference and tolerates media-query failure", () => {
    expect(
      getSystemPrefersDark(() => ({ matches: true }) as MediaQueryList),
    ).toBe(true);
    expect(
      getSystemPrefersDark(() => {
        throw new Error("media query unavailable");
      }),
    ).toBe(false);
  });

  it("persists only the supported preference and tolerates write failures", () => {
    const setItem = vi.fn();
    writeThemePreference("system", { setItem });
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "system");
    expect(() =>
      writeThemePreference("dark", {
        setItem: () => {
          throw new Error("storage blocked");
        },
      }),
    ).not.toThrow();
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
~~~

- [ ] **Step 4: Run the theme-domain test and verify RED**

Run:

~~~powershell
npm run test:run -- tests/components/theme/theme.test.ts
~~~

Expected: FAIL because components/theme/theme.ts does not exist.

- [ ] **Step 5: Implement the minimal theme-domain module**

Create components/theme/theme.ts:

~~~typescript
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "markwise-theme";
export const DEFAULT_THEME: ThemePreference = "light";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(
  storage?: Pick<Storage, "getItem">,
): ThemePreference {
  if (!storage) return DEFAULT_THEME;
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage?: Pick<Storage, "setItem">,
) {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    return;
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function getSystemPrefersDark(matchMedia?: Window["matchMedia"]) {
  if (!matchMedia) return false;
  try {
    return matchMedia(DARK_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

export function applyResolvedTheme(
  theme: ResolvedTheme,
  root?: HTMLElement,
) {
  if (!root) return;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

export const THEME_BOOTSTRAP_SCRIPT =
  '(function(){var d=document.documentElement,p="light";try{var s=localStorage.getItem("markwise-theme");if(s==="light"||s==="dark"||s==="system")p=s}catch(e){}var k=p==="dark";if(p==="system"){try{k=window.matchMedia("(prefers-color-scheme: dark)").matches}catch(e){k=false}}var t=k?"dark":"light";d.setAttribute("data-theme",t);d.style.colorScheme=t})()';
~~~

- [ ] **Step 6: Run focused and static verification**

Run:

~~~powershell
npm run test:run -- tests/components/theme/theme.test.ts
npm run typecheck
npm run lint
~~~

Expected: all commands exit 0 with no warnings introduced by this task.

- [ ] **Step 7: Commit the test foundation and theme contract**

~~~powershell
git add package.json package-lock.json vitest.config.mts vitest.setup.ts tests/match-media.ts tests/components/theme/theme.test.ts components/theme/theme.ts
git commit -m "test: add theme contract and component harness"
~~~

---

### Task 2: Add the pre-paint bootstrap, ThemeProvider, and semantic tokens

**Files:**

- Create: components/theme/theme-provider.tsx
- Create: tests/components/theme/theme-provider.test.tsx
- Modify: app/layout.tsx:22-60
- Modify: app/globals.css:1-219

**Interfaces:**

- Consumes: Every theme-domain export from Task 1.
- Produces:
  - ThemeContextValue with preference, resolvedTheme, and setPreference
  - ThemeProvider({ children }: { children: ReactNode })
  - useTheme(): ThemeContextValue
  - Root data-theme value consumed by semantic CSS variables

- [ ] **Step 1: Write failing provider behavior tests**

Create tests/components/theme/theme-provider.test.tsx:

~~~tsx
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
~~~

- [ ] **Step 2: Run the provider test and verify RED**

Run:

~~~powershell
npm run test:run -- tests/components/theme/theme-provider.test.tsx
~~~

Expected: FAIL because components/theme/theme-provider.tsx does not exist.

- [ ] **Step 3: Implement ThemeProvider**

Create components/theme/theme-provider.tsx:

~~~tsx
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
    const query = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    setSystemPrefersDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
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
~~~

- [ ] **Step 4: Wire bootstrap and provider into the server root**

In app/layout.tsx, retain metadata, fonts, the skip link, AuthProvider, SessionProvider, and AppShell. Make these exact root changes:

~~~tsx
import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_BOOTSTRAP_SCRIPT } from "@/components/theme/theme";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9eef1" },
    { media: "(prefers-color-scheme: dark)", color: "#07101f" },
  ],
};
~~~

Use this root structure:

~~~tsx
<html lang="en" data-theme="light" suppressHydrationWarning>
  <head>
    <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
  </head>
  <body className={manrope.variable + " " + plexMono.variable + " antialiased"}>
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[70] focus:left-4 focus:top-4 focus:bg-surface focus:text-ink focus:border focus:border-brand focus:rounded-[10px] focus:px-4 focus:py-2 focus:text-sm focus:font-medium">
      Skip to content
    </a>
    <ThemeProvider>
      <AuthProvider>
        <SessionProvider>
          <AppShell>
            <div id="main">{children}</div>
          </AppShell>
        </SessionProvider>
      </AuthProvider>
    </ThemeProvider>
  </body>
</html>
~~~

- [ ] **Step 5: Replace the light-only token block with a two-theme matrix**

Keep the Tailwind import and @theme inline aliases. Replace the current light-only comments and root values with:

~~~css
:root,
[data-theme="light"] {
  color-scheme: light;
  --logo-navy: #0f1e3d;
  --logo-cyan: #17a3ba;
  --c1: #0e8ca3;
  --c2: #3a5ba8;
  --c3: #b0621f;
  --c4: #7b4a93;
  --c5: #4f7a34;
  --c6: #a8324f;
  --c0: #93a0b0;
  --ground: #e9eef1;
  --shell: #f7f8f6;
  --surface: #ffffff;
  --surface-2: #f1f4f5;
  --surface-3: #e5eaed;
  --border: #dce2e6;
  --border-strong: #c7d0d7;
  --ink: #0f1e3d;
  --ink-2: #59667a;
  --ink-3: #8793a4;
  --primary: #0f1e3d;
  --primary-hover: #1d3159;
  --on-primary: #ffffff;
  --brand: #0c7c90;
  --brand-hover: #09697c;
  --brand-soft: #e4f3f6;
  --brand-line: #b5dce4;
  --on-brand: #ffffff;
  --warn: #8d5906;
  --warn-soft: #fcf2e3;
  --warn-line: #ead7b6;
  --crit: #a52438;
  --crit-soft: #fcebee;
  --crit-line: #efc5cc;
  --ok: #1d744e;
  --ok-soft: #e5f3ed;
  --ok-line: #b3d8c6;
  --shadow-panel: 0 20px 60px rgb(15 30 61 / 0.16);
}

[data-theme="dark"] {
  color-scheme: dark;
  --logo-navy: #f4f7fb;
  --logo-cyan: #32b4c9;
  --ground: #07101f;
  --shell: #0b1525;
  --surface: #111d2f;
  --surface-2: #17243a;
  --surface-3: #1d2c44;
  --border: #25364d;
  --border-strong: #354a64;
  --ink: #f4f7fb;
  --ink-2: #b1bed0;
  --ink-3: #7f8ea5;
  --primary: #17a3ba;
  --primary-hover: #32b4c9;
  --on-primary: #061018;
  --brand: #49bfd0;
  --brand-hover: #66cedc;
  --brand-soft: #102f3a;
  --brand-line: #205363;
  --on-brand: #061018;
  --warn: #f1b75a;
  --warn-soft: #352812;
  --warn-line: #5a4320;
  --crit: #ff8293;
  --crit-soft: #371923;
  --crit-line: #642b3a;
  --ok: #69d2a3;
  --ok-soft: #112f27;
  --ok-line: #285845;
  --c1: #35b8cb;
  --c2: #809df2;
  --c3: #e49a58;
  --c4: #c493d8;
  --c5: #87b96d;
  --c6: #e57491;
  --c0: #8b99ac;
  --shadow-panel: 0 24px 72px rgb(0 0 0 / 0.45);
}
~~~

Add --color-shell to @theme inline, set --r-card to 14px, --r-input to 10px, and add --r-shell: 28px. Remove the hardcoded color-scheme: light declaration from the html base rule because the theme selectors and bootstrap own it. Change body to use background: var(--ground), keep the existing font roles, retain reduced-motion handling, and change all transitions to include color, border-color, and background-color only where interaction feedback is needed.

- [ ] **Step 6: Verify GREEN and production compatibility**

Run:

~~~powershell
npm run test:run -- tests/components/theme/theme.test.ts tests/components/theme/theme-provider.test.tsx
npm run typecheck
npm run lint
npm run build
~~~

Expected: all commands exit 0; the build has no hydration or Server/Client boundary errors.

- [ ] **Step 7: Commit the theme provider and tokens**

~~~powershell
git add app/layout.tsx app/globals.css components/theme/theme-provider.tsx tests/components/theme/theme-provider.test.tsx
git commit -m "feat: add persistent light dark and system themes"
~~~

---

### Task 3: Add shared hierarchy and disclosure primitives

**Files:**

- Modify: components/ui.tsx:1-322
- Create: components/disclosure.tsx
- Create: components/page-structure.tsx
- Create: tests/components/disclosure.test.tsx
- Create: tests/components/page-structure.test.tsx

**Interfaces:**

- Consumes: Existing cn helper and semantic Tailwind tokens.
- Produces:
  - Disclosure({ title, description?, defaultOpen?, children, className? })
  - PageHeader({ eyebrow?, title, lead?, actions? })
  - ActionArea({ children, note?, className? })
  - Button data-variant attribute for semantic verification

- [ ] **Step 1: Write failing semantic tests**

Create tests/components/disclosure.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Disclosure } from "@/components/disclosure";

it("reveals optional detail through native summary semantics", async () => {
  const user = userEvent.setup();
  render(
    <Disclosure title="How processing works">
      <p>Technical explanation</p>
    </Disclosure>,
  );
  const summary = screen.getByText("How processing works");
  const details = summary.closest("details");
  expect(details).not.toHaveAttribute("open");
  await user.click(summary);
  expect(details).toHaveAttribute("open");
  expect(screen.getByText("Technical explanation")).toBeVisible();
});
~~~

Create tests/components/page-structure.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ActionArea, PageHeader } from "@/components/page-structure";

it("renders a single page heading and labelled action region", () => {
  render(
    <>
      <PageHeader
        eyebrow="Step 2 of 7"
        title="Prepare the analysis"
        lead="Keep this page open while the preview is prepared."
      />
      <ActionArea note="Your inputs stay in this tab.">
        <button>Continue</button>
      </ActionArea>
    </>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Prepare the analysis",
  );
  expect(screen.getByRole("region", { name: "Page actions" })).toBeVisible();
});
~~~

- [ ] **Step 2: Run the new tests and verify RED**

Run:

~~~powershell
npm run test:run -- tests/components/disclosure.test.tsx tests/components/page-structure.test.tsx
~~~

Expected: FAIL because the two component modules do not exist.

- [ ] **Step 3: Implement Disclosure**

Create components/disclosure.tsx:

~~~tsx
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function Disclosure({
  title,
  description,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details
      className={cn(
        "group rounded-[var(--r-card)] border border-border bg-surface",
        className,
      )}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-left marker:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-ink-3 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border px-4 py-4 text-[13px] leading-relaxed text-ink-2">
        {children}
      </div>
    </details>
  );
}
~~~

- [ ] **Step 4: Implement PageHeader and ActionArea**

Create components/page-structure.tsx:

~~~tsx
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
      <div className="min-w-0">
        {eyebrow ? <div className="label-caps mb-2 text-brand">{eyebrow}</div> : null}
        <h1 className="font-display text-[28px] font-extrabold leading-[1.08] sm:text-[34px]">
          {title}
        </h1>
        {lead ? (
          <p className="mt-2.5 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
            {lead}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function ActionArea({
  children,
  note,
  className,
}: {
  children: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Page actions"
      className={cn(
        "flex flex-col gap-3 rounded-[var(--r-card)] border border-border bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {note ? <div className="max-w-[58ch] text-[12.5px] text-ink-2">{note}</div> : <span />}
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">{children}</div>
    </section>
  );
}
~~~

- [ ] **Step 5: Normalize existing primitives**

In components/ui.tsx:

- Export Variant and Size so route tests can refer to the supported API.
- Add data-variant and data-size to Button.
- Change button shapes from fully pill-shaped to rounded-[10px], except Badge and Segmented.
- Use h-8, h-9, and h-10 for small, medium, and large controls.
- Change CardHead to px-5 py-4 and keep a 16-pixel title.
- Change Stat to px-4 py-3.5 and a 24-pixel value.
- Add aria-label to ConfidenceMeter and hide its decorative track from assistive technology.
- Keep all existing component props and behavior compatible.

Use this Button return and ConfidenceMeter label:

~~~tsx
return (
  <button
    data-variant={variant}
    data-size={size}
    className={buttonClass(variant, size, className)}
    {...props}
  />
);
~~~

~~~tsx
<span
  className="inline-flex items-center gap-2"
  aria-label={"Confidence " + pct + "%"}
>
~~~

- [ ] **Step 6: Verify GREEN**

Run:

~~~powershell
npm run test:run -- tests/components/disclosure.test.tsx tests/components/page-structure.test.tsx
npm run test:run
npm run typecheck
npm run lint
~~~

Expected: all commands exit 0.

- [ ] **Step 7: Commit shared hierarchy primitives**

~~~powershell
git add components/ui.tsx components/disclosure.tsx components/page-structure.tsx tests/components/disclosure.test.tsx tests/components/page-structure.test.tsx
git commit -m "feat: add calm shared page primitives"
~~~

---

### Task 4: Build the accessible overlay and Settings panel

**Files:**

- Create: components/overlay-panel.tsx
- Create: components/settings-dialog.tsx
- Create: tests/components/overlay-panel.test.tsx
- Create: tests/components/settings-dialog.test.tsx

**Interfaces:**

- Consumes: Button, ThemeProvider/useTheme, ThemePreference.
- Produces:
  - OverlayPanel({ open, onClose, side, labelledBy?, ariaLabel?, panelClassName?, returnFocusRef?, children })
  - SettingsDialog({ open, onClose, returnFocusRef? })
- OverlayPanel owns focus containment, Escape dismissal, overlay dismissal, focus restoration, and body scroll lock for both Settings and mobile navigation.

- [ ] **Step 1: Write the failing overlay behavior test**

Create tests/components/overlay-panel.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { OverlayPanel } from "@/components/overlay-panel";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open panel</button>
      <OverlayPanel
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        labelledBy="panel-title"
      >
        <h2 id="panel-title">Panel title</h2>
        <button>First action</button>
        <button onClick={() => setOpen(false)}>Close panel</button>
      </OverlayPanel>
    </>
  );
}

it("traps focus, closes with Escape, unlocks scroll, and restores focus", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Open panel" });
  await user.click(trigger);
  expect(screen.getByRole("dialog", { name: "Panel title" })).toBeVisible();
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByTestId("overlay-backdrop"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
~~~

- [ ] **Step 2: Write the failing Settings behavior test**

Create tests/components/settings-dialog.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { installMatchMedia } from "../../match-media";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <ThemeProvider>
      <button onClick={() => setOpen(true)}>Settings</button>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </ThemeProvider>
  );
}

it("offers exactly three appearance choices and applies dark mode", async () => {
  installMatchMedia(false);
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const choices = screen.getAllByRole("radio");
  expect(choices).toHaveLength(3);
  await user.click(screen.getByRole("radio", { name: "Dark" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
});
~~~

- [ ] **Step 3: Run both tests and verify RED**

Run:

~~~powershell
npm run test:run -- tests/components/overlay-panel.test.tsx tests/components/settings-dialog.test.tsx
~~~

Expected: FAIL because OverlayPanel and SettingsDialog do not exist.

- [ ] **Step 4: Implement OverlayPanel**

Create components/overlay-panel.tsx with this behavior:

~~~tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function OverlayPanel({
  open,
  onClose,
  side,
  labelledBy,
  ariaLabel,
  panelClassName,
  returnFocusRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  labelledBy?: string;
  ariaLabel?: string;
  panelClassName?: string;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = oldOverflow;
      (returnFocusRef?.current ?? previous)?.focus();
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45"
      data-testid="overlay-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 w-full overflow-y-auto border-border bg-surface shadow-[var(--shadow-panel)] outline-none",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
~~~

- [ ] **Step 5: Implement SettingsDialog**

Create components/settings-dialog.tsx:

~~~tsx
"use client";

import { Check, Laptop, Moon, Sun, X } from "lucide-react";
import { OverlayPanel } from "@/components/overlay-panel";
import { useTheme } from "@/components/theme/theme-provider";
import type { ThemePreference } from "@/components/theme/theme";
import { cn } from "@/components/ui";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}[] = [
  { value: "light", label: "Light", description: "Always use the light workspace.", icon: Sun },
  { value: "dark", label: "Dark", description: "Use deep navy surfaces with cyan accents.", icon: Moon },
  { value: "system", label: "Use device setting", description: "Follow this device's appearance.", icon: Laptop },
];

export function SettingsDialog({
  open,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const { preference, setPreference } = useTheme();

  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      side="right"
      labelledBy="settings-title"
      panelClassName="max-w-none sm:max-w-[400px]"
      returnFocusRef={returnFocusRef}
    >
      <div className="flex min-h-full flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-5">
          <div>
            <p className="label-caps text-brand">Preferences</p>
            <h2 id="settings-title" className="font-display text-[18px] font-bold">
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            aria-label="Close settings"
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <fieldset className="p-5">
          <legend className="text-[14px] font-bold text-ink">Appearance</legend>
          <p className="mt-1 text-[12.5px] text-ink-2">
            Choose how Markwise looks on this device.
          </p>
          <div className="mt-4 grid gap-2">
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = option.value === preference;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[12px] border p-3.5",
                    selected
                      ? "border-brand-line bg-brand-soft"
                      : "border-border bg-surface hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="appearance"
                    value={option.value}
                    checked={selected}
                    onChange={() => setPreference(option.value)}
                    aria-label={option.label}
                    className="mt-1 accent-[var(--brand)]"
                  />
                  <Icon size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">{option.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">{option.description}</span>
                  </span>
                  {selected ? <Check size={17} className="shrink-0 text-brand" aria-hidden /> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </OverlayPanel>
  );
}
~~~

- [ ] **Step 6: Verify GREEN**

Run:

~~~powershell
npm run test:run -- tests/components/overlay-panel.test.tsx tests/components/settings-dialog.test.tsx
npm run test:run
npm run typecheck
npm run lint
~~~

Expected: all commands exit 0, and no act, hydration, or accessibility warnings appear.

- [ ] **Step 7: Commit Settings and overlay behavior**

~~~powershell
git add components/overlay-panel.tsx components/settings-dialog.tsx tests/components/overlay-panel.test.tsx tests/components/settings-dialog.test.tsx
git commit -m "feat: add accessible appearance settings"
~~~

---

### Task 5: Rebuild the compact framed shell and navigation

**Files:**

- Create: components/app-navigation.tsx
- Create: components/top-bar.tsx
- Modify: components/shell.tsx:1-398
- Modify: components/logo.tsx:12-79
- Create: tests/components/shell.test.tsx

**Interfaces:**

- Consumes: OverlayPanel, SettingsDialog, PageHeader, existing AuthProvider and SessionProvider hooks.
- Produces:
  - STEPS and resolveStep(pathname: string)
  - AppNavigation({ onNavigate?, onOpenSettings })
  - TopBar({ onOpenNavigation, navigationTriggerRef })
  - Existing AppShell({ children }) and Page props remain source-compatible.

- [ ] **Step 1: Write the failing shell integration tests**

Create tests/components/shell.test.tsx:

~~~tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth-provider";
import { SessionProvider } from "@/components/session-provider";
import { AppShell } from "@/components/shell";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { installMatchMedia } from "../../match-media";

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
  expect(screen.getByRole("link", { name: /Misconception map/i })).toHaveAttribute(
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
~~~

- [ ] **Step 2: Run the shell test and verify RED**

Run:

~~~powershell
npm run test:run -- tests/components/shell.test.tsx
~~~

Expected: the Settings test FAILS because the current Settings button has no behavior.

- [ ] **Step 3: Extract navigation and top-bar responsibilities**

Move STEPS, resolveStep, useStepState, RailContent, and AccountChip into components/app-navigation.tsx. Export STEPS, resolveStep, and AppNavigation. Type onOpenSettings as (trigger: HTMLButtonElement) => void and call it with event.currentTarget from the Settings button. Keep course code and title visible in the brand block, keep every stage label visible, and change the Processing blurb from Run the pipeline to Prepare sample analysis. Change the account tooltip to truthful identity language:

~~~tsx
const accountTitle = saved
  ? "Signed in as " + email
  : status === "demo"
    ? "Demo preview"
    : "Anonymous preview";
~~~

Use a 64-pixel brand block, px-3 navigation padding, 10-pixel control radii, 13-pixel stage labels, and aria-current="page" on the resolved step. Settings must call onOpenSettings. Keep Help visually quiet and disabled with aria-disabled="true" until it has a real destination.

Move TopBar and its breadcrumb logic into components/top-bar.tsx. Accept a navigationTriggerRef prop and attach it to the Open navigation button. Use a 64-pixel header, preserve course code and child-route Detail context, and retain the current attention/review badges without making them compete with the page heading.

- [ ] **Step 4: Recompose AppShell around the shared overlays**

Replace shell-local drawer effects with OverlayPanel and SettingsDialog. Use this state and outer structure:

~~~tsx
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsReturnRef = useRef<HTMLElement | null>(null);

  function openSettings(returnTarget: HTMLElement | null) {
    settingsReturnRef.current = returnTarget;
    setSettingsOpen(true);
  }

  return (
    <div className="min-h-dvh bg-ground lg:p-4">
      <div className="min-h-dvh overflow-hidden bg-shell lg:grid lg:min-h-[calc(100dvh-2rem)] lg:grid-cols-[228px_minmax(0,1fr)] lg:rounded-[var(--r-shell)] lg:border lg:border-border-strong">
        <aside className="hidden border-r border-border bg-surface lg:block">
          <AppNavigation onOpenSettings={(trigger) => openSettings(trigger)} />
        </aside>
        <OverlayPanel
          open={navOpen}
          onClose={() => setNavOpen(false)}
          side="left"
          ariaLabel="Navigation"
          panelClassName="max-w-[280px]"
        >
          <button
            onClick={() => setNavOpen(false)}
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            aria-label="Close navigation"
          >
            <X size={18} aria-hidden />
          </button>
          <AppNavigation
            onNavigate={() => setNavOpen(false)}
            onOpenSettings={() => {
              setNavOpen(false);
              openSettings(navigationTriggerRef.current);
            }}
          />
        </OverlayPanel>
        <div className="flex min-w-0 flex-col">
          <TopBar
            onOpenNavigation={() => setNavOpen(true)}
            navigationTriggerRef={navigationTriggerRef}
          />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          returnFocusRef={settingsReturnRef}
        />
      </div>
    </div>
  );
}
~~~

Import X from lucide-react and useRef from React in components/shell.tsx. This explicit return target restores desktop Settings to its own trigger and mobile Settings to the still-mounted Open navigation button.

- [ ] **Step 5: Update Page to use the shared PageHeader**

Keep the existing Page prop signature. Replace its heading markup with PageHeader and use:

~~~tsx
<div className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9">
  <PageHeader
    eyebrow={eyebrow}
    title={title}
    lead={lead}
    actions={actions}
  />
  {aside ? (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
      <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[80px]">{aside}</aside>
    </div>
  ) : (
    <div className="flex flex-col gap-5">{children}</div>
  )}
</div>
~~~

Keep the Markwise symbol and wordmark proportions in components/logo.tsx; only reduce shell lockup sizing enough to fit the 64-pixel brand block. Do not redraw or recolor the logo.

- [ ] **Step 6: Verify GREEN and responsive shell behavior**

Run:

~~~powershell
npm run test:run -- tests/components/shell.test.tsx
npm run test:run
npm run typecheck
npm run lint
npm run build
~~~

Then run the app at 1440, 1024, 768, and 390 CSS-pixel widths. Verify:

- desktop has 16-pixel outer space and a framed rounded shell;
- tablet and mobile are full-bleed;
- the desktop sidebar remains labeled;
- the mobile drawer traps and restores focus through OverlayPanel;
- opening Settings closes the mobile drawer;
- long course titles truncate without hiding the active stage;
- Light, Dark, and Use device setting affect the entire shell.

- [ ] **Step 7: Commit the shell foundation**

~~~powershell
git add components/app-navigation.tsx components/top-bar.tsx components/shell.tsx components/logo.tsx tests/components/shell.test.tsx
git commit -m "feat: rebuild the compact application shell"
~~~

---

## Foundation completion gate

Before starting the workflow-screen plan, run:

~~~powershell
npm run lint
npm run typecheck
npm run test:run
npm run build
git status --short
~~~

Expected: lint, typecheck, tests, and build exit 0; git status contains no uncommitted foundation files. Manually open Settings in both appearances and verify initial paint does not flash the wrong theme on a hard reload.
