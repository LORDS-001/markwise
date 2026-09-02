import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const matrix = require("../../scripts/ui-review/matrix.cjs");
const keyboard = require("../../scripts/ui-review/keyboard.cjs");

describe("tracked UI review runner contract", () => {
  it("enumerates 144 invariant cases per browser and exactly 26 Chrome screenshots", () => {
    const combinations = matrix.ROUTES.flatMap((route: { id: string }) =>
      matrix.VIEWPORTS.flatMap((viewport: { id: string }) =>
        matrix.APPEARANCES.map((appearance: { id: string }) => ({
          route,
          viewport,
          appearance,
        })),
      ),
    );

    expect(matrix.ROUTES).toHaveLength(9);
    expect(matrix.VIEWPORTS).toHaveLength(4);
    expect(matrix.APPEARANCES).toHaveLength(4);
    expect(combinations).toHaveLength(144);
    expect(combinations.filter(matrix.shouldCaptureScreenshot)).toHaveLength(26);
  });

  it("keeps the production contrast and reduced-motion checks in the runner contract", () => {
    expect(matrix.contrastRatio("rgb(0, 0, 0)", "rgb(255, 255, 255)")).toBeCloseTo(21);
    expect(matrix.CONTRAST_PAIRS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ foreground: "ink-3", minimum: 4.5 }),
        expect.objectContaining({ foreground: "control-border", minimum: 3 }),
        ...Array.from({ length: 7 }, (_, tone) => ({
          foreground: `on-c${tone}`,
          background: `c${tone}`,
          minimum: 4.5,
        })),
      ]),
    );
    expect(matrix.REDUCED_MOTION_ROUTE).toBe("/");
    expect(matrix.DESKTOP_ASIDE_SELECTOR).toBe('aside[class~="lg:block"]');
  });

  it("keeps the theme trace safe before the document root exists", () => {
    const source = matrix.createThemeTraceSource({ preference: "light" });
    const runAtDocumentStart = new Function(
      "document",
      "localStorage",
      "window",
      "MutationObserver",
      "requestAnimationFrame",
      "setTimeout",
      source,
    );

    expect(() =>
      runAtDocumentStart(
        { documentElement: null },
        { setItem() {} },
        {},
        class MutationObserver {},
        () => undefined,
        () => undefined,
      ),
    ).not.toThrow();
  });

  it("keeps all eleven keyboard-only workflow groups named and ordered", () => {
    expect(keyboard.GROUP_NAMES).toEqual([
      "Skip link",
      "Desktop and mobile navigation",
      "Settings theme controls",
      "Setup workflow",
      "Processing workflow",
      "Reveal workflow",
      "Map workflow",
      "Cluster workflow",
      "Reteach workflow",
      "Scores workflow",
      "Export workflow",
    ]);
    expect(keyboard.KEY_DEFINITIONS.Enter.text).toBe("\r");
    expect(keyboard.HYDRATION_READY_EXPRESSION).toBe(
      "document.readyState === 'complete' && !!document.querySelector('main#main')",
    );
    expect(keyboard.SPLIT_MEMBER_TAB_OPTIONS).toEqual({ shift: true });
    expect(
      keyboard.focusSignature({ tag: "A", name: "Map", href: "/map", rect: { left: 10, top: 20 } }),
    ).not.toBe(
      keyboard.focusSignature({ tag: "A", name: "Map", href: "/map", rect: { left: 10, top: 120 } }),
    );
    const printable = keyboard.printableKeyPayload("a");
    expect(printable.keyEvent).not.toHaveProperty("text");
    expect(printable.charEvent).toHaveProperty("text", "a");
  });
});
