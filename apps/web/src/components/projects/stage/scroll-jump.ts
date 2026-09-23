/**
 * Tells scroll motion apart from scroll jumps for the cards' physics (the
 * lens, the bend, the DOM lean). A jump moves the page without gliding: the
 * End key, an anchor, a programmatic jump, or the browser scrolling a newly
 * keyboard-focused card into view. It must move the covers but feed none of
 * the physics; read as motion, a single-frame jump of a few hundred pixels
 * is tens of thousands of px/s, which maxed the lens and swung every card
 * as if flicked.
 *
 * A frame counts as a jump when it moves more than a screen, or more than
 * JUMP_SHARE of one straight out of a page that was still. Real motion
 * ramps up: the smooth scroller's first frame after a wheel notch covers a
 * fraction of the notch, and a touch drag starts with small moves.
 */

const JUMP_SHARE = 0.3;
const STILL_SHARE = 0.05;

/** Returns a per-frame filter: pass the raw scroll change, get the motion. */
export function createScrollDeltaFilter() {
  let previous = 0;
  return (moved: number, viewportHeight: number) => {
    const size = Math.abs(moved);
    const fromStill = Math.abs(previous) < STILL_SHARE * viewportHeight;
    previous = moved;
    if (size > viewportHeight || (fromStill && size > JUMP_SHARE * viewportHeight)) return 0;
    return moved;
  };
}
