/**
 * How the finale's two halves talk: the WebGL act (`acts/finale`) and the
 * DOM block ("Let's work together.", `finale-block.tsx`). Framework free
 * and tiny, so the act never imports React and the block never imports
 * three.js.
 *
 * - The act latches the title on once she has waved (`setTitle`); the
 *   block plays its letters in, or back out when the visitor scrolls back.
 * - The block reports the pointer over its title and its action
 *   (`setHover`), so she can look at what the visitor is looking at.
 */

export type FinaleHoverTarget = "title" | "action";

type Listener = () => void;

class FinaleSignal {
  private titleOn = false;
  private readonly listeners = new Set<Listener>();
  private hover: FinaleHoverTarget | null = null;
  private pressedAt = -Infinity;

  /** Whether the act wants the title shown. */
  get title() {
    return this.titleOn;
  }

  /** The act's latch: true once she has waved, false when the visitor scrolls back above it. */
  setTitle(on: boolean) {
    if (on === this.titleOn) return;
    this.titleOn = on;
    for (const listener of [...this.listeners]) listener();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** What the pointer is over in the block (null: neither). */
  get hovered() {
    return this.hover;
  }

  setHover(target: FinaleHoverTarget | null) {
    this.hover = target;
  }

  /** The block's action was pressed (she cheers). Read with `pressedSince`. */
  press() {
    this.pressedAt = performance.now();
  }

  /** Seconds since the action was last pressed. */
  pressedSince() {
    return (performance.now() - this.pressedAt) / 1000;
  }
}

export const finaleSignal = new FinaleSignal();
