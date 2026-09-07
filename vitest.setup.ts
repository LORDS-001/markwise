import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * Shared teardown.
 *
 * The DOM half is guarded because server code — route handlers, the pipeline —
 * has to be tested in a node environment, where the browser globals this
 * reaches for do not exist. Without the guard, adding the first server-side
 * test file fails every test in it before its own body runs.
 */
const hasDom = typeof document !== "undefined";

afterEach(() => {
  if (hasDom) {
    cleanup();
    try {
      localStorage.clear();
    } catch {
      // Blocked storage. Nothing to reset, and nothing worth failing over.
    }
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.colorScheme = "light";
  }
  vi.restoreAllMocks();
});
