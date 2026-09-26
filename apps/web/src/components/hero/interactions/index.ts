import { createArrow } from "./arrow";
import type { ArrowGeometry } from "./arrow-path";
import { createLetters } from "./letters";
import { createMotifs } from "./motifs";
import { createPieces } from "./pieces";
import { createStage } from "./stage";

/**
 * Everything in the desktop hero that answers the visitor once the entrance
 * is over: the letters, the shapes, the arrow and the background motifs. Started from the hero's idle phase (after the
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
  /** The arrow's current geometry, as hero.tsx last measured it. */
  arrowGeometry: () => ArrowGeometry | null;
};

/** What a press on these must never be taken for: an empty-space click. */
const CONTROLS = "a, button, input, [role='button'], .hero-cta";

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

  const onPointerDown = (event: PointerEvent) => {
    if (!stage.active() || event.button > 0) return;
    const target = event.target as Element | null;
    if (!target || target.closest(CONTROLS)) return;
    const rect = root.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const touch = event.pointerType === "touch";
    if (letters.press(target, x)) return;
    if (pieces.press(target, x, touch)) return;
    if (arrow?.press(x, y, touch)) return;
    motifs.burst(x, y);
  };
  const onPointerUp = () => pieces.release();
  root.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  return () => {
    root.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    stage.destroy();
  };
}
