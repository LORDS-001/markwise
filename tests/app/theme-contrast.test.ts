import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Cluster } from "@/lib/types";

const css = readFileSync("app/globals.css", "utf8");

type ThemeName = "light" | "dark";
const clusterTones = [0, 1, 2, 3, 4, 5, 6] satisfies Cluster["tone"][];

function themeTokens(theme: ThemeName) {
  const selector =
    theme === "light"
      ? /:root,\s*\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/
      : /\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/;
  const block = css.match(selector)?.[1];
  expect(block, `${theme} token block`).toBeDefined();

  return Object.fromEntries(
    [...block!.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map(
      ([, name, value]) => [name, value],
    ),
  );
}

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function expectPair(
  theme: ThemeName,
  tokens: Record<string, string>,
  foreground: string,
  background: string,
  minimum: number,
) {
  expect(tokens[foreground], `${theme} --${foreground}`).toBeDefined();
  expect(tokens[background], `${theme} --${background}`).toBeDefined();
  const ratio = contrast(tokens[foreground], tokens[background]);
  expect(
    ratio,
    `${theme} --${foreground} on --${background} is ${ratio.toFixed(2)}:1`,
  ).toBeGreaterThanOrEqual(minimum);
}

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  const tokens = themeTokens(theme);
  const baseSurfaces = ["ground", "shell", "surface", "surface-2", "surface-3"];
  const supportedInkSurfaces = [
    ...baseSurfaces,
    "brand-soft",
    "warn-soft",
    "crit-soft",
    "ok-soft",
  ];

  it("keeps normal secondary text readable on every supported surface", () => {
    for (const surface of supportedInkSurfaces) {
      expectPair(theme, tokens, "ink-3", surface, 4.5);
    }
  });

  it("keeps semantic foreground and soft-surface pairs readable", () => {
    for (const [foreground, background] of [
      ["on-primary", "primary"],
      ["on-brand", "brand"],
      ["on-ok", "ok"],
      ["brand", "brand-soft"],
      ["warn", "warn-soft"],
      ["crit", "crit-soft"],
      ["ok", "ok-soft"],
    ]) {
      expectPair(theme, tokens, foreground, background, 4.5);
    }
  });

  it("provides a non-text control boundary without strengthening card rules", () => {
    for (const surface of ["surface", "surface-2", "surface-3"]) {
      expectPair(theme, tokens, "control-border", surface, 3);
    }
  });

  it("provides readable foregrounds for every supported cluster colour", () => {
    for (const tone of clusterTones) {
      expectPair(theme, tokens, `on-c${tone}`, `c${tone}`, 4.5);
    }
  });
});
