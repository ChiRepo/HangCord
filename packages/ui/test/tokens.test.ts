import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { color, contrast } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../src/tokens.css"), "utf8");
const kebab = (k: string) => `--hc-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

describe("Calm Minimal tokens", () => {
  it("tokens.ts matches tokens.css exactly", () => {
    for (const [k, v] of Object.entries(color)) {
      const m = css.match(new RegExp(`${kebab(k)}:\\s*(#[0-9A-Fa-f]{6})`));
      expect(m?.[1]?.toUpperCase(), kebab(k)).toBe(v.toUpperCase());
    }
  });

  it("matches ui-ux/calm-minimal/tokens.css (the approved design)", () => {
    const approved = readFileSync(resolve(here, "../../../ui-ux/calm-minimal/tokens.css"), "utf8");
    const vars = (s: string) => Object.fromEntries([...s.matchAll(/(--hc-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]));
    expect(vars(css)).toEqual(vars(approved));
  });

  const surfaces = { bg: color.bg, panel: color.panel, surface: color.surface, raised: color.raised };
  const texts = { text: color.text, textMuted: color.textMuted, textDim: color.textDim, lantern: color.lantern, sky: color.sky, emberText: color.emberText, moss: color.moss };
  for (const [tn, t] of Object.entries(texts)) {
    for (const [sn, s] of Object.entries(surfaces)) {
      it(`${tn} on ${sn} ≥ 4.5:1`, () => expect(contrast(t, s)).toBeGreaterThanOrEqual(4.5));
    }
  }
  it("text on filled buttons passes", () => {
    expect(contrast(color.onLantern, color.lantern)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#FFFFFF", color.ember)).toBeGreaterThanOrEqual(4.5);
  });
  it("never uses Discord blurple", () => expect(css.toUpperCase()).not.toContain("#5865F2"));
});
