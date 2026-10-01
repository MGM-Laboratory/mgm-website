import { MathUtils, Vector3, type Box3, type PerspectiveCamera } from "three";

import type { StoryDom, StoryDomAnchor, StoryRect, StorySize } from "@/components/story/engine/act";

/**
 * DOM glue: the story section's anchor elements, their rects measured once
 * per frame (after the smooth scroller moved the page, gotcha #30), and the
 * maths that puts a GL object exactly over a DOM box, or a DOM control over
 * a GL object. Every rect an act sees is in canvas CSS px (the canvas's top
 * left is 0, 0), whichever way the canvas sits this frame.
 */

const SELECTORS: ReadonlyMap<StoryDomAnchor, string> = new Map([
  ["section", "[data-story-section]"],
  ["intro", "[data-story-intro]"],
  ["title", "[data-story-title]"],
  ["description", "[data-story-description]"],
  ["box", "[data-story-box]"],
  ["finale", "[data-story-finale]"],
]);

export function measure(element: Element): StoryRect {
  const r = element.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/** `rect` in the frame of `origin` (both in viewport px). */
export function relativeTo(rect: StoryRect, origin: StoryRect): StoryRect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
}

export class StoryDomImpl implements StoryDom {
  readonly section: HTMLElement;
  canvasRect: StoryRect = { x: 0, y: 0, width: 1, height: 1 };
  private readonly elements = new Map<StoryDomAnchor, HTMLElement | null>();
  private readonly rects = new Map<StoryDomAnchor, StoryRect | null>();

  constructor(section: HTMLElement) {
    this.section = section;
    for (const [anchor, selector] of SELECTORS) {
      const found = anchor === "section" ? section : section.querySelector<HTMLElement>(selector);
      this.elements.set(anchor, found);
    }
  }

  element(anchor: StoryDomAnchor) {
    return this.elements.get(anchor) ?? null;
  }

  /** The anchor's rect in the viewport this frame (measured at most once a frame). */
  viewportRect(anchor: StoryDomAnchor): StoryRect | null {
    if (this.rects.has(anchor)) return this.rects.get(anchor) ?? null;
    const element = this.element(anchor);
    const rect = element?.isConnected ? measure(element) : null;
    this.rects.set(anchor, rect);
    return rect;
  }

  rect(anchor: StoryDomAnchor): StoryRect | null {
    const rect = this.viewportRect(anchor);
    return rect ? relativeTo(rect, this.canvasRect) : null;
  }

  /** A new frame: rects are measured again on first use. */
  beginFrame() {
    this.rects.clear();
  }

  /** The canvas's place in the viewport this frame (set by the stage's placement). */
  setCanvasRect(rect: StoryRect) {
    this.canvasRect = rect;
  }
}

/**
 * Puts a camera-facing plane `worldWidth` wide exactly over `rect` (canvas
 * px): writes the world position of the plane's centre into `out` and
 * returns its distance along the view axis. The plane must stay square to
 * the view (its normal along the camera's -z). With the camera's matrices
 * current, the plane's projected rect equals `rect` in width and centre;
 * its height follows its own aspect.
 */
export function planeToRect(
  camera: PerspectiveCamera,
  rect: StoryRect,
  size: StorySize,
  worldWidth: number,
  out: Vector3,
): number {
  const tanHalf = Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const width = Math.max(1e-3, rect.width);
  const depth = (worldWidth * size.height) / (2 * tanHalf * width);
  const cx = ((rect.x + rect.width / 2) / size.width) * 2 - 1;
  const cy = 1 - ((rect.y + rect.height / 2) / size.height) * 2;
  out.set(cx * depth * tanHalf * camera.aspect, cy * depth * tanHalf, -depth);
  out.applyMatrix4(camera.matrixWorld);
  return depth;
}

/** World units per canvas CSS px at `depth` along the view axis. */
export function worldPerPixel(camera: PerspectiveCamera, depth: number, size: StorySize) {
  const tanHalf = Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  return (2 * depth * tanHalf) / size.height;
}

const scratch = new Vector3();

/** Canvas px of a world point; false when it is behind the camera. */
export function projectPoint(
  point: Vector3,
  camera: PerspectiveCamera,
  size: StorySize,
  out: { x: number; y: number },
): boolean {
  scratch.copy(point).project(camera);
  out.x = (scratch.x * 0.5 + 0.5) * size.width;
  out.y = (0.5 - scratch.y * 0.5) * size.height;
  return scratch.z < 1;
}

/** Canvas px bounds of a world box (its eight corners), or null when it is behind the camera. */
export function projectBox(
  box: Box3,
  camera: PerspectiveCamera,
  size: StorySize,
): StoryRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const p = { x: 0, y: 0 };
  for (let i = 0; i < 8; i += 1) {
    scratch.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    );
    if (!projectPoint(scratch, camera, size, p)) return null;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
