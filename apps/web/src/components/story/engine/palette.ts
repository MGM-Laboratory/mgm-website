import type { StoryPalette } from "@/components/story/engine/act";

/**
 * The story palette, read from the page's own tokens (`globals.css`), so the
 * backdrop and the finale match the DOM exactly in both schemes. The card
 * back and the box keep the owner's colours.
 */

const FALLBACK = {
  light: { page: 0xf7f7f5, ink: 0x0e1116, line: 0xececea },
  dark: { page: 0x15181e, ink: 0xededed, line: 0x262a33 },
} as const;

function hexOf(value: string, fallback: number) {
  const match = /^#([\da-f]{6})$/i.exec(value.trim());
  return match ? Number.parseInt(match[1], 16) : fallback;
}

export function readStoryPalette(): StoryPalette {
  const root = document.documentElement;
  const dark = root.classList.contains("dark");
  const base = dark ? FALLBACK.dark : FALLBACK.light;
  const style = getComputedStyle(root);
  const token = (name: string, fallback: number) => hexOf(style.getPropertyValue(name), fallback);
  return {
    scheme: dark ? "dark" : "light",
    page: token("--background", base.page),
    ink: token("--foreground", base.ink),
    line: token("--line", base.line),
    blue: token("--brand-blue", 0x3a6dc5),
    yellow: token("--brand-yellow", 0xf7bf33),
    red: token("--brand-red", 0xf94141),
    green: token("--brand-green", 0x0f8657),
    white: 0xffffff,
    cardBack: 0x2d318a,
    box: 0x3a6dc5,
  };
}

export function samePalette(a: StoryPalette, b: StoryPalette) {
  return a.scheme === b.scheme && a.page === b.page && a.ink === b.ink && a.line === b.line;
}

/** 0xRRGGBB as a CSS colour. */
export function cssHex(hex: number) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}
