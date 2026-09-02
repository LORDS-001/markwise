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
        { foreground: "on-ok", background: "ok", minimum: 4.5 },
        ...Array.from({ length: 7 }, (_, tone) => ({
          foreground: `on-c${tone}`,
          background: `c${tone}`,
          minimum: 4.5,
        })),
      ]),
    );
    expect(
      matrix.CONTRAST_PAIRS.filter(
        ({ foreground }: { foreground: string }) =>
          foreground === "on-ok" || /^on-c[0-6]$/.test(foreground),
      ),
    ).toHaveLength(8);
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
    expect(
      keyboard.focusSignature({ tag: "BODY", name: "", rect: { left: 0, top: 0 } }),
    ).toBe(
      keyboard.focusSignature({ tag: "BODY", name: "", rect: { left: 0, top: -900 } }),
    );
    const rootFocusContext = { focus: [] };
    expect(() =>
      keyboard.recordFocus(
        rootFocusContext,
        {
          tag: "BODY",
          name: "",
          visible: true,
          onScreen: true,
          focusVisible: false,
          visibleFocusTreatment: false,
          dialogOpen: false,
        },
        "Tab",
      ),
    ).toThrow(/document root/i);
    expect(rootFocusContext.focus).toEqual([]);
    expect(keyboard.NAVIGATION_TAB_OPTIONS).toEqual({
      documentRootBoundary: "navigation/bootstrap",
    });
    const printable = keyboard.printableKeyPayload("a");
    expect(printable.keyEvent).not.toHaveProperty("text");
    expect(printable.charEvent).toHaveProperty("text", "a");
    expect(keyboard.isRadioSnapshot({ tag: "INPUT", type: "radio", role: null })).toBe(true);
    expect(keyboard.MERGE_RETURN_KEY).toEqual({
      key: "ArrowLeft",
      modifiers: 1,
      isSystemKey: true,
    });
    expect(
      keyboard.historyEntryForPath(
        [
          { id: 1, url: "http://127.0.0.1:3017/clusters/cl-phase" },
          { id: 2, url: "http://127.0.0.1:3017/clusters/cl-impedance" },
        ],
        "/clusters/cl-phase",
      ),
    ).toEqual({ id: 1, url: "http://127.0.0.1:3017/clusters/cl-phase" });
    expect(keyboard.REJECT_DESTINATION).toBe("/map");
    const visibleFlagged = keyboard.visibleStatusCountExpression("Flagged");
    expect(visibleFlagged).toContain("getBoundingClientRect");
    expect(visibleFlagged).toContain('"Flagged"');
    expect(keyboard.SCORES_EVIDENCE_EXPRESSION).toContain('td[colspan="8"]');
    expect(keyboard.replacementPlan("")).toEqual(["KeyA", "Backspace"]);
    expect(keyboard.EXPORT_READY_TAB_OPTIONS).toEqual({ shift: true });
    expect(keyboard.REVIEWER_VALIDATION_VALUE).toBe("");
    expect(keyboard.ACCOUNT_DEMO_EXPRESSION).toContain('[title="Demo preview"]');
    expect(keyboard.ACCOUNT_DEMO_EXPRESSION).toContain("input[type=email]");
  });

  it("binds processing completion traversal to shifted CDP Tab payloads", async () => {
    const calls: unknown[][] = [];
    const reached = { name: "Compare my prediction" };
    const result = await keyboard.tabToProcessingCompletion(
      "cdp",
      "context",
      (...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve(reached);
      },
    );

    expect(result).toBe(reached);
    expect(calls).toHaveLength(1);
    const [cdp, context, predicate, label, options] = calls[0];
    expect(cdp).toBe("cdp");
    expect(context).toBe("context");
    expect(predicate).toEqual(expect.any(Function));
    expect((predicate as (snapshot: { name: string }) => boolean)(reached)).toBe(true);
    expect(label).toBe("completed onward link");
    expect(options).toEqual({ shift: true });

    const modifiers = keyboard.tabTraversalModifiers(options);
    expect(modifiers).toBe(8);
    expect(keyboard.keyDispatchPayloads("Tab", modifiers)).toEqual([
      {
        type: "rawKeyDown",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
        modifiers: 8,
        isSystemKey: false,
        autoRepeat: false,
        isKeypad: false,
      },
      {
        type: "keyUp",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
        modifiers: 8,
        isSystemKey: false,
        autoRepeat: false,
        isKeypad: false,
      },
    ]);
  });
});
