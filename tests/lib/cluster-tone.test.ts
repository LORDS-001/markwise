import { describe, expect, it } from "vitest";
import { clusterToneClasses } from "@/lib/cluster-tone";
import type { Cluster } from "@/lib/types";

const expected = [
  [0, "bg-[var(--c0)]", "text-on-c0"],
  [1, "bg-[var(--c1)]", "text-on-c1"],
  [2, "bg-[var(--c2)]", "text-on-c2"],
  [3, "bg-[var(--c3)]", "text-on-c3"],
  [4, "bg-[var(--c4)]", "text-on-c4"],
  [5, "bg-[var(--c5)]", "text-on-c5"],
  [6, "bg-[var(--c6)]", "text-on-c6"],
] satisfies [Cluster["tone"], string, string][];

describe("clusterToneClasses", () => {
  it.each(expected)("maps tone %i without a generic fallback", (tone, background, foreground) => {
    expect(clusterToneClasses(tone)).toEqual({
      backgroundClass: background,
      foregroundClass: foreground,
    });
  });
});
