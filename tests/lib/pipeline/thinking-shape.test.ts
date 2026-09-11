// @vitest-environment node

import { describe, expect, it } from "vitest";
import { thinkingShapeFor } from "@/lib/pipeline/claude";

/**
 * ANTHROPIC_MODEL is documented as a per-deployment override, and the obvious
 * reason to reach for it is cost — which points straight at the small models.
 * Those reject adaptive thinking and `effort` outright, so getting this wrong
 * does not degrade a run, it fails the first request of every batch with a 400.
 */

describe("thinkingShapeFor", () => {
  it.each([
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-opus-4-8",
    "claude-opus-4-6",
    "claude-fable-5-1",
  ])("asks %s for adaptive thinking and passes effort through", (model) => {
    expect(thinkingShapeFor(model, 16_000, "medium")).toEqual({
      thinking: { type: "adaptive" },
      effort: "medium",
    });
  });

  it.each([
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5",
    "claude-opus-4-5",
    "claude-3-5-sonnet-20241022",
  ])("gives %s an explicit budget and no effort", (model) => {
    const shape = thinkingShapeFor(model, 16_000, "high");
    expect(shape.effort).toBeUndefined();
    expect(shape.thinking).toMatchObject({ type: "enabled" });
  });

  it("keeps the thinking budget inside the output ceiling", () => {
    // budget_tokens must be at least 1024 and strictly below max_tokens, and
    // still leave room for the JSON the thinking precedes.
    for (const maxTokens of [2_000, 8_192, 16_000, 24_000]) {
      const shape = thinkingShapeFor("claude-haiku-4-5", maxTokens, "low");
      const budget = (shape.thinking as { budget_tokens: number }).budget_tokens;
      expect(budget).toBeGreaterThanOrEqual(1024);
      expect(budget).toBeLessThan(maxTokens);
    }
  });

  it("treats an unrecognised model as current rather than legacy", () => {
    // A deny-list, so a model released after this was written gets the modern
    // parameters instead of being quietly downgraded by a stale table.
    expect(thinkingShapeFor("claude-opus-9", 16_000, "low")).toEqual({
      thinking: { type: "adaptive" },
      effort: "low",
    });
  });
});
