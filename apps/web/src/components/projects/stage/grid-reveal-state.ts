/**
 * The project list's reveal, shared between the grid (which fades and
 * lifts the DOM list in) and the WebGL cover stage (whose canvas lives at
 * the body level, outside the list, so it can't inherit the list's opacity
 * or transform and must apply the same values to its covers itself).
 *
 * `started` flips when the reveal begins: covers in view play their
 * opening from that moment on, never before (the list is invisible until
 * then). The grid resets this on mount, since module state survives
 * client-side navigation.
 */
export const gridRevealState = {
  started: false,
  /** The list's current opacity, 0..1. */
  opacity: 0,
  /** The list's current vertical offset in CSS px (its rise). */
  y: 0,
};

/**
 * Covers on screen at the reveal hold their opening's first frame until
 * the list is this opaque (about 0.24 s into the 0.9 s fade): started on
 * the reveal's first frame, the edge smear and most of the focus hunt
 * played on a nearly transparent list and read as a washed-out blur.
 */
export const OPENING_MIN_REVEAL_OPACITY = 0.6;

export function resetGridRevealState() {
  gridRevealState.started = false;
  gridRevealState.opacity = 0;
  gridRevealState.y = 0;
}
