/**
 * The contract between the /projects cards and the page-level cover stage
 * (the one full-screen WebGL canvas that draws every card's cover, lusion
 * style, with a DOM fallback).
 *
 * - Each card's cover registers itself here on mount with the elements the
 *   stage needs: the link root (hover source), the cover frame (the rect
 *   the stage draws into) and the DOM <img> (texture source, and the
 *   fallback render).
 * - The stage decides one page-wide mode: "gl" (the WebGL stage runs) or
 *   "dom" (final: reduced motion, touch, no WebGL2, a failed start, a lost
 *   context). While undecided the mode is "pending"; the list may reveal
 *   in that state, and the stage can still start afterwards.
 * - Ownership is per card, whatever the mode: when the stage takes over a
 *   card it sets `data-stage="gl"` on that card's frame; the cover's markup
 *   hides its DOM <img> (visibility, never opacity: GSAP may own the img's
 *   inline opacity) and its frame background from that attribute, and the
 *   stage then owns the card's opening and hover. Every card without the
 *   attribute plays the DOM opening and hover. Removing the attribute
 *   (context loss) brings the DOM cover straight back.
 * - The DOM cover marks its frame `data-dom-opening` / `data-dom-hover`
 *   while it is anywhere but at rest; the stage only takes a card over on
 *   screen while neither is set.
 *
 * Module state persists across client-side navigation; the stage host
 * calls `resetStage()` when it mounts for a new visit.
 */

/**
 * A card's opening starts once this share of its cover frame is on screen,
 * so the zoom-out and the focus hunt play where they can be seen (starting
 * at the first pixel spent them on a sliver at the viewport's edge). The
 * WebGL stage and the DOM covers both use it.
 */
export const OPENING_VISIBLE_SHARE = 0.25;
/**
 * Camera order within an opening: the zoom-out starts with a radial smear
 * at the edges on a sharp picture, then the focus hunts (blur, sharp, a
 * little soft, sharp), starting this long after the zoom and blurring in
 * over the onset.
 */
export const FOCUS_HUNT_DELAY = 0.12; // s
export const FOCUS_HUNT_ONSET = 0.05; // s

export type StageCard = {
  /** The card's <a> root: pointer events for hover effects. */
  root: HTMLAnchorElement;
  /** The cover frame: the rect the stage draws the cover into. */
  frame: HTMLElement;
  /** The DOM cover image (null when the project has no cover). */
  image: HTMLImageElement | null;
  /** Position in the grid (0-based), for column-aware choreography. */
  index: number;
};

export type StageMode = "pending" | "gl" | "dom";

const cards = new Set<StageCard>();
const cardListeners = new Set<() => void>();

let mode: StageMode = "pending";
const modeListeners = new Set<(mode: StageMode) => void>();

/** Registers a card with the stage; returns the unregister function. */
export function registerStageCard(card: StageCard) {
  cards.add(card);
  for (const listener of cardListeners) listener();
  return () => {
    cards.delete(card);
    for (const listener of cardListeners) listener();
  };
}

/** Every currently mounted card, in registration order. */
export function getStageCards(): StageCard[] {
  return [...cards];
}

export function onStageCardsChange(listener: () => void) {
  cardListeners.add(listener);
  return () => {
    cardListeners.delete(listener);
  };
}

export function getStageMode(): StageMode {
  return mode;
}

export function setStageMode(next: StageMode) {
  if (next === mode) return;
  mode = next;
  for (const listener of modeListeners) listener(mode);
}

/** Subscribes to mode changes (not called for the current value). */
export function onStageModeChange(listener: (mode: StageMode) => void) {
  modeListeners.add(listener);
  return () => {
    modeListeners.delete(listener);
  };
}

/** Resolves with the mode once it is decided ("gl" or "dom"). */
export function waitForStageMode(): Promise<Exclude<StageMode, "pending">> {
  if (mode !== "pending") return Promise.resolve(mode);
  return new Promise((resolve) => {
    const off = onStageModeChange((next) => {
      if (next === "pending") return;
      off();
      resolve(next);
    });
  });
}

/** A new visit: forget the previous visit's decision. */
export function resetStage() {
  setStageMode("pending");
}
