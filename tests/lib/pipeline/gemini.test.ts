// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

describe("embedTexts", () => {
  it("rejects a vector with the wrong dimensions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      embeddings: [{ values: [0.1, 0.2] }],
    })));
    const { embedTexts } = await import("@/lib/pipeline/gemini");

    await expect(embedTexts(["believes impedance equals resistance"])).rejects.toThrow(
      /dimension/i,
    );
  });

  it("rejects non-finite embedding values", async () => {
    const values = Array.from({ length: 768 }, () => 0.1);
    values[42] = Number.NaN;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      embeddings: [{ values }],
    })));
    const { embedTexts } = await import("@/lib/pipeline/gemini");

    await expect(embedTexts(["believes impedance equals resistance"])).rejects.toThrow(
      /finite/i,
    );
  });

  it("does not expose a provider response body in an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      '{"error":"secret provider detail"}',
      { status: 400 },
    )));
    const { generateJson } = await import("@/lib/pipeline/gemini");

    await expect(generateJson({ prompt: "x", schema: {} })).rejects.not.toThrow(
      /secret provider detail/i,
    );
  });

  it("does not start paid work after the caller cancels", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort(new Error("caller cancelled"));
    const { generateJson } = await import("@/lib/pipeline/gemini");

    await expect(
      generateJson({ prompt: "x", schema: {}, signal: controller.signal }),
    ).rejects.toThrow(/cancelled/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the conservative request limiter", () => {
  it("admits the worst-case 40-answer request count within the route budget", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const { createRequestLimiter } = await import("@/lib/pipeline/gemini");
    const waitForSlot = createRequestLimiter({
      requestsPerMinute: () => 15,
      now: () => now,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        now += milliseconds;
      },
    });

    for (let request = 0; request < 61; request += 1) await waitForSlot();

    expect(sleeps).toEqual([60_050, 60_050, 60_050, 60_050]);
    expect(now).toBe(240_200);
    expect(now).toBeLessThan(270_000);
  });
});
