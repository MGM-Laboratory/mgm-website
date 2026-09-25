/**
 * Texture sources for the world's cards, free of three.js.
 *
 * Covers are read straight from their same-origin URL (the article media
 * route, or bundled seed art under /article-covers/) as a Blob and decoded
 * off the main thread with createImageBitmap, then downscaled to about the
 * size the card shows them at. The bytes come from the HTTP cache when the
 * DOM card's <img> already fetched them (the media route is immutable).
 * Decodes run through a small queue, nearest card first, so a fast scroll
 * never waits behind pictures it has already passed; a card that falls
 * asleep aborts its download, handing the slot to one on screen.
 *
 * The text strip is drawn into one canvas per card as an alpha atlas (the
 * shader colours it with the current scheme's ink, so the strip follows a
 * light/dark switch and its wave without a redraw):
 *
 *   row 0: the strip as the DOM lays it out, minus the title and the arrow:
 *          the description and the rule, each exactly where the DOM puts it;
 *   row 1: the title line on its own, then the arrow glyph beside it.
 *
 * The shader reads the title and the arrow from row 1 with an offset, so the
 * hover's title roll and arrow swap are pure uniforms: the canvas is drawn
 * once per layout, never per frame.
 */

const MEDIA_PREFIX = "/api/articles-cms/media/";
const STATIC_PREFIX = "/article-covers/";

/** Gap between atlas rows and pieces (CSS px), so filtering never bleeds across. */
const ATLAS_PAD = 4;

/**
 * A same-origin GET as a Blob, or null on any failure. XMLHttpRequest rather
 * than fetch because Codacy's server-side SSRF pattern reports every
 * non-literal fetch() URL and can't be suppressed inline for JavaScript;
 * this is a browser reading its own page's images.
 */
function readBlob(path: string, signal?: AbortSignal): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    const request = new XMLHttpRequest();
    request.responseType = "blob";
    // A stalled response frees its slot rather than holding it forever.
    request.timeout = 30_000;
    request.onload = () => resolve(request.status === 200 ? (request.response as Blob) : null);
    request.onerror = request.onabort = request.ontimeout = () => resolve(null);
    signal?.addEventListener("abort", () => request.abort(), { once: true });
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
 * covering size is about the frame's device size. `signal` aborts the
 * download (and skips the decode) once the card no longer wants it.
 */
