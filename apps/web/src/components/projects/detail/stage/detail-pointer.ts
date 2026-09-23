/**
 * The cursor lens over the detail media: a small magnifying bulge that
 * eases in while a fine pointer rests over a media item, follows it with a
 * little lag, and drags the picture slightly along the cursor's motion (the
 * lag itself is the drag, so it fades as soon as the cursor stops).
 *
 * Only for fine pointers (the stage never creates one on touch). The
 * canvas ignores pointer events, so this listens on the window.
 */

const STRENGTH_IN = 0.22; // s, time constant
const STRENGTH_OUT = 0.3;
const FOLLOW = 0.07; // s, the lens centre's lag behind the cursor
const DRAG_GAIN = 0.35; // share of the lag the picture is dragged by
const DRAG_MAX = 8; // CSS px
const EPSILON = 1e-3;

export class PointerLens {
  /** Raw pointer, CSS px (viewport). */
  x = 0;
  y = 0;
  /** A mouse or pen is over the page. */
  inside = false;
  /** Eased lens centre, CSS px. */
  cx = 0;
  cy = 0;
  strength = 0;
  dragX = 0;
  dragY = 0;

  private moved = false;
  private readonly controller = new AbortController();

  constructor() {
    const signal = this.controller.signal;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      this.x = event.clientX;
      this.y = event.clientY;
      this.inside = true;
      this.moved = true;
    };
    const onLeave = () => {
      this.inside = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true, signal });
    window.addEventListener("pointerdown", onMove, { passive: true, signal });
    document.documentElement.addEventListener("pointerleave", onLeave, { signal });
    window.addEventListener("blur", onLeave, { signal });
  }

  dispose() {
    this.controller.abort();
  }

  /**
   * Eases the lens toward `engaged` (the pointer is over a media item and
   * the page is calm). Returns whether the lens changed this frame.
   */
  step(dt: number, engaged: boolean) {
    const target = engaged && this.inside ? 1 : 0;
    const before = this.strength;
    const tau = target > this.strength ? STRENGTH_IN : STRENGTH_OUT;
    this.strength += (target - this.strength) * (1 - Math.exp(-dt / tau));
    if (Math.abs(target - this.strength) < EPSILON) this.strength = target;

    const beforeX = this.cx;
    const beforeY = this.cy;
    if (before === 0) {
      // Appears where the cursor is, never slides in from its last spot.
      this.cx = this.x;
      this.cy = this.y;
    } else {
      const follow = 1 - Math.exp(-dt / FOLLOW);
      this.cx += (this.x - this.cx) * follow;
      this.cy += (this.y - this.cy) * follow;
      if (Math.abs(this.x - this.cx) < 0.01 && Math.abs(this.y - this.cy) < 0.01) {
        this.cx = this.x;
        this.cy = this.y;
      }
    }
    let dx = (this.x - this.cx) * DRAG_GAIN;
    let dy = (this.y - this.cy) * DRAG_GAIN;
    const length = Math.hypot(dx, dy);
    if (length > DRAG_MAX) {
      dx *= DRAG_MAX / length;
      dy *= DRAG_MAX / length;
    }
    this.dragX = dx;
    this.dragY = dy;

    const moved = this.moved;
    this.moved = false;
    return (
      this.strength !== before ||
      (this.strength > 0 && (moved || this.cx !== beforeX || this.cy !== beforeY))
    );
  }
}
