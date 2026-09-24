/**
 * DOM probing for the adaptive header (see `header-tone.ts`): what colour a
 * viewport point behind the glass header or menu panel shows.
 *
 * `document.elementsFromPoint` lists the page elements under a point, top
 * first. The first one that isn't part of the header decides:
 * - an element (or ancestor) with `data-header-tone` wins over everything
 *   under it: `dark`, `light` or any CSS colour. `ignore` makes that
 *   subtree transparent to the probe.
 * - an `<img>` that is loaded and same-origin is read from a tiny cached,
 *   downscaled copy at the matching position (object-fit and
 *   object-position honoured). A `<video>` uses its same-origin poster, or
 *   one cached frame. Cross-origin pictures taint a canvas, so they are
 *   never drawn, and a draw that throws anyway counts as unknown.
 * - hit testing skips `visibility: hidden` and `pointer-events: none`, which
 *   is exactly how the WebGL stages hide the DOM pictures they draw. So the
 *   first element's own hidden or pointer-transparent pictures under the
 *   point are read too.
 * - text: large display type scrolled behind the glass darkens (or
 *   lightens) the blurred backdrop, so the first element's own text colour
 *   counts as a thin layer, thicker for bigger type.
 * - otherwise the stack is walked down, compositing translucent background
 *   colours, to the first opaque one, then the body and html backgrounds.
 *   Canvases fall through to what is under them.
 */

import {
  compositeLayers,
  parseCssColor,
  requestHeaderToneSample,
  type HeaderToneSample,
  type Rgb,
  type Rgba,
} from "@/lib/header-tone";

type PixelGrid = { width: number; height: number; data: Uint8ClampedArray };

/** Longest side of a cached picture: coarse on purpose, like the glass's blur. */
const GRID_SIZE = 48;
const MAX_GRIDS = 64;
/** Descendant pictures looked through when they're hidden from hit testing. */
const MAX_HIDDEN_MEDIA = 16;
const OPAQUE = 0.98;

const grids = new Map<string, PixelGrid | "failed">();
const pendingPosters = new Set<string>();

function isSameOrigin(url: string) {
  if (!url) return false;
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function remember(key: string, value: PixelGrid | "failed") {
  if (grids.size >= MAX_GRIDS) {
    const oldest = grids.keys().next().value;
    if (oldest !== undefined) grids.delete(oldest);
  }
  grids.set(key, value);
}

/** Draws a picture into a fresh tiny canvas (a tainted canvas stays tainted). */
function drawGrid(source: CanvasImageSource, width: number, height: number): PixelGrid | null {
  if (!width || !height) return null;
  const scale = GRID_SIZE / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
  } catch {
    return null;
  }
}

function gridFor(key: string, source: CanvasImageSource, width: number, height: number) {
  const cached = grids.get(key);
  if (cached) return cached === "failed" ? null : cached;
  const grid = drawGrid(source, width, height);
  remember(key, grid ?? "failed");
  return grid;
}

/** A same-origin poster, loaded on first use; the header samples again once it arrives. */
function posterGrid(url: string) {
  const cached = grids.get(url);
  if (cached) return cached === "failed" ? null : { grid: cached };
  if (pendingPosters.has(url)) return null;
  pendingPosters.add(url);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    pendingPosters.delete(url);
    remember(url, drawGrid(image, image.naturalWidth, image.naturalHeight) ?? "failed");
    requestHeaderToneSample();
  };
  image.onerror = () => {
    pendingPosters.delete(url);
    remember(url, "failed");
  };
  image.src = url;
  return null;
}

function parsePosition(token: string | undefined, free: number) {
  if (!token) return free / 2;
  if (token.endsWith("%")) return (Number(token.slice(0, -1)) / 100) * free;
  if (token.endsWith("px")) return Number(token.slice(0, -2));
  if (token === "left" || token === "top") return 0;
  if (token === "right" || token === "bottom") return free;
  return free / 2;
}

