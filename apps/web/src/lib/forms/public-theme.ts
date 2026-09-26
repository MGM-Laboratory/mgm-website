import type { FormDesign, RichTextColor } from "@repo/shared";

import {
  PROJECT_THEMES,
  projectPaletteVars,
  type ProjectColorScheme,
  type ProjectPalette,
} from "@/lib/project-themes";

/**
 * The public form's colours, built from its preset theme. Everything the
 * page paints comes from these variables: the project palette
 * (`--project-*`), the rich-text colour tokens (`--rt-*`, each checked
 * against the background so an editor's colour stays readable in both
 * schemes), and a few derived surfaces (`--fx-*`).
 */

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  let value = hex.replace("#", "");
  if (value.length === 3) value = [...value].map((char) => char + char).join("");
  const number = Number.parseInt(value, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function toHex([r, g, b]: Rgb) {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `amount` of `b` mixed into `a` (0 = a, 1 = b), in sRGB like `color-mix`. */
export function mixHex(a: string, b: string, amount: number) {
  const left = parseHex(a);
  const right = parseHex(b);
  return toHex([
    left[0] + (right[0] - left[0]) * amount,
    left[1] + (right[1] - left[1]) * amount,
    left[2] + (right[2] - left[2]) * amount,
  ]);
}

function luminance(hex: string) {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Walks `color` toward `toward` until it reaches `ratio` against `bg`. */
export function ensureContrast(color: string, bg: string, ratio: number, toward: string) {
  let candidate = color;
  for (let step = 1; step <= 20 && contrast(candidate, bg) < ratio; step += 1) {
    candidate = mixHex(color, toward, step / 20);
  }
  return candidate;
}

/** The label colour that reads best on a filled colour. */
export function inkOn(fill: string, light = "#ffffff", dark = "#0e1116") {
  return contrast(fill, light) >= contrast(fill, dark) ? light : dark;
}

const BRAND: Record<Exclude<RichTextColor, "ink" | "muted">, { light: string; dark: string }> = {
  blue: { light: "#3a6dc5", dark: "#7ea4ea" },
  red: { light: "#d42c2c", dark: "#ff7a7a" },
  green: { light: "#0f8657", dark: "#4fcf95" },
  yellow: { light: "#8a6100", dark: "#f7bf33" },
};
const HIGHLIGHT_FILL: Record<Exclude<RichTextColor, "ink" | "muted">, string> = {
  blue: "#3a6dc5",
  red: "#f94141",
  green: "#0f8657",
  yellow: "#f7bf33",
};

export function formPalette(theme: FormDesign["theme"], scheme: ProjectColorScheme) {
  return PROJECT_THEMES[theme][scheme];
}

/** Every variable of one scheme, as `name: value` pairs. */
export function formThemeVars(
  palette: ProjectPalette,
  scheme: ProjectColorScheme,
  theme?: FormDesign["theme"],
) {
  const { bg, text } = palette;
  const vars: Record<string, string> = { ...projectPaletteVars(palette) };
  const muted = mixHex(text, bg, 0.3);

  for (const token of ["blue", "red", "green", "yellow"] as const) {
    vars[`--rt-${token}`] = ensureContrast(BRAND[token][scheme], bg, 4.5, text);
    // Highlights: a soft wash of the colour that body text still reads on.
    let wash = mixHex(bg, HIGHLIGHT_FILL[token], scheme === "light" ? 0.3 : 0.34);
    for (let step = 0; step < 8 && contrast(text, wash) < 7; step += 1) {
      wash = mixHex(wash, bg, 0.2);
    }
    vars[`--rt-${token}-wash`] = wash;
  }
  vars["--rt-ink"] = text;
  vars["--rt-ink-wash"] = mixHex(bg, text, 0.12);
  vars["--rt-muted"] = ensureContrast(muted, bg, 4.5, text);
  vars["--rt-muted-wash"] = mixHex(bg, text, 0.07);

  // Derived surfaces.
  const surface = scheme === "light" ? mixHex(bg, "#ffffff", 0.62) : mixHex(bg, text, 0.06);
  vars["--fx-surface"] = surface;
  vars["--fx-surface-2"] = scheme === "light" ? mixHex(bg, text, 0.045) : mixHex(bg, text, 0.11);
  vars["--fx-field"] = scheme === "light" ? mixHex(bg, "#ffffff", 0.78) : mixHex(bg, text, 0.08);
  vars["--fx-line"] = mixHex(bg, text, scheme === "light" ? 0.16 : 0.2);
  vars["--fx-line-strong"] = mixHex(bg, text, scheme === "light" ? 0.34 : 0.4);
  vars["--fx-muted"] = ensureContrast(muted, surface, 4.5, text);
  vars["--fx-on-highlight"] = inkOn(palette.highlight, "#ffffff", scheme === "light" ? text : bg);
  vars["--fx-highlight-soft"] = mixHex(bg, palette.highlight, scheme === "light" ? 0.12 : 0.2);
  vars["--fx-danger"] = ensureContrast(
    scheme === "light" ? "#d42c2c" : "#ff7a7a",
    surface,
    4.5,
    text,
  );
  vars["--fx-danger-soft"] = mixHex(bg, "#f94141", scheme === "light" ? 0.1 : 0.16);
  vars["--fx-success"] = ensureContrast(
    scheme === "light" ? "#0f8657" : "#4fcf95",
    surface,
    4.5,
    text,
  );
  vars["--fx-on-rt"] = scheme === "light" ? "#ffffff" : bg;
  vars["--fx-scrim"] = scheme === "light" ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
  vars["--fx-shadow"] =
    scheme === "light"
      ? "0 24px 60px -24px rgba(14,17,22,0.22), 0 4px 12px -6px rgba(14,17,22,0.08)"
      : "0 24px 60px -24px rgba(0,0,0,0.7), 0 4px 12px -6px rgba(0,0,0,0.4)";
  scenePieces(palette, scheme, theme).forEach((color, index) => {
    vars[`--fx-piece-${index}`] = color;
  });
  vars["color-scheme"] = scheme;
  return vars;
}

function declarations(vars: Record<string, string>) {
  return Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

/**
 * The stylesheet a form page renders. `auto` follows the site's `.dark`
 * class (so the first paint already wears the right scheme), a forced
 * scheme wins over it.
 */
export function formThemeCss(
  design: Pick<FormDesign, "theme" | "colorMode">,
  forced?: ProjectColorScheme,
) {
  const scheme = forced ?? (design.colorMode === "auto" ? undefined : design.colorMode);
  const page = "html,body{background:var(--project-bg)!important;color:var(--project-text)}";
  if (scheme) {
    const vars = declarations(
      formThemeVars(formPalette(design.theme, scheme), scheme, design.theme),
    );
    return `:root,:root.dark,:root.light{${vars}}${page}`;
  }
  const light = declarations(
    formThemeVars(formPalette(design.theme, "light"), "light", design.theme),
  );
  const dark = declarations(formThemeVars(formPalette(design.theme, "dark"), "dark", design.theme));
  return `:root{${light}}:root.dark{${dark}}${page}`;
}

/**
 * The themes built from the brand colours (DESIGN_SYSTEM §2.5) let the
 * scene quote the brand primaries, like the posters; every other theme
 * builds its pieces from its own palette.
 */
const BRAND_PIECES: Partial<Record<FormDesign["theme"], { light: string[]; dark: string[] }>> = {
  laboratory: {
    light: ["#3a6dc5", "#f7bf33", "#f94141", "#0f8657", "#0e1116"],
    dark: ["#7ea4ea", "#f7bf33", "#ff6b6b", "#3fbf86", "#eef3fc"],
  },
  sunburst: {
    light: ["#f7bf33", "#0e1116", "#f94141", "#3a6dc5", "#8a6100"],
    dark: ["#f7bf33", "#fff4d6", "#ff6b6b", "#7ea4ea", "#c99a1f"],
  },
  signal: {
    light: ["#c4000a", "#0e1116", "#f7bf33", "#3a6dc5", "#f94141"],
    dark: ["#ff4a4f", "#f2f2f4", "#f7bf33", "#7ea4ea", "#b3262b"],
  },
  grove: {
    light: ["#0b7a22", "#0f1a12", "#f7bf33", "#3a6dc5", "#0f8657"],
    dark: ["#2fc24f", "#d9f3de", "#f7bf33", "#7ea4ea", "#1d8a3a"],
  },
};

/** The five colours the scene's pieces wear. */
function scenePieces(
  palette: ProjectPalette,
  scheme: ProjectColorScheme,
  theme?: FormDesign["theme"],
) {
  const brand = theme ? BRAND_PIECES[theme] : undefined;
  if (brand) return brand[scheme];
  const { bg, text, highlight } = palette;
  const accent =
    palette.buttonBgHover.toLowerCase() === text.toLowerCase() ||
    contrast(palette.buttonBgHover, highlight) < 1.3
      ? mixHex(highlight, scheme === "light" ? "#ffffff" : "#000000", 0.35)
      : palette.buttonBgHover;
  const icon =
    contrast(palette.iconColor, bg) > contrast(palette.iconBg, bg)
      ? palette.iconColor
      : palette.iconBg;
  return [
    highlight,
    accent,
    mixHex(text, bg, scheme === "light" ? 0.06 : 0.1),
    mixHex(highlight, bg, 0.45),
    contrast(icon, highlight) < 1.4 ? mixHex(highlight, text, 0.4) : icon,
  ];
}

/** Colours the 3D scene draws with, in one scheme. */
export function sceneColors(theme: FormDesign["theme"], scheme: ProjectColorScheme) {
  const palette = formPalette(theme, scheme);
  return {
    bg: palette.bg,
    text: palette.text,
    highlight: palette.highlight,
    pieces: scenePieces(palette, scheme, theme),
  };
}

export type SceneColors = ReturnType<typeof sceneColors>;
