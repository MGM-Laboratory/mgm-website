// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { PROJECT_THEME_IDS, type FormDesign } from "@repo/shared";
import { describe, expect, it } from "vitest";

import { PROJECT_THEMES } from "@/lib/project-themes";

import {
  contrast,
  ensureContrast,
  formPalette,
  formThemeCss,
  formThemeVars,
  inkOn,
  mixHex,
  sceneColors,
} from "./public-theme";

const themes = PROJECT_THEME_IDS as readonly FormDesign["theme"][];

describe("colour maths", () => {
  it("mixes colours in sRGB and clamps", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#fff", "#000", 0.5)).toBe("#808080");
    expect(mixHex("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(mixHex("#ffffff", "#000000", 2)).toBe("#000000");
  });

  it("computes the WCAG contrast ratio", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBe(1);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThan(4.5);
    expect(contrast("#777777", "#ffffff")).toBeLessThan(4.6);
  });

  it("walks a colour toward another until it reads", () => {
    expect(ensureContrast("#000000", "#ffffff", 4.5, "#000000")).toBe("#000000");
    const fixed = ensureContrast("#cccccc", "#ffffff", 4.5, "#000000");
    expect(contrast(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(fixed).not.toBe("#cccccc");
    // When the target never reaches the ratio it ends at the last step
    expect(ensureContrast("#ffffff", "#ffffff", 30, "#000000")).toBe("#000000");
  });

  it("picks the ink that reads best on a fill", () => {
    expect(inkOn("#000000")).toBe("#ffffff");
    expect(inkOn("#ffffff")).toBe("#0e1116");
    expect(inkOn("#ffffff", "#111111", "#eeeeee")).toBe("#111111");
    expect(inkOn("#000000", "#abcdef", "#123456")).toBe("#abcdef");
  });
});

describe("formPalette", () => {
  it("returns the light or dark half of a preset", () => {
    expect(formPalette("graphite", "light")).toBe(PROJECT_THEMES.graphite.light);
    expect(formPalette("graphite", "dark")).toBe(PROJECT_THEMES.graphite.dark);
  });

  it("throws for an unknown theme", () => {
    expect(() => formPalette("nope" as FormDesign["theme"], "light")).toThrow(/Unknown form theme/);
  });
});

describe("formThemeVars", () => {
  it.each(themes)("builds readable variables for %s in both schemes", (theme) => {
    for (const scheme of ["light", "dark"] as const) {
      const palette = formPalette(theme, scheme);
      const vars = formThemeVars(palette, scheme, theme);
      expect(vars["color-scheme"]).toBe(scheme);
      for (const token of ["blue", "red", "green", "yellow"]) {
        expect(contrast(vars[`--rt-${token}`], palette.bg)).toBeGreaterThanOrEqual(4.45);
        expect(vars[`--rt-${token}-wash`]).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(contrast(vars["--rt-muted"], palette.bg)).toBeGreaterThanOrEqual(4.45);
      expect(contrast(vars["--fx-muted"], vars["--fx-surface"])).toBeGreaterThanOrEqual(4.45);
      expect(contrast(vars["--fx-danger"], vars["--fx-surface"])).toBeGreaterThanOrEqual(4.45);
      expect(contrast(vars["--fx-success"], vars["--fx-surface"])).toBeGreaterThanOrEqual(4.45);
      for (let piece = 0; piece < 5; piece += 1) {
        expect(vars[`--fx-piece-${piece}`]).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(vars["--rt-ink"]).toBe(palette.text);
    }
  });

  it("differs between schemes in alpha, scrim and shadow", () => {
    const light = formThemeVars(formPalette("graphite", "light"), "light", "graphite");
    const dark = formThemeVars(formPalette("graphite", "dark"), "dark", "graphite");
    expect(light["--fx-pattern-alpha"]).toBe("1");
    expect(dark["--fx-pattern-alpha"]).toBe("0.32");
    expect(light["--fx-scrim"]).toContain("255,255,255");
    expect(dark["--fx-scrim"]).toContain("0,0,0");
    expect(light["--fx-shadow"]).not.toBe(dark["--fx-shadow"]);
    expect(light["--fx-on-rt"]).toBe("#ffffff");
    expect(dark["--fx-on-rt"]).toBe(formPalette("graphite", "dark").bg);
  });

  it("uses the brand colours for the brand themes and builds others from the palette", () => {
    const laboratory = formThemeVars(formPalette("laboratory", "light"), "light", "laboratory");
    expect(laboratory["--fx-piece-0"]).toBe("#3a6dc5");
    expect(formThemeVars(formPalette("grove", "dark"), "dark", "grove")["--fx-piece-0"]).toBe(
      "#2fc24f",
    );
    const generic = formThemeVars(formPalette("graphite", "light"), "light", "graphite");
    expect(generic["--fx-piece-0"]).toBe(formPalette("graphite", "light").highlight);
    const without = formThemeVars(formPalette("graphite", "light"), "light");
    expect(without["--fx-piece-0"]).toBe(generic["--fx-piece-0"]);
  });
});

describe("formThemeCss", () => {
  it("emits both schemes behind the dark class for auto", () => {
    const css = formThemeCss({ theme: "graphite", colorMode: "auto" });
    expect(css).toMatch(/^:root\{.*\}:root\.dark\{.*\}html,body\{/);
    expect(css).toContain("color-scheme:light");
    expect(css).toContain("color-scheme:dark");
  });

  it("emits one scheme for a fixed colour mode or a forced scheme", () => {
    const dark = formThemeCss({ theme: "graphite", colorMode: "dark" });
    expect(dark).toMatch(/^:root,:root\.dark,:root\.light\{/);
    expect(dark).toContain("color-scheme:dark");
    expect(dark).not.toContain("color-scheme:light");
    const forced = formThemeCss({ theme: "graphite", colorMode: "auto" }, "light");
    expect(forced).toContain("color-scheme:light");
    expect(forced).not.toContain("color-scheme:dark");
    const override = formThemeCss({ theme: "graphite", colorMode: "dark" }, "light");
    expect(override).toContain("color-scheme:light");
  });
});

describe("sceneColors", () => {
  it("returns the palette basics and five pieces", () => {
    const colors = sceneColors("graphite", "dark");
    const palette = formPalette("graphite", "dark");
    expect(colors).toMatchObject({
      bg: palette.bg,
      text: palette.text,
      highlight: palette.highlight,
    });
    expect(colors.pieces).toHaveLength(5);
  });
});
