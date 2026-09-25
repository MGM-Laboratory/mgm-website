import { WORLD_PALETTE, worldHeaderColors } from "@/components/articles/world/palette";

/**
 * The portal's colours, for both schemes. They come from the library
 * world's own palette (components/articles/world/palette.ts), so the fog the
 * portal ends in is exactly the fog the world starts from, and the sheet
 * of paper the library hands back is the library's paper.
 *
 * Light: the heavenly side. Pearl fog, white-gold light pouring through an
 * arch, paper-white sheets and motes of light.
 * Dark: the same place with the lights out. A near-black void rimmed with
 * blue fire, ink-dark paper and rising embers.
 *
 * Kept tiny and free of heavy imports: the portal's controller (root
 * layout, every page) needs the cover colour synchronously.
 */

export type PortalPalette = {
  /** The fog: what the screen is when fully inside the portal. */
  fog: string;
  /** The light at the heart of the arch (light) or its fire (dark). */
  glow: string;
  /** The halo around the arch: warm gold (light) or the blue fire's outer flame (dark). */
  halo: string;
  /** The leading edge of the rising fog. */
  rim: string;
  /** Paper: the fragments that rise and the sheet that flies back out. */
  paper: string;
  /** Paper in shadow (the fold of a fragment, the far side of the sheet). */
  paperShade: string;
  /** Faint "text" printed on some fragments. */
  print: string;
  /** Motes of light (light) or blue sparks (dark). */
  mote: string;
  /** Warm sparks: gold dust (light) or embers (dark). */
  ember: string;
};

const LIGHT: PortalPalette = {
  fog: WORLD_PALETTE.light.fog,
  glow: WORLD_PALETTE.light.glow,
  halo: "#F7E3B0",
  rim: "#FFF6E2",
  paper: WORLD_PALETTE.light.paper,
  paperShade: "#E4DED2",
  print: "#9AA1AD",
  // Gold glints: white light would vanish against a white page.
  mote: "#D8B060",
  ember: "#F2D38C",
};

const DARK: PortalPalette = {
  fog: WORLD_PALETTE.dark.fog,
  glow: "#6F9BE6",
  halo: WORLD_PALETTE.dark.glow,
  rim: "#9DB9F2",
  paper: WORLD_PALETTE.dark.paper,
  paperShade: "#0D1120",
  print: "#3B4150",
  mote: WORLD_PALETTE.dark.mote,
  ember: WORLD_PALETTE.dark.ember,
};

export function portalPalette(dark: boolean): PortalPalette {
  return dark ? DARK : LIGHT;
}

/** The header palette inside the library (the portal walks the header to it). */
export function portalHeaderColors(dark: boolean) {
  return worldHeaderColors(dark);
}

/** "#RRGGBB" to 0..1 channels (WebGL uniforms). */
export function hexUnit(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
