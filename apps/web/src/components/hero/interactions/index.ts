import gsap from "gsap";

import { createArrow } from "./arrow";
import type { ArrowGeometry } from "./arrow-path";
import { startDoze, type IdleLoops } from "./doze";
import { createLetters } from "./letters";
import { createMotifs } from "./motifs";
import { createPieces } from "./pieces";
import { startScrollCue } from "./scroll-cue";
import { createStage } from "./stage";

export type { IdleLoops } from "./doze";

/**
 * Everything in the desktop hero that answers the visitor once the entrance
 * is over: the letters, the shapes, the arrow, the background motifs, the
 * scroll cue and the doze. Started from the hero's idle phase (after the
 * entrance completes, or right away when it is skipped), only when motion
 * is allowed, and loaded lazily so the compact hero never downloads it.
 * Returns the teardown, which puts every element and the markup back
 * exactly as the entrance left them.
 *
 * Hover and proximity need a hovering pointer; a touch tap gets each
 * element's press reaction.
 */

export type HeroInteractionsOptions = {
  /** Each word's SplitText chars, in reading order. */
  words: HTMLElement[][];
  /** The "i" in Media. */
  flipper: HTMLElement | null;
  /** The idle loops, which the doze slows down. */
  loops: IdleLoops;
  /** The arrow's current geometry, as hero.tsx last measured it. */
  arrowGeometry: () => ArrowGeometry | null;
};

/** What a press on these must never be taken for: an empty-space click. */
const CONTROLS = "a, button, input, [role='button'], .hero-cta";
/** A touch that travels further than this (px) is a swipe, not a tap. */
const TAP_SLOP = 12;
/** How long a tap holds its press before it lets go, seconds. */
const TAP_HOLD = 0.12;

export function startHeroInteractions(root: HTMLElement, options: HeroInteractionsOptions) {
  const stage = createStage(root);
  const letters = createLetters(stage, options.words, options.flipper);
  const pieces = createPieces(stage);
  const arrow = createArrow(stage, options.arrowGeometry);
  const motifs = createMotifs(stage);
  stage.add(letters);
  stage.add(pieces);
  if (arrow) stage.add(arrow);
  stage.add(motifs);
  const stopDoze = startDoze(stage, options.loops, [letters, pieces]);
  const stopCue = startScrollCue(stage);

  function press(target: Element, clientX: number, clientY: number, touch: boolean) {
    const rect = root.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (letters.press(target, x)) return;
    if (pieces.press(target, x, touch)) return;
    if (arrow?.press(x, y, touch)) return;
    motifs.burst(x, y);
  }

  // A mouse or pen presses on the way down. A finger may only be starting
  // a scroll, so its press waits for the tap to finish: a swipe that
  // begins on a shape (or on empty space) scrolls the page and nothing
  // toggles, flips or bursts.
  let tap: { id: number; x: number; y: number; target: Element } | null = null;
  let tapRelease: gsap.core.Tween | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (!stage.active() || event.button > 0) return;
    const target = event.target as Element | null;
    if (!target || target.closest(CONTROLS)) return;
    if (event.pointerType === "touch") {
      tap = { id: event.pointerId, x: event.clientX, y: event.clientY, target };
      return;
    }
    press(target, event.clientX, event.clientY, false);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!tap || event.pointerId !== tap.id) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) tap = null;
  };
  const onPointerUp = (event: PointerEvent) => {
    const pending = tap;
    tap = null;
    if (pending && event.pointerId === pending.id && event.type === "pointerup" && stage.active()) {
      tapRelease?.kill();
      pieces.release();
      press(pending.target, pending.x, pending.y, true);
      tapRelease = gsap.delayedCall(TAP_HOLD, () => {
        pieces.release();
      });
      return;
    }
    pieces.release();
  };
  root.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  return () => {
    root.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    tapRelease?.kill();
    stopCue();
    stopDoze();
    stage.destroy();
  };
}
