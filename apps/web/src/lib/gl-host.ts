import type { OrthographicCamera, Scene, Texture, WebGLRenderer } from "three";

/**
 * The contract between the site's cursor-flow stage (the fixed WebGL canvas
 * behind the page that draws the background and the cursor's paint
 * distortion) and anything that wants to draw INTO it, so its pixels are
 * smeared by the cursor too: the homepage reel's video and its ribbon line.
 *
 * Only types and a tiny registry live here, so importing this module never
 * pulls three.js into a page's first chunk.
 *
 * Space: world units are CSS pixels. The camera spans the viewport with x
 * running right from its left edge and y running UP from its top edge, so a
 * DOM rect `{ x, y, width, height }` from getBoundingClientRect() maps to a
 * plane centred at `(x + width / 2, -(y + height / 2))`.
 */

export type GlFrame = {
  /** Seconds since the host started. */
  time: number;
  /** Seconds since the previous frame, clamped to 1/20. */
  dt: number;
};

export interface GlHost {
  readonly renderer: WebGLRenderer;
  /** Drawn before the distortion pass: everything here is smeared by the cursor. */
  readonly scene: Scene;
  /** Orthographic, CSS-pixel space (see above). */
  readonly camera: OrthographicCamera;
  /**
   * The cursor paint field, or null when the host runs without it: RG is a
   * velocity around 0.5, B and A are two decaying weights (see
   * docs/animation-system.md, cursor flow). Sample it in screen UV.
   */
  readonly paintTexture: Texture | null;
  /** Viewport size in CSS px and the drawing buffer's pixel ratio. */
  readonly size: Readonly<{ width: number; height: number; dpr: number }>;
  /**
   * Called every frame, after the page's scroll has moved the DOM and before
   * the host renders, so rects read here match what is on screen. Returns
   * the unsubscribe.
   */
  onFrame(listener: (frame: GlFrame) => void): () => void;
  /**
   * The host may stop drawing when nothing changes. A layer that animates
   * (a playing video) holds frames on by `owner` until it is still again.
   */
  requestFrames(owner: string, active: boolean): void;
}

type HostListener = (host: GlHost | null) => void;

let current: GlHost | null = null;
const listeners = new Set<HostListener>();

/** The stage registers itself when it is up, and null when it goes away. */
export function setGlHost(host: GlHost | null) {
  if (current === host) return;
  current = host;
  for (const listener of [...listeners]) listener(host);
}

/** The live host, or null (no WebGL, reduced motion, not started yet). */
export function getGlHost() {
  return current;
}

/** Calls `listener` now and whenever the host appears or goes away. */
export function onGlHost(listener: HostListener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
