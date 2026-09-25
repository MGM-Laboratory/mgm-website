/**
 * The library world's own palette, for both schemes. Light mode is the
 * heavenly archive: pearl fog, ivory stone and paper, warm white light.
 * Dark mode is the same place after the lights go out: near-black fog,
 * ink-blue stacks, a moonlit brand-blue glow and a few ember sparks.
 *
 * These are the world's design tokens (DESIGN_SYSTEM.md §2.5 covers the
 * articles pages as a scoped exception, like the project themes). Text on
 * the fog uses the site's own ink tokens, so contrast matches the rest of
 * the site: --ink on the light fog is over 15:1, the dark foreground on the
 * dark fog over 16:1.
 *
 * Colours are sRGB hex. The engine uploads them raw (its whole pipeline
 * stays in display sRGB, like the project cover stage), so what is written
 * here is what shows.
 */

export type WorldSchemePalette = {
  /** The fog, and the page behind everything. */
  fog: string;
  /** The far window of light at the end of the nave. */
  glow: string;
  /** Stone: shelves, arches, the floor. */
  stone: string;
  /** Paper: loose pages drifting through the air. */
  paper: string;
  /** Book spines, sampled per book. */
  books: readonly string[];
  /** The river of light along the floor. */
  river: string;
  /** Light shafts from the high windows. */
  shaft: string;
  /** Dust motes and cursor sparks. */
  mote: string;
  /** A second spark colour (dark mode's embers). */
  ember: string;
  /** The lanterns' flame: a warm white by day, a candle ember by night. */
  lantern: string;
  /** Light pouring through the great window (sun by day, moon by night). */
  window: string;
  /** The drifting glyphs of the night library. */
  glyph: string;
  /** The front of a theme switch: dawn gold into the light, blue fire into the dark. */
  front: string;
  /** Card text: title, then the quieter description and the rule. */
  ink: string;
  inkSoft: string;
  rule: string;
  /** Focus rings and the few accents (brand blue). */
  accent: string;
};

export const WORLD_PALETTE: { light: WorldSchemePalette; dark: WorldSchemePalette } = {
  light: {
    fog: "#EDEFF3",
    glow: "#FFFDF7",
    stone: "#F3F0EA",
    paper: "#FCFBF8",
    books: [
      "#F5F0E6",
      "#E8DDC8",
      "#DCD2BF",
      "#FAF8F3",
      "#E4D3AE",
      "#D5DEE9",
      "#ECE4D8",
      "#CEC4B2",
      "#E9D9CF",
      "#DDE3DA",
    ],
    river: "#FFFCF4",
    shaft: "#FFF8EA",
    mote: "#FFFFFF",
    ember: "#F7E3B0",
    lantern: "#FFD58A",
    window: "#FFF4DC",
    glyph: "#C9A24B",
    front: "#FFC65C",
    ink: "#0E1116",
    inkSoft: "#3B4150",
    rule: "#0E1116",
    accent: "#3A6DC5",
  },
  dark: {
    fog: "#05060A",
    glow: "#3A6DC5",
    stone: "#0C0E14",
    paper: "#1A2031",
    books: [
      "#10131C",
      "#151A27",
      "#0B0D13",
      "#1A1F2E",
      "#241C12",
      "#12203D",
      "#0F1219",
      "#1C1A20",
      "#2A1518",
      "#10201C",
    ],
    river: "#2A4E8F",
    shaft: "#3A6DC5",
    mote: "#9DB9F2",
    ember: "#F7BF33",
    lantern: "#FF8A2B",
    window: "#BFD3FF",
    glyph: "#7FA8F5",
    front: "#5B8CFF",
    ink: "#EDEDED",
    inkSoft: "#B9BCC6",
    rule: "#EDEDED",
    accent: "#6F9BE6",
  },
};

/**
 * The header palette over the library (for walkHeaderPalette during the
 * portal and close transitions): the fog as the surface, the ink as text.
 */
export function worldHeaderColors(dark: boolean) {
  const p = dark ? WORLD_PALETTE.dark : WORLD_PALETTE.light;
  return {
    bg: p.fog,
    text: p.ink,
    highlight: p.accent,
    buttonBg: p.ink,
    buttonText: p.fog,
    buttonBgHover: p.accent,
    buttonTextHover: "#FFFFFF",
    iconBg: p.ink,
    iconColor: p.fog,
  };
}

export function hexToUnit(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const n = Number.parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
