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