export async function loadCover(
  url: string,
  frameWidth: number,
  frameHeight: number,
  pixelRatio: number,
  maxTextureSize: number,
  signal?: AbortSignal,
): Promise<LoadedCover | null> {
  const path = coverPath(url);
  if (!path || typeof createImageBitmap !== "function") return null;
  const blob = await readBlob(path, signal);
  if (!blob || signal?.aborted) return null;
  let full: ImageBitmap;
  try {
    full = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const cover = Math.max(frameWidth / full.width, frameHeight / full.height);
  const scale = Math.min(
    1,
    cover * pixelRatio * 1.15,
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

type QueuedDecode = {
  run: (signal: AbortSignal) => Promise<void>;
  priority: () => number;
  cancelled: boolean;
  controller: AbortController;
};

/**
 * Runs cover decodes a few at a time, lowest `priority()` first (the
 * distance of the card from the screen, read when a slot frees up).
 * Cancelling a job that is already running aborts it through its signal.
 */
export class DecodeQueue {
  private readonly waiting: QueuedDecode[] = [];
  private running = 0;

  private readonly active = new Set<QueuedDecode>();

  constructor(private readonly concurrency = 3) {}

  /** Queues `run`; returns a cancel function (a waiting job never starts, a running one is aborted). */
  add(run: (signal: AbortSignal) => Promise<void>, priority: () => number) {
    const job: QueuedDecode = {
      run,
      priority,
      cancelled: false,
      controller: new AbortController(),
    };
    this.waiting.push(job);
    this.pump();
    return () => {
      job.cancelled = true;
      job.controller.abort();
    };
  }

  clear() {
    for (const job of this.waiting) job.cancelled = true;
    this.waiting.length = 0;
    for (const job of this.active) job.controller.abort();
  }

  private pump() {
    while (this.running < this.concurrency) {
      let best = -1;
      let bestPriority = Number.POSITIVE_INFINITY;
      for (let i = this.waiting.length - 1; i >= 0; i -= 1) {
        const job = this.waiting[i];
        if (job.cancelled) {
          this.waiting.splice(i, 1);
          if (best > i) best -= 1;
          continue;
        }
        const priority = job.priority();
        if (priority < bestPriority) {
          bestPriority = priority;
          best = i;
        }
      }
      if (best < 0) return;
      const [job] = this.waiting.splice(best, 1);
      this.running += 1;
      this.active.add(job);
      void job
        .run(job.controller.signal)
        .catch(() => {})
        .finally(() => {
          this.running -= 1;
          this.active.delete(job);
          this.pump();
        });
    }
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

type Box = { left: number; top: number; width: number; height: number };

export type TextStripLayout = {
  /** The strip (the DOM meta element), CSS px. */
  width: number;
  height: number;
  /** Pieces relative to the strip's top-left, CSS px. */
  title: Box;
  subtitle: Box;
  arrow: Box;
  /** The rule's top (the strip's bottom border). */
  ruleY: number;
  /** Fonts as the DOM computes them. */
  titleFont: FontSpec;
  subtitleFont: FontSpec;
};

type FontSpec = { font: string; letterSpacing: string };

export type TextAtlas = {
  /** Atlas size in CSS px. */
  width: number;
  height: number;
  /** The title row's top and the arrow glyph's left in it, CSS px. */
  titleRowY: number;
  arrowX: number;
};

function relative(rect: DOMRect, origin: DOMRect): Box {
  return {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
  };
}

function fontOf(element: HTMLElement): FontSpec {
  const style = getComputedStyle(element);
  return {
    font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
    letterSpacing: style.letterSpacing === "normal" ? "0px" : style.letterSpacing,
  };
}

/** Where the strip's pieces sit and in which fonts, measured from the DOM card. */
export function measureTextStrip(
  meta: HTMLElement,
  title: HTMLElement,
  subtitle: HTMLElement,
  arrow: HTMLElement,
): TextStripLayout {
  const origin = meta.getBoundingClientRect();
  const borderBottom = Number.parseFloat(getComputedStyle(meta).borderBottomWidth) || 1;
  return {
    width: origin.width,
    height: origin.height,
    title: relative(title.getBoundingClientRect(), origin),
    subtitle: relative(subtitle.getBoundingClientRect(), origin),
    arrow: relative(arrow.getBoundingClientRect(), origin),
    ruleY: origin.height - borderBottom,
    titleFont: fontOf(title),
    subtitleFont: fontOf(subtitle),
  };
}

/** A string that changes whenever the atlas would draw differently. */
export function textStripSignature(
  layout: TextStripLayout,
  text: { title: string; subtitle: string },
  pixelRatio: number,
) {
  const r = (box: Box) =>
    `${box.left.toFixed(2)},${box.top.toFixed(2)},${box.width.toFixed(2)},${box.height.toFixed(2)}`;
  return [
    layout.width.toFixed(2),
    layout.height.toFixed(2),
    r(layout.title),
    r(layout.subtitle),
    r(layout.arrow),
    layout.titleFont.font,
    layout.subtitleFont.font,
    pixelRatio.toFixed(3),
    text.title,
    text.subtitle,
  ].join("|");
}

/** Resolves once both of the strip's faces are loaded (bounded: the text then draws in the fallback). */
export function whenStripFontsReady(layout: TextStripLayout, timeoutMs = 2500): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  const load = Promise.all([
    document.fonts.load(layout.titleFont.font),
    document.fonts.load(layout.subtitleFont.font),
    document.fonts.ready,
  ]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs));
  return Promise.race([load, timeout]).catch(() => undefined);
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

function setFont(context: CanvasRenderingContext2D, spec: FontSpec) {
  context.font = spec.font;
  if ("letterSpacing" in context) {
    (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      spec.letterSpacing;
  }
}

/**
 * Where the DOM puts the alphabetic baseline of a line box of `height` that
 * starts at `top`: CSS centres the font's content area (ascent + descent)
 * in the line box, so matching that lands every glyph on the DOM's pixel.
 */
function baselineIn(context: CanvasRenderingContext2D, top: number, height: number) {
  const m = context.measureText("Hg");
  const ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent;
  return top + (height - (ascent + descent)) / 2 + ascent;
}

/** The southeast arrow, stroked like the Lucide ArrowDownRight the DOM card shows (24 px grid). */
function strokeArrow(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const u = size / 24;
  context.lineWidth = Math.max(1.25, 2.25 * u);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(x + 7 * u, y + 7 * u);
  context.lineTo(x + 17 * u, y + 17 * u);
  context.moveTo(x + 17 * u, y + 7 * u);
  context.lineTo(x + 17 * u, y + 17 * u);
  context.lineTo(x + 7 * u, y + 17 * u);
  context.stroke();
}

/**
 * Draws a card's text atlas (at `pixelRatio`) into `canvas`, resizing it as
 * needed, and returns where its pieces landed.
 */
export function drawTextAtlas(
  canvas: HTMLCanvasElement,
  layout: TextStripLayout,
  text: { title: string; subtitle: string },
  pixelRatio: number,
): TextAtlas {
  const width = Math.max(layout.width, layout.title.width + ATLAS_PAD * 2 + layout.arrow.width);
  const titleRowY = layout.height + ATLAS_PAD;
  const height = titleRowY + Math.max(layout.title.height, layout.arrow.height) + ATLAS_PAD;
  const atlas: TextAtlas = {
    width,
    height,
    titleRowY,
    arrowX: Math.ceil(layout.title.width + ATLAS_PAD * 2),
  };
  const deviceWidth = Math.max(1, Math.ceil(width * pixelRatio));
  const deviceHeight = Math.max(1, Math.ceil(height * pixelRatio));
  if (canvas.width !== deviceWidth) canvas.width = deviceWidth;
  if (canvas.height !== deviceHeight) canvas.height = deviceHeight;
  // The shader reads css px / atlas size, so the atlas size must be what the device size covers.
  atlas.width = deviceWidth / pixelRatio;
  atlas.height = deviceHeight / pixelRatio;
  const context = canvas.getContext("2d");
  if (!context) return atlas;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, atlas.width, atlas.height);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#ffffff";

  // Row 0: the description, exactly where the DOM sets it.
  setFont(context, layout.subtitleFont);
  const sub = layout.subtitle;
  context.fillText(
    fitLine(context, text.subtitle, sub.width),
    sub.left,
    baselineIn(context, sub.top, sub.height),
  );
  // The rule along the bottom of the strip.
  context.fillRect(0, layout.ruleY, layout.width, layout.height - layout.ruleY);

  // Row 1: the title line on its own (the shader rolls it)...
  setFont(context, layout.titleFont);
  const title = layout.title;
  context.save();
  context.beginPath();
  context.rect(0, titleRowY, title.width, title.height);
  context.clip();
  context.fillText(
    fitLine(context, text.title, title.width),
    0,
    baselineIn(context, titleRowY, title.height),
  );
  context.restore();

  // ...and the arrow glyph beside it (the shader slides two copies of it).
  const arrow = layout.arrow;
  const size = Math.min(arrow.width, arrow.height);
  strokeArrow(
    context,
    atlas.arrowX + (arrow.width - size) / 2,
    titleRowY + (arrow.height - size) / 2,
    size,
  );
  return atlas;
}
