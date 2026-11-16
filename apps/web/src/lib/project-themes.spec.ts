import { PROJECT_THEME_IDS } from "@repo/shared";
import { describe, expect, it } from "vitest";

import {
  PROJECT_THEMES,
  hexToRgb,
  projectPaletteVars,
  projectThemeCss,
  type ProjectPalette,
} from "./project-themes";

const HEX = /^#[0-9A-F]{6}$/i;

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe("PROJECT_THEMES", () => {
  it("has one theme for every theme id, keyed by its own id", () => {
    expect(Object.keys(PROJECT_THEMES).sort()).toEqual([...PROJECT_THEME_IDS].sort());
    for (const id of PROJECT_THEME_IDS) {
      expect(PROJECT_THEMES[id].id).toBe(id);
      expect(PROJECT_THEMES[id].name).toBeTruthy();
    }
  });

  it("gives every light and dark palette six digit hex colours in every role", () => {
    for (const theme of Object.values(PROJECT_THEMES)) {
      for (const palette of [theme.light, theme.dark]) {
        for (const value of Object.values(palette)) expect(value).toMatch(HEX);
      }
    }
  });

  // The file promises these ratios in its header comment, so a colour edit has to keep them
  it("keeps the contrast the file promises", () => {
    for (const theme of Object.values(PROJECT_THEMES)) {
      for (const palette of [theme.light, theme.dark]) {
        expect(contrast(palette.text, palette.bg), `${theme.id} text`).toBeGreaterThanOrEqual(7);
        expect(
          contrast(palette.buttonText, palette.buttonBg),
          `${theme.id} button`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(palette.buttonTextHover, palette.buttonBgHover),
          `${theme.id} hover`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(palette.highlight, palette.bg),
          `${theme.id} highlight`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("gives every theme a name of its own", () => {
    const names = Object.values(PROJECT_THEMES).map((theme) => theme.name);

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("projectPaletteVars", () => {
  const palette: ProjectPalette = {
    bg: "#111111",
    text: "#EEEEEE",
    highlight: "#00FF00",
    buttonBg: "#222222",
    buttonText: "#FFFFFF",
    buttonBgHover: "#333333",
    buttonTextHover: "#000000",
    iconBg: "#444444",
    iconColor: "#555555",
  };

  it("maps every role to a project custom property and derives the muted and line colours", () => {
    expect(projectPaletteVars(palette)).toEqual({
      "--project-bg": "#111111",
      "--project-text": "#EEEEEE",
      "--project-muted": "color-mix(in srgb, #EEEEEE 70%, #111111)",
      "--project-line": "color-mix(in srgb, #EEEEEE 16%, #111111)",
      "--project-highlight": "#00FF00",
      "--project-button-bg": "#222222",
      "--project-button-text": "#FFFFFF",
      "--project-button-bg-hover": "#333333",
      "--project-button-text-hover": "#000000",
      "--project-icon-bg": "#444444",
      "--project-icon-color": "#555555",
    });
  });
});

describe("projectThemeCss", () => {
  it("scopes the light variant to :root and the dark one to :root.dark by default", () => {
    const css = projectThemeCss("graphite");

    expect(css.startsWith(":root{--project-bg:#EDF3F1;")).toBe(true);
    expect(css).toContain("}:root.dark{--project-bg:#121414;");
    expect(css.endsWith("}")).toBe(true);
  });

  it("puts the dark variant under the .dark class of the site for another selector", () => {
    const css = projectThemeCss("graphite", ".page");

    expect(css.startsWith(".page{--project-bg:#EDF3F1;")).toBe(true);
    expect(css).toContain("}.dark .page{--project-bg:#121414;");
  });
});

describe("hexToRgb", () => {
  it("reads six digit hex into 0..1 floats", () => {
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb("#FFFFFF")).toEqual([1, 1, 1]);
    expect(hexToRgb("ff0000")).toEqual([1, 0, 0]);
    expect(hexToRgb("#336699")).toEqual([0x33 / 255, 0x66 / 255, 0x99 / 255]);
  });

  it("expands three digit hex", () => {
    expect(hexToRgb("#f80")).toEqual([1, 0x88 / 255, 0]);
  });
});