/**
 * Where viewport point (x, y) lands on a picture of natural size
 * `naturalW` x `naturalH` drawn in `rect` with the element's object-fit,
 * as 0..1 coordinates, or null when it lands outside the drawn picture.
 */
function pictureCoordinates(
  element: Element,
  rect: DOMRect,
  naturalW: number,
  naturalH: number,
  x: number,
  y: number,
) {
  if (!rect.width || !rect.height || !naturalW || !naturalH) return null;
  const style = getComputedStyle(element);
  const fit = style.objectFit || "fill";
  let drawW = rect.width;
  let drawH = rect.height;
  if (fit !== "fill") {
    const cover = Math.max(rect.width / naturalW, rect.height / naturalH);
    const contain = Math.min(rect.width / naturalW, rect.height / naturalH);
    const scale =
      fit === "cover"
        ? cover
        : fit === "none"
          ? 1
          : fit === "scale-down"
            ? Math.min(1, contain)
            : contain;
    drawW = naturalW * scale;
    drawH = naturalH * scale;
  }
  const [posX, posY] = (style.objectPosition || "50% 50%").split(/\s+/);
  const left = rect.left + parsePosition(posX, rect.width - drawW);
  const top = rect.top + parsePosition(posY, rect.height - drawH);
  const u = (x - left) / drawW;
  const v = (y - top) / drawH;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  return { u, v };
}

function readGrid(grid: PixelGrid, u: number, v: number): Rgba {
  const px = Math.min(grid.width - 1, Math.floor(u * grid.width));
  const py = Math.min(grid.height - 1, Math.floor(v * grid.height));
  const i = (py * grid.width + px) * 4;
  return { rgb: [grid.data[i], grid.data[i + 1], grid.data[i + 2]], alpha: grid.data[i + 3] / 255 };
}

/** The colour a loaded, same-origin `<img>` shows at a viewport point (null: unknown). */
export function sampleImageAt(image: HTMLImageElement, x: number, y: number): Rgba | null {
  if (!image.complete || !image.naturalWidth) return null;
  const url = image.currentSrc || image.src;
  if (!isSameOrigin(url) && !image.crossOrigin) return null;
  const at = pictureCoordinates(
    image,
    image.getBoundingClientRect(),
    image.naturalWidth,
    image.naturalHeight,
    x,
    y,
  );
  if (!at) return { rgb: [0, 0, 0], alpha: 0 };
  const grid = gridFor(url, image, image.naturalWidth, image.naturalHeight);
  return grid ? readGrid(grid, at.u, at.v) : null;
}

/** A `<video>`: its same-origin poster, else one cached frame (null: unknown). */
export function sampleVideoAt(video: HTMLVideoElement, x: number, y: number): Rgba | null {
  const rect = video.getBoundingClientRect();
  if (video.poster && isSameOrigin(video.poster)) {
    const poster = posterGrid(video.poster);
    if (!poster) return null;
    const { grid } = poster;
    // The grid keeps the poster's aspect, which is all the fit maths needs.
    const at = pictureCoordinates(video, rect, grid.width, grid.height, x, y);
    return at ? readGrid(grid, at.u, at.v) : { rgb: [0, 0, 0], alpha: 0 };
  }
  const url = video.currentSrc || video.src;
  if (!isSameOrigin(url) || video.readyState < 2 || !video.videoWidth) return null;
  const at = pictureCoordinates(video, rect, video.videoWidth, video.videoHeight, x, y);
  if (!at) return { rgb: [0, 0, 0], alpha: 0 };
  const grid = gridFor(`${url}#frame`, video, video.videoWidth, video.videoHeight);
  return grid ? readGrid(grid, at.u, at.v) : null;
}

