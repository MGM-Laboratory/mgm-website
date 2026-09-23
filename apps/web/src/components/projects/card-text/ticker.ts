import gsap from "gsap";

/**
 * One shared gsap.ticker callback drives every card's text effects (the
 * category scramble and the title drop). Effects register while they run
 * and drop out once they finish, so fifteen cards never mean fifteen
 * animation loops, and an idle page has no text callback at all.
 *
 * Time is accumulated from frame deltas the way lusion's own loop does it
 * (rather than read from a wall clock), so a hidden tab simply freezes the
 * effects where they are and they resume on return instead of jumping to
 * their end.
 */

/** Advances an effect by `dt` seconds; returns false once it has finished. */
export type TextEffect = (dt: number) => boolean;

// lusion's main loop clamps every frame delta to 1/20 s: a long frame
// slows the animation for a moment instead of skipping part of it.
const MAX_DT = 1 / 20;
// An effect usually starts between two frames (from an observer callback),
// and gsap.ticker.add() can even dispatch synchronously while waking a
// sleeping ticker, so the first delta an effect sees is capped at one
// 60 fps frame. That keeps its first painted frame at the very start of
// the curve (e.g. the drop's -499.7% that lusion measures on frame one).
const FIRST_DT = 1 / 60;

// Effect -> whether it has not been ticked yet.
const effects = new Map<TextEffect, boolean>();
let listening = false;

function tick(_time: number, deltaMs: number) {
  // rAF already stops in a background tab; this also covers a ticker
  // driven by timers or a frame that lands while the page is hidden.
  if (document.hidden) return;
  const dt = Math.min(Math.max(deltaMs, 0) / 1000, MAX_DT);
  // Deleting the current entry while iterating a Map is safe.
  for (const [effect, fresh] of effects) {
    if (fresh) effects.set(effect, false);
    if (!effect(fresh ? Math.min(dt, FIRST_DT) : dt)) effects.delete(effect);
  }
  if (!effects.size) stopListening();
}

function stopListening() {
  if (!listening) return;
  listening = false;
  gsap.ticker.remove(tick);
}

/**
 * Starts ticking an effect (it must already have painted its first frame).
 * Returns a stop function; stopping an effect that already finished is a
 * harmless no-op.
 */
export function runTextEffect(effect: TextEffect): () => void {
  effects.set(effect, true);
  if (!listening) {
    listening = true;
    gsap.ticker.add(tick);
  }
  return () => {
    effects.delete(effect);
    if (!effects.size) stopListening();
  };
}
