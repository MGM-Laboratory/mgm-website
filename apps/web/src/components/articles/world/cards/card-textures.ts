/**
 * Texture sources for the world's cards, free of three.js.
 *
 * Covers are read straight from their same-origin URL (the article media
 * route, or bundled seed art under /article-covers/) as a Blob and decoded
 * off the main thread with createImageBitmap, then downscaled to about the
 * size the card shows them at. The bytes come from the HTTP cache when the
 * DOM card's <img> already fetched them (the media route is immutable).
 *
 * The text strip is drawn into a canvas per card as a channel-coded mask:
 * red for the title, green for the description, blue for the arrow and the
 * rule. The shader colours each channel with the current scheme's ink, so
 * the strip follows a light/dark switch (and its wave) without a redraw.
 */

const MEDIA_PREFIX = "/api/articles-cms/media/";
const STATIC_PREFIX = "/article-covers/";

/**
 * A same-origin GET as a Blob, or null on any failure. XMLHttpRequest rather
 * than fetch because Codacy's server-side SSRF pattern reports every
 * non-literal fetch() URL and can't be suppressed inline for JavaScript;
 * this is a browser reading its own page's images.
 */
function readBlob(path: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.responseType = "blob";
    request.onload = () => resolve(request.status === 200 ? (request.response as Blob) : null);
    request.onerror = request.onabort = () => resolve(null);
    request.open("GET", path);
    request.send();
  });
}

/** The cover's path under one of the two literal prefixes, or null for anything else. */
function coverPath(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return null;
  }
  if (parsed.origin !== window.location.origin) return null;
  const { pathname } = parsed;
  if (pathname.startsWith(MEDIA_PREFIX)) {
    const key = pathname.slice(MEDIA_PREFIX.length);
    if (!key || key.includes("/")) return null;
    return `${MEDIA_PREFIX}${encodeURIComponent(decodeURIComponent(key))}`;
  }
  if (pathname.startsWith(STATIC_PREFIX)) {
    const file = pathname.slice(STATIC_PREFIX.length);
    if (!/^[\w.-]+$/.test(file)) return null;
    return `${STATIC_PREFIX}${file}`;
  }
  return null;
}

export type LoadedCover = {
  bitmap: ImageBitmap;
  /** The decoded bitmap's size (after downscaling). */
  width: number;
  height: number;
};

/**
 * Decodes a cover for a frame of `frameWidth` x `frameHeight` CSS px at
 * `pixelRatio`. Keeps the whole picture (the shader crops it to cover the
 * frame, and the hover zoom needs no extra pixels), downscaled so its
 * covering size is about the frame's device size.
 */
export async function loadCover(
  url: string,
  frameWidth: number,
  frameHeight: number,
  pixelRatio: number,
  maxTextureSize: number,
): Promise<LoadedCover | null> {
  const path = coverPath(url);
  if (!path || typeof createImageBitmap !== "function") return null;
  const blob = await readBlob(path);
  if (!blob) return null;
  let full: ImageBitmap;
  try {
    full = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const cover = Math.max(frameWidth / full.width, frameHeight / full.height);
  const scale = Math.min(
    1,
    cover * pixelRatio * 1.12,
    maxTextureSize / Math.max(full.width, full.height),
  );
  const width = Math.max(1, Math.round(full.width * scale));
  const height = Math.max(1, Math.round(full.height * scale));
  if (scale >= 0.98) return { bitmap: full, width: full.width, height: full.height };
  try {
    const bitmap = await createImageBitmap(full, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high",
    });
    full.close();
    return { bitmap, width, height };
  } catch {
    return { bitmap: full, width: full.width, height: full.height };
  }
}

/** Texture uv rect (offset, scale) that makes a picture cover a frame, centred. */
export function coverUv(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
) {
  const imageRatio = imageWidth / imageHeight;
  const frameRatio = frameWidth / frameHeight;
  if (imageRatio > frameRatio) {
    const scale = frameRatio / imageRatio;
    return [(1 - scale) / 2, 0, scale, 1] as const;
  }
  const scale = imageRatio / frameRatio;
  return [0, (1 - scale) / 2, 1, scale] as const;
}

