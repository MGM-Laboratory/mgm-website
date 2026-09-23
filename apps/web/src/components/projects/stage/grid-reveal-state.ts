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

export function resetGridRevealState() {
  gridRevealState.started = false;
  gridRevealState.opacity = 0;
  gridRevealState.y = 0;
}
