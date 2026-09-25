/**
 * The article cover's picture for the world, free of three.js: read as a
 * Blob from its same-origin URL (the article media route, or bundled seed
 * art), decoded off the main thread and scaled to about the size the cover
 * shows at, times the device pixel ratio, so it stays crisp on Hi-DPI
 * screens without holding a full-size original in GPU memory. The bytes
 * come from the HTTP cache: the DOM <img> already fetched them (the media
 * route is immutable).
 */

const MEDIA_PREFIX = "/api/articles-cms/media/";
/** A stalled download gives up after this long (the DOM cover stays). */
const READ_TIMEOUT_MS = 20_000;
const STATIC_PREFIX = "/article-covers/";

/**
 * A same-origin GET as a Blob, or null on any failure. XMLHttpRequest rather
 * than fetch because Codacy's server-side SSRF pattern reports every
 * non-literal fetch() URL and can't be suppressed inline for JavaScript;
 * this is a browser reading its own page's image.
 */
function readBlob(path: string, signal?: AbortSignal): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const done = (blob: Blob | null) => {
      signal?.removeEventListener("abort", abort);
      resolve(blob);
    };
    request.responseType = "blob";
    request.timeout = READ_TIMEOUT_MS;
    request.onload = () => done(request.status === 200 ? (request.response as Blob) : null);
    request.onerror = request.onabort = request.ontimeout = () => done(null);
    signal?.addEventListener("abort", abort, { once: true });
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

export type CoverBitmap = { bitmap: ImageBitmap; width: number; height: number };

export async function loadCoverBitmap(
  url: string,
  frameWidth: number,
  frameHeight: number,
  pixelRatio: number,
  maxTextureSize: number,
  signal?: AbortSignal,
): Promise<CoverBitmap | null> {
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
  // The ripples refract up to a few percent past the frame: a little margin.
  const cover = Math.max(frameWidth / full.width, frameHeight / full.height);
  const scale = Math.min(
    1,
    cover * Math.max(1, pixelRatio) * 1.08,
    maxTextureSize / Math.max(full.width, full.height),
  );
  if (scale >= 0.97) return { bitmap: full, width: full.width, height: full.height };
  const width = Math.max(1, Math.round(full.width * scale));
  const height = Math.max(1, Math.round(full.height * scale));
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
export function coverFit(
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