export type TextStripLayout = {
  width: number;
  height: number;
  title: DOMRect;
  subtitle: DOMRect;
  arrow: DOMRect;
};

function relative(rect: DOMRect, origin: DOMRect) {
  return new DOMRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
}

/** Where the strip's pieces sit, measured from the DOM card. */
export function measureTextStrip(
  meta: HTMLElement,
  title: HTMLElement,
  subtitle: HTMLElement,
  arrow: HTMLElement,
): TextStripLayout {
  const origin = meta.getBoundingClientRect();
  return {
    width: origin.width,
    height: origin.height,
    title: relative(title.getBoundingClientRect(), origin),
    subtitle: relative(subtitle.getBoundingClientRect(), origin),
    arrow: relative(arrow.getBoundingClientRect(), origin),
  };
}

function fontOf(element: HTMLElement) {
  const style = getComputedStyle(element);
  return {
    font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
    size: Number.parseFloat(style.fontSize) || 16,
    letterSpacing: style.letterSpacing,
  };
}

/** `text` cut to fit `width` with an ellipsis, measured in the context's font. */
function fitLine(context: CanvasRenderingContext2D, text: string, width: number) {
  if (context.measureText(text).width <= width) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (context.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= width) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

/**
 * Draws a card's text strip (at `pixelRatio`) into `canvas`, resizing it as
 * needed. `titleShift` rolls the title upward by that fraction of its line
 * (0..1) with a fresh copy rising from below, for the hover animation.
 */
export function drawTextStrip(
  canvas: HTMLCanvasElement,
  layout: TextStripLayout,
  elements: { title: HTMLElement; subtitle: HTMLElement },
  text: { title: string; subtitle: string },
  pixelRatio: number,
  titleShift = 0,
) {
  const width = Math.max(1, Math.round(layout.width * pixelRatio));
  const height = Math.max(1, Math.round(layout.height * pixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, layout.width, layout.height);
  context.textBaseline = "middle";
  context.textAlign = "left";

  const title = fontOf(elements.title);
  context.font = title.font;
  if ("letterSpacing" in context) {
    (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      title.letterSpacing === "normal" ? "0px" : title.letterSpacing;
  }
  const titleLine = fitLine(context, text.title, layout.title.width);
  const titleY = layout.title.top + layout.title.height / 2;
  context.save();
  context.beginPath();
  context.rect(
    layout.title.left - 2,
    layout.title.top,
    layout.title.width + 4,
    layout.title.height,
  );
  context.clip();
  context.fillStyle = "#ff0000";
  const lift = titleShift * layout.title.height;
  context.fillText(titleLine, layout.title.left, titleY - lift);
  if (titleShift > 0)
    context.fillText(titleLine, layout.title.left, titleY - lift + layout.title.height);
  context.restore();

  const subtitle = fontOf(elements.subtitle);
  context.font = subtitle.font;
  if ("letterSpacing" in context) {
    (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      subtitle.letterSpacing === "normal" ? "0px" : subtitle.letterSpacing;
  }
  context.fillStyle = "#00ff00";
  context.fillText(
    fitLine(context, text.subtitle, layout.subtitle.width),
    layout.subtitle.left,
    layout.subtitle.top + layout.subtitle.height / 2,
  );

  // The southeast arrow, stroked like the Lucide icon the DOM card shows.
  const a = layout.arrow;
  const s = Math.min(a.width, a.height);
  const x0 = a.left + (a.width - s) / 2;
  const y0 = a.top + (a.height - s) / 2;
  context.strokeStyle = "#0000ff";
  context.lineWidth = Math.max(1.5, s * 0.094);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(x0 + s * 0.29, y0 + s * 0.29);
  context.lineTo(x0 + s * 0.71, y0 + s * 0.71);
  context.moveTo(x0 + s * 0.71, y0 + s * 0.29);
  context.lineTo(x0 + s * 0.71, y0 + s * 0.71);
  context.lineTo(x0 + s * 0.29, y0 + s * 0.71);
  context.stroke();

  // The rule along the bottom of the strip.
  context.fillStyle = "#0000ff";
  context.fillRect(0, layout.height - 1, layout.width, 1);
  return subtitle.size;
}
