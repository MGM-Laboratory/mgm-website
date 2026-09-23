import { runTextEffect } from "@/components/projects/card-text/ticker";

/**
 * lusion.co's title "drop" (ProjectItem, `.project-item-line-2`). Every
 * character is a column of four identical copies inside a one-line,
 * overflow-hidden window. The column slides from -500% of its own
 * four-line height down to 0 with expoInOut over 1.25 s: it is out of
 * sight for the first ~0.65 s, then copies four, three and two fall
 * through the window, each slower than the last as the ease decelerates,
 * before copy one lands and stops. The middle characters lead the edges
 * by up to ~62 ms (an arch). Before the first trigger the columns wait
 * at -400% (just out of sight); a replay snaps them to -500%.
 *
 * Only this controller writes the columns' transform (directly, like
 * lusion; there is no GSAP tween on them to conflict with), and it clears
 * the transform once the title has landed so fifteen resting titles don't
 * keep a compositor layer per character.
 */

// lusion's constants: `line2Time += dt * 0.8` (1.25 s from 0 to 1) and a
// stagger of cos(p)/20 in that normalized time.
const TIME_SCALE = 0.8;
const TEXT_STAGGER = 20;
const TRAVEL = 500;
const WAITING = "translateY(-400%)";

const saturate = (x: number) => Math.min(1, Math.max(0, x));

// lusion's expoInOut (standard Penner), kept verbatim for an exact curve.
function expoInOut(x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x < 0.5 ? 0.5 * Math.pow(1024, 2 * x - 1) : 0.5 * (2 - Math.pow(2, -10 * (2 * x - 1)));
}

/** The column's travel left, in percent of its height, at drop time `t`. */
export function dropPercent(t: number, lead: number) {
  return TRAVEL * (1 - expoInOut(saturate(t + lead)));
}

/**
 * How far character `index` of `count` runs ahead: p = fit(i, 0, n-1,
 * PI/2, 3PI/2) and a lead of -cos(p)/20, zero at both ends and 0.05 in
 * the middle. A one-character title has no arch (and no 0/0).
 */
function leadFor(index: number, count: number) {
  const p =
    count > 1 ? Math.PI / 2 + (Math.min(index, count - 1) / (count - 1)) * Math.PI : Math.PI / 2;
  return -Math.cos(p) / TEXT_STAGGER;
}

export type DropState = "waiting" | "running" | "landed";

export type TitleDrop = {
  readonly state: DropState;
  /**
   * Points the drop at the current columns (every `.project-card-drop`
   * under `container`, each with a `data-drop-index`) of a title `count`
   * characters long, and paints the current state onto them right away.
   * Called again after every re-split, so a title that re-renders mid-drop
   * (the truncation re-fits once fonts load) continues seamlessly.
   */
  setColumns(container: HTMLElement, count: number): void;
  /** Replays from -500%. */
  play(): void;
  /** Stops and parks the columns at -400% (the pre-entrance state). */
  reset(): void;
  /** Stops with the title landed. */
  finish(): void;
  /**
   * Sets the one listener told when the title lands or is parked again by
   * reset(), so hover affordances can wait for letters that are actually
   * on screen. finish() stays silent: it is the teardown path, and the
   * listener's own effect is being torn down alongside it.
   */
  onChange(listener: (() => void) | null): void;
};

export function createTitleDrop(): TitleDrop {
  // "landed" matches the server HTML, which shows the plain title.
  let state: DropState = "landed";
  let time = 0;
  let columns: HTMLElement[] = [];
  let leads: number[] = [];
  let stop: (() => void) | null = null;
  let listener: (() => void) | null = null;

  const paint = () => {
    if (state === "running") {
      columns.forEach((column, k) => {
        column.style.transform = `translate3d(0, ${(-dropPercent(time, leads[k])).toFixed(3)}%, 0)`;
      });
    } else {
      const value = state === "waiting" ? WAITING : "";
      for (const column of columns) column.style.transform = value;
    }
  };
  const halt = () => {
    stop?.();
    stop = null;
  };

  return {
    get state() {
      return state;
    },
    setColumns(container, count) {
      columns = Array.from(container.querySelectorAll<HTMLElement>(".project-card-drop"));
      leads = columns.map((column) => leadFor(Number(column.dataset.dropIndex) || 0, count));
      paint();
    },
    play() {
      halt();
      state = "running";
      time = 0;
      paint();
      stop = runTextEffect((dt) => {
        time += dt * TIME_SCALE;
        // Every lead is >= 0, so all columns have landed once time hits 1.
        if (time >= 1) {
          // State first, so the listener already reads "landed".
          state = "landed";
          stop = null;
          paint();
          listener?.();
          return false;
        }
        paint();
        return true;
      });
    },
    reset() {
      halt();
      state = "waiting";
      paint();
      listener?.();
    },
    finish() {
      halt();
      state = "landed";
      paint();
    },
    onChange(next) {
      listener = next;
    },
  };
}