function contains(rect: DOMRect, x: number, y: number) {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

/** Pictures inside `element` under the point that hit testing can't see. */
function hiddenMediaAt(element: Element, x: number, y: number): Rgba | null {
  if (element === document.body || element === document.documentElement) return null;
  // A card or a frame, not a page-sized wrapper (whose subtree is too big
  // to search on every sample, and whose pictures would be hit directly).
  const box = element.getBoundingClientRect();
  if (box.width * box.height > window.innerWidth * window.innerHeight * 1.2) return null;
  const media = element.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video");
  if (!media.length || media.length > MAX_HIDDEN_MEDIA) return null;
  for (let index = media.length - 1; index >= 0; index -= 1) {
    const item = media[index];
    if (!contains(item.getBoundingClientRect(), x, y)) continue;
    // A see-through copy (a blur layer, a crossfade's outgoing picture).
    if (Number(getComputedStyle(item).opacity) < 0.5) continue;
    const sample =
      item instanceof HTMLImageElement ? sampleImageAt(item, x, y) : sampleVideoAt(item, x, y);
    if (sample && sample.alpha > 0) return sample;
  }
  return null;
}

function hasOwnText(element: Element) {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  }
  return false;
}

/** The first element's own text as a thin layer: about 7% ink for body copy, up to 40% for display type. */
function textLayer(element: Element, style: CSSStyleDeclaration): Rgba | null {
  if (!hasOwnText(element)) return null;
  const color = parseCssColor(style.color);
  if (!color || color.alpha <= 0) return null;
  const size = Number.parseFloat(style.fontSize) || 16;
  const coverage = Math.min(0.4, Math.max(0.06, 0.06 + (size - 14) * 0.0045));
  return { rgb: color.rgb, alpha: coverage * color.alpha };
}

const TONE_HINTS: Record<string, Rgb> = {
  dark: [21, 24, 30],
  light: [247, 247, 245],
};

function hintColor(value: string): Rgb | null {
  const named = TONE_HINTS[value.trim()];
  if (named) return named;
  const parsed = parseCssColor(value);
  return parsed && parsed.alpha > 0 ? parsed.rgb : null;
}

/** The page's own backdrop: the body's background, else html's, else white. */
export function pageBaseColor(): Rgb {
  for (const element of [document.body, document.documentElement]) {
    if (!element) continue;
    const parsed = parseCssColor(getComputedStyle(element).backgroundColor);
    if (parsed && parsed.alpha >= OPAQUE) return parsed.rgb;
  }
  return [255, 255, 255];
}

/**
 * What the page shows at viewport point (x, y), ignoring every element
 * `skip` accepts (the header and the menu themselves).
 */
export function probePoint(
  x: number,
  y: number,
  skip: (element: Element) => boolean,
  base: Rgb,
): HeaderToneSample {
  const stack = document.elementsFromPoint(x, y);
  const layers: Rgba[] = [];
  let media = false;
  let first = true;
  for (const element of stack) {
    if (skip(element)) continue;
    const hint = element.closest<HTMLElement>("[data-header-tone]")?.dataset.headerTone;
    if (hint === "ignore") continue;
    if (hint) {
      const color = hintColor(hint);
      if (color) return { color: compositeLayers(color, layers), media };
    }
    if (element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
      const sample =
        element instanceof HTMLImageElement
          ? sampleImageAt(element, x, y)
          : sampleVideoAt(element, x, y);
      first = false;
      if (!sample || sample.alpha <= 0) continue;
      media = true;
      layers.push(sample);
      if (sample.alpha >= OPAQUE) break;
      continue;
    }
    if (element instanceof HTMLCanvasElement || element instanceof SVGElement) {
      first = false;
      continue;
    }
    const style = getComputedStyle(element);
    if (first) {
      first = false;
      const text = textLayer(element, style);
      if (text) layers.push(text);
      const hidden = hiddenMediaAt(element, x, y);
      if (hidden) {
        media = true;
        layers.push(hidden);
        if (hidden.alpha >= OPAQUE) break;
      }
    }
    const background = parseCssColor(style.backgroundColor);
    if (background && background.alpha > 0.01) {
      layers.push(background);
      if (background.alpha >= OPAQUE) break;
    }
  }
  return { color: compositeLayers(base, layers), media };
}
