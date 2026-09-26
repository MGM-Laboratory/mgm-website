import { createLetters } from "./letters";
import { createStage } from "./stage";

/**
 * Everything in the desktop hero that answers the visitor once the entrance
 * is over: the letters, the shapes, the arrow, the background motifs, the
 * scroll cue and the doze. Started from the hero's idle phase (after the
 * entrance completes, or right away when it is skipped) and only when
 * motion is allowed; returns the teardown, which puts every element and
 * the markup back exactly as the entrance left them.
 */

export type HeroInteractionsOptions = {
  /** Each word's SplitText chars, in reading order. */
  words: HTMLElement[][];
  /** The "i" in Media. */
  flipper: HTMLElement | null;
};

export function startHeroInteractions(root: HTMLElement, options: HeroInteractionsOptions) {
  const stage = createStage(root);
  const letters = createLetters(stage, options.words, options.flipper);
  stage.add(letters);

  const onPointerDown = (event: PointerEvent) => {
    if (!stage.active() || event.button > 0) return;
    const target = event.target as Element | null;
    if (!target) return;
    const rect = root.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (letters.press(target, x)) return;
  };
  root.addEventListener("pointerdown", onPointerDown);

  return () => {
    root.removeEventListener("pointerdown", onPointerDown);
    stage.destroy();
  };
}
