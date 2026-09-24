import type { ProjectPalette } from "@/lib/project-themes";

/**
 * The contract between the project detail page (layout, scrolling, DOM
 * media, `project-detail.tsx`) and its WebGL stage (`detail-stage.ts`),
 * which draws the page's media on one fixed canvas in the horizontal
 * (desktop) layout, the way lusion.co's project pages do.
 *
 * The page owns layout and playback: it lays out one placeholder element
 * per media section in the horizontal track, moves the track with the
 * scroll, and plays or pauses each <video>. The stage only draws: it reads
 * each placeholder's rect when asked to measure, reads the frame state once
 * per frame in the frame loop's "render" phase
 * (`components/projects/stage/frame-loop.ts`), and reports which items it
 * draws so the page can hide their DOM media (visibility, never opacity).
 */

export type DetailStageItem = {
  id: string;
  kind: "image" | "video";
  /** Full-height, edge-to-edge section: no rounded mask, emerge mask pinned open. */
  fullscreen: boolean;
  /** The layout placeholder. Its rect at scroll 0 is the item's rect on the track. */
  element: HTMLElement;
  /** Image URL (same-origin CMS media route or a /public path). For videos, the poster if any. */
  src?: string;
  /** Videos: the page's own <video> (muted, looping, playsInline). The stage uses it as
   *  a texture source only and never plays or pauses it. */
  video?: HTMLVideoElement;
};

export type DetailFrameState = {
  /** Horizontal travel in CSS px: the track sits at translateX(-scroll). */
  scroll: number;
  /** Signed change of `scroll` this frame, in viewport widths (drives the speed wave). */
  scrollDelta: number;
  viewportWidth: number;
  viewportHeight: number;
  /** 0 to 1: how visible the media are (page entrance, next-project hand-off). */
  itemsOpacity: number;
};

export type DetailStageHandle = {
  /** Re-reads every placeholder rect (after a resize or any layout change). */
  measure(): void;
  /** Crossfades the stage's colours (placeholder tint) to a new palette. */
  setPalette(palette: ProjectPalette): void;
  /** Stops drawing items the page removed (their media failed to load), leaving
   *  every other item exactly as it is. Call measure() afterwards. */
  remove(ids: string[]): void;
  /** Frees every GPU resource and removes the canvas. */
  dispose(): void;
};

export type DetailStageOptions = {
  /** Fixed, full-viewport layer the canvas is appended to (behind the DOM text). */
  container: HTMLElement;
  items: DetailStageItem[];
  palette: ProjectPalette;
  /** Called once per frame, in the frame loop's render phase. */
  getFrame(): DetailFrameState;
  /** The stage started (true) or stopped (false) drawing an item. */
  onOwnershipChange(id: string, owned: boolean): void;
  /** The WebGL context was lost or failed: the page falls back to DOM media. */
  onFailure(): void;
};

/** Resolves to null when WebGL2 isn't available (the page keeps DOM media). */
export type StartDetailStage = (options: DetailStageOptions) => Promise<DetailStageHandle | null>;
