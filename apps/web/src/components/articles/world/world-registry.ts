import type { ArticlesWorldApi, WorldMode } from "@/components/articles/world/world-api";

/**
 * Where the articles pages find the library world. The host (world-host.tsx,
 * mounted by app/articles/layout.tsx) decides the mode once per visit and
 * publishes the engine here once it runs; pages subscribe instead of reading
 * once, because the engine arrives asynchronously (a dynamic import, then
 * the first frame) and a page may mount before or after that.
 *
 * - "pending": undecided yet. Pages render their DOM and wait.
 * - "gl": the WebGL world runs; `getArticlesWorld()` returns it.
 * - "dom": final for the visit (reduced motion, touch without hardware
 *   WebGL2, a software renderer, a failed start or a lost context). Pages
 *   show their DOM cards and play the DOM versions of every effect.
 *
 * The mode is also mirrored on `<html data-articles-world>`, so CSS can hide
 * the DOM pictures the world draws instead (never with opacity on anything
 * GSAP animates: see docs/animation-system.md gotcha #8).
 */

type Listener = (mode: WorldMode, world: ArticlesWorldApi | null) => void;

let mode: WorldMode = "pending";
let world: ArticlesWorldApi | null = null;
const listeners = new Set<Listener>();

export function getWorldMode() {
  return mode;
}

export function getArticlesWorld() {
  return mode === "gl" ? world : null;
}

export function setWorldState(next: WorldMode, instance: ArticlesWorldApi | null) {
  if (mode === next && world === instance) return;
  mode = next;
  world = next === "gl" ? instance : null;
  if (typeof document !== "undefined") {
    if (next === "pending") delete document.documentElement.dataset.articlesWorld;
    else document.documentElement.dataset.articlesWorld = next;
  }
  for (const listener of [...listeners]) listener(mode, world);
}

/** Calls `listener` now and on every change; returns the unsubscribe. */
export function onWorldState(listener: Listener) {
  listeners.add(listener);
  listener(mode, getArticlesWorld());
  return () => {
    listeners.delete(listener);
  };
}

/** Clears the state when the library unmounts (the next visit decides afresh). */
export function resetWorldState() {
  setWorldState("pending", null);
}
