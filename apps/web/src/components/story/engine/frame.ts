/**
 * The shared frame every act works in (SPEC section 2.4a), so the acts meet
 * without seams. Everything lives in the room glTF's frame: metres, Y up,
 * right-handed, the floor at y = 0 (research/room.md section 0). Angles in
 * degrees where the name says so, radians otherwise. Plain numbers only.
 *
 * The card act plays in the air above the coffee table while the page
 * colour backdrop hides the room, so the drop and the crane down into the
 * landing shot are one continuous camera move.
 */

export type Vec3 = readonly [number, number, number];

/** Coffee table top: centre and height (research/room.md section 2). */
export const TABLE_TOP = { centre: [0.1773, 0.4215, -0.8048] as Vec3, y: 0.4215 } as const;

/** Where the box comes to rest on the table, and its yaw (degrees about +y). */
export const BOX_REST = { position: [0.4675, 0.4216, -0.4335] as Vec3, yawDeg: 10 } as const;

/** Where Godette's figure stand sits on the table. */
export const FIGURE_SPOT: Vec3 = [0.527, 0.4216, -0.6035];

/**
 * The card stage: the box's rest pose at the end of `c-rise` is centred on
 * `centre`, upright, its front face looking along +x (toward the camera).
 * The swarm and the four cards play within `radius` of it.
 */
export const CARD_STAGE = {
  centre: [0.4675, 1.22, -0.4335] as Vec3,
  radius: 0.4,
  /** The card act camera looks along -x at the centre from this far. */
  distance: 0.8,
  /** Vertical FOV (degrees): a long lens on 16:9, wider on portrait. */
  fovLandscapeDeg: 14,
  fovPortraitDeg: 24,
} as const;

/** The landing shot `a_land` (research/room.md section 4). */
export const SHOT_LAND = {
  position: [1.292, 0.6584, -0.493] as Vec3,
  target: [-0.34, 0.5989, -0.5695] as Vec3,
  fovLandscapeDeg: 34,
  fovPortraitDeg: 58,
} as const;

/**
 * The room's lamp level (`StoryRoom.lamps`, 0 to 1) at the hand-off from the
 * card act's drop to the room act (`c-drop` 1 = `r-land` 0): the card act's
 * warm-up ends here and the room act's starts here, so the light never pops.
 */
export const LAMPS_AT_LAND = 0.7;

/** Real sizes, metres. */
export const SIZES = {
  box: { width: 0.0635, height: 0.0896, depth: 0.0206 },
  /** The card back's own proportions (back.svg, 641 x 1078): 52.3 x 88 mm. See props/card-mesh.ts. */
  card: {
    width: (0.088 * 641) / 1078,
    height: 0.088,
    thickness: 0.0003,
    cornerRadius: (0.088 * 50) / 1078,
  },
  /** Godette on her stand. */
  figureHeight: 0.175,
  /** Model height 1.848 m scaled to the toy; equals GODETTE_TABLE_SCALE (props/godette.ts). */
  figureScale: 0.0915,
  /** Capital height of the toy letters at their default 34 cm strip (props/toy-letters.ts). */
  letterHeight: 0.0178,
} as const;

/** 16:9 and 9:16, the aspects the paired FOVs are authored for. */
const LANDSCAPE = 16 / 9;
const PORTRAIT = 9 / 16;

/**
 * A vertical FOV for `aspect`, blended between the landscape (16:9) and
 * portrait (9:16) values on a log-aspect scale, clamped outside them.
 */
export function fovForAspect(landscapeDeg: number, portraitDeg: number, aspect: number) {
  const a = Math.log(Math.max(0.2, aspect));
  const t = (a - Math.log(PORTRAIT)) / (Math.log(LANDSCAPE) - Math.log(PORTRAIT));
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return portraitDeg + (landscapeDeg - portraitDeg) * k;
}
