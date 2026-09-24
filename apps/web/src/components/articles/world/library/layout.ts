import type { QualityTier } from "@/components/articles/world/world-api";

/**
 * The library's floor plan, in library units (the engine scales the whole
 * library group so that one unit is `uEnvScale` CSS px, about a ninth of the
 * viewport height). The eye sits at y = 0 on the card plane (z = 0); the nave
 * runs away from it toward negative z, ending at the great window.
 *
 * Across the nave (x) nothing is fixed: the two walls stand just outside the
 * list's columns at every width (the engine measures the cards and moves the
 * walls, see `setNaveHalfWidth`), so the arcade frames the list the way
 * unseen.co's frames its projects, from a portrait phone to a 21:9 screen.
 *
 * Everything else (the storeys, the galleries, the springing of the arches,
 * the lanterns) is a height or a depth, and scales with the viewport height.
 */

/** The floor. */
export const FLOOR_Y = -9;
/** Gallery floors (slab tops): one just under the eye, one above it. */
export const GALLERY_Y = [-2.2, 5.2] as const;
/** Where the stacks end under the cornice, and the transverse arches spring. */
export const SPRING_Y = 11.6;
/** The nearest pier (toward the camera) and the bay length along the nave. */
export const NEAR_Z = 9;
export const BAY = 5;
/** Shelf pitch inside a storey. */
export const SHELF_GAP = 1.42;
/** How far a gallery slab and its balustrade stand out into the nave. */
export const GALLERY_DEPTH = 1.05;

export const TIER_LAYOUT: Record<
  QualityTier,
  {
    /** Bays per wall (each BAY long): the nave's length before the window. */
    bays: number;
    /** Books: the smallest spine width (fewer, thicker books on weak devices). */
    bookMin: number;
    pages: number;
    motes: number;
    floaters: number;
    glyphs: number;
    fogSheets: number;
    shafts: number;
  }
> = {
  high: {
    bays: 24,
    bookMin: 0.1,
    pages: 40,
    motes: 1800,
    floaters: 14,
    glyphs: 90,
    fogSheets: 5,
    shafts: 14,
  },
  medium: {
    bays: 18,
    bookMin: 0.14,
    pages: 28,
    motes: 1100,
    floaters: 10,
    glyphs: 56,
    fogSheets: 4,
    shafts: 10,
  },
  low: {
    bays: 13,
    bookMin: 0.2,
    pages: 16,
    motes: 600,
    floaters: 6,
    glyphs: 30,
    fogSheets: 2,
    shafts: 6,
  },
};

/** The far end of the nave (the window wall) for a number of bays. */
export function farZ(bays: number) {
  return NEAR_Z - bays * BAY;
}

// ------------------------------------------------------------------ lanterns

/**
 * Lanterns hang down the nave on chains from the vault, alternating sides.
 * Their positions are a formula (not a list), so every stone and paper
 * shader can find the few lanterns near a fragment and take their light,
 * and the lantern meshes (lanterns.ts) put their glass at the same places.
 * Keep LANTERN_GLSL (library-glsl.ts) in step with `lanternPosition`.
 */
export const LANTERN_STEP = 8.5;
export const LANTERN_Z0 = 1.5;
/** Height band: they hang above the eye, the lowest a little over it. */
export const LANTERN_Y = 4.6;
export const LANTERN_AMP = 1.9;
/** Across the nave, as a share of the half width. */
export const LANTERN_SPREAD = 0.6;

export function lanternCount(bays: number) {
  return Math.max(1, Math.floor((LANTERN_Z0 - farZ(bays) - 4) / LANTERN_STEP));
}

/** Lantern k's glass, in library units (x as a share of the half width). */
export function lanternPosition(k: number) {
  return {
    side: k % 2 === 0 ? -1 : 1,
    y: LANTERN_Y + LANTERN_AMP * Math.sin(k * 2.39996 + 0.7),
    z: LANTERN_Z0 - k * LANTERN_STEP,
  };
}
