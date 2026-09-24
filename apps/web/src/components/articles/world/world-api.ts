/**
 * The library world's public contract: what the articles pages, the
 * transitions and the header may ask of the WebGL engine. Types only, so
 * every page can import it without pulling three.js into its chunk (the
 * engine itself is a dynamic import from world-host.tsx).
 *
 * Coordinates are CSS pixels in the viewport (0,0 at the top-left), the
 * same space DOM rects use. The engine maps them to its scene, where one
 * world unit is one CSS pixel on the z = 0 plane.
 */

import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";

import type { WorldUniforms } from "@/components/articles/world/world-glsl";
import type { ProjectPalette } from "@/lib/project-themes";

export type WorldMode = "pending" | "gl" | "dom";

/** Which page the world is dressing: the list or an article. */
export type WorldRoute = { kind: "list" } | { kind: "detail"; slug: string };

export type QualityTier = "high" | "medium" | "low";

/** One article card the list hands to the world (its DOM frames drive the quads). */
export type WorldCard = {
  slug: string;
  /** The card's `<a>`. */
  element: HTMLElement;
  /** The 5:2 cover frame: the picture plane's rest rect. */
  cover: HTMLElement;
  /** The text strip under the cover (title, description, arrow, rule): the text plane's rest rect. */
  meta: HTMLElement;
  /** Title, description and arrow inside the strip, measured to draw the text texture. */
  titleElement: HTMLElement;
  subtitleElement: HTMLElement;
  arrowElement: HTMLElement;
  coverUrl?: string;
  title: string;
  subtitle: string;
  /** Order in the list (0-based), for staggers. */
  index: number;
};

export type CardsLayerApi = {
  /** Adds or refreshes a card; returns the remove function. */
  register(card: WorldCard): () => void;
  /** Pointer enters or leaves a card (hover), or keyboard focus does. */
  setHovered(slug: string | null, source: "pointer" | "focus"): void;
  /** Re-measure every card's DOM offsets (after layout changes). */
  measure(): void;
  /** Plays the filter swap: cards leaving sink into the fog, new ones rise. */
  playFilterOut(): Promise<void>;
  playFilterIn(): void;
  /** The list intro: cards unroll out of the fog, row by row. */
  playIntro(): void;
  /**
   * Keeps every card drawing where it last was, even after its DOM goes
   * (the list unmounts mid-transition while the world still pans it away).
   * Unregistered cards are released when the last hold is dropped.
   */
  hold(): () => void;
  /** The card's current on-screen rect (CSS px), if the world draws it. */
  rectOf(slug: string): DOMRect | null;
};

export type WorldTransitionApi = {
  /**
   * Pans the whole list scene horizontally (CSS px at the card plane,
   * positive moves the view right so the cards travel left).
   */
  setPan(px: number): void;
  /** The screen wipe to a flat colour: 0 none, 1 covered. From the right edge leftward. */
  setWipe(progress: number, color: string): void;
  /** The list's lens effects (aberration, barrel, vignette): 1 full, 0 grain only. */
  setLensAmount(amount: number): void;
  /** Extra fog pushed toward the camera (0 none, 1 everything swallowed). */
  setFogSwallow(amount: number): void;
  /** Hides the cards layer (and its interaction) without disposing it. */
  setCardsVisible(visible: boolean): void;
  /** Vertical camera offset (CSS px, positive raises the camera so the scene sinks). */
  setLift(px: number): void;
  /** Camera dolly (CSS px, negative moves toward the card plane). */
  setDolly(px: number): void;
};

/** What every world layer gets each frame (after the smooth scroller has moved the page). */
export type WorldFrame = {
  /** Seconds since the world started, and since the last frame (clamped). */
  time: number;
  dt: number;
  scrollY: number;
  /** Smoothed scroll speed, CSS px per second (signed, jumps filtered out). */
  scrollSpeed: number;
  width: number;
  height: number;
  pixelRatio: number;
  /** The pointer in viewport CSS px (null when it is away or on touch), and its speed in px/s. */
  pointer: { x: number; y: number } | null;
  pointerSpeed: number;
  /** True while the page is scrolling (for effects that should wait for stillness). */
  scrolling: boolean;
};

/**
 * A piece of the scene a page or a feature adds to the world (the article
 * cover, the Home button, particle systems). Its module is dynamic-imported
 * by whoever adds it, so three.js stays in the articles chunks.
 */
export type WorldLayer = {
  update(frame: WorldFrame): void;
  dispose(): void;
};

/** The engine's three.js objects, for layers. */
export type WorldGL = {
  scene: Scene;
  /** Drawn after the scene pass, over the composite (no lens, no fog): UI-like 3D. */
  overlay: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  uniforms: WorldUniforms;
};

export type WorldFxApi = {
  /** The first-visit lens settle: a strongly warped, fringed frame that relaxes into place. */
  settleLens(seconds?: number): void;
  /** Scales the scroll motion blur (1 default, 0 off). */
  setBlurAmount(amount: number): void;
  /** A burst of light or ink at a viewport point (clicks, arrivals). */
  pulse(x: number, y: number, strength?: number): void;
};

export type ArticlesWorldApi = {
  readonly canvas: HTMLCanvasElement;
  readonly tier: QualityTier;
  readonly cards: CardsLayerApi;
  readonly transition: WorldTransitionApi;
  readonly fx: WorldFxApi;
  readonly gl: WorldGL;
  /** Adds a layer, updated every frame in `order` (lower first); returns the remove function. */
  addLayer(layer: WorldLayer, order?: number): () => void;
  /** The frame the layers last saw. */
  frameInfo(): WorldFrame;
  setRoute(route: WorldRoute): void;
  /**
   * Follows the site scheme. With `wave`, the change spreads from that
   * viewport point across the whole world instead of switching at once.
   */
  setScheme(dark: boolean, options?: { wave?: { x: number; y: number } }): void;
  /** Tints the world toward an article theme (null returns to the library's own palette). */
  setTheme(theme: { light: ProjectPalette; dark: ProjectPalette } | null, seconds?: number): void;
  /** The colour the world paints behind a viewport point, for the adaptive header. */
  colorAt(x: number, y: number): [number, number, number];
  /** Stops rendering (hidden tab); resume() picks up where it left. */
  pause(): void;
  resume(): void;
  dispose(): void;
};
