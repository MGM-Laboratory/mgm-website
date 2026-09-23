/**
 * Cover texture preparation for the WebGL stage, kept free of three.js so
 * it can run (and warm up) before the renderer exists.
 *
 * The source is the card's own same-origin DOM <img>: it gates on that
 * image having loaded, then decodes its bytes from the HTTP cache (no
 * second download, no crossOrigin mode switch). Full-size covers would cost 120-160 MB of
 * GPU memory for the live list, so each one is cropped to the region the
 * 3:2 frame actually shows (object-cover, centred) plus a small margin
 * where the source has spare pixels, and downscaled to about its rendered
 * size times the capped DPR before upload.
 */

/** Spare source pixels kept around the visible region (fraction of it). */
const CROP_MARGIN = 0.06;

export type CoverCrop = {
  /** Source image size in pixels. */
  naturalWidth: number;
  naturalHeight: number;
  /** The uploaded region of the source, in source pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export type PreparedCover = {
  source: ImageBitmap | HTMLCanvasElement;
  width: number;
  height: number;
  crop: CoverCrop;
  /** Premultiplied already (ImageBitmap) or to premultiply on upload. */
  premultiplied: boolean;
};

async function whenLoaded(img: HTMLImageElement) {
  if (!img.complete) {
    await new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    });
  }
  if (!img.naturalWidth) return false;
  try {
    await img.decode();
  } catch {
    // Already decoded images can reject decode() in some engines; the
    // natural size check above is the real gate.
  }
  return img.naturalWidth > 0;
}

/**
 * The cover's encoded bytes, for createImageBitmap to decode. Given an
 * <img>, Chromium decodes and resizes the full-size original synchronously
 * on the main thread (tens of ms per large cover, over 100 ms on a slower
 * CPU, landing right as the list reveals); given a Blob it does that work
 * off the main thread. The bytes come from the HTTP cache (the <img> has
 * already loaded them and the media route is immutable), so nothing is
 * downloaded twice. Falls back to the element if the fetch fails.
 */
async function encodedSource(img: HTMLImageElement): Promise<Blob | HTMLImageElement> {
  try {
    // Covers are same-origin (the CMS media proxy or /public); anything
    // else decodes from the element, and the request's host always comes
    // from the page itself, never from the image's URL.
    const { origin, pathname, search } = new URL(img.currentSrc || img.src, window.location.href);
    if (origin !== window.location.origin) return img;
    const response = await fetch(`${window.location.origin}${pathname}${search}`, {
      cache: "force-cache",
    });
    if (response.ok) return await response.blob();
  } catch {
    // Offline, blocked or opaque: decode from the element instead.
  }
  return img;
}

/** The part of the source an object-cover, centred frame shows. */
export function visibleRegion(
  naturalWidth: number,
  naturalHeight: number,
  frameWidth: number,
  frameHeight: number,
) {
  const scale = Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight);
  const w = frameWidth / scale;
  const h = frameHeight / scale;
  return { x: (naturalWidth - w) / 2, y: (naturalHeight - h) / 2, w, h };
}

/**
 * Maps the frame's visible region into the uploaded crop's UV space:
 * [offsetX, offsetY, scaleX, scaleY] with texUv = offset + frameUv * scale.
 */
export function coverUvRect(crop: CoverCrop, frameWidth: number, frameHeight: number) {
  const v = visibleRegion(crop.naturalWidth, crop.naturalHeight, frameWidth, frameHeight);
  return [
    (v.x - crop.sx) / crop.sw,
    (v.y - crop.sy) / crop.sh,
    v.w / crop.sw,
    v.h / crop.sh,
  ] as const;
}

/**
 * Crops and downscales a cover for upload. Resolves null when the image
 * failed to load (the DOM cover then simply stays in charge of that card).
 */
export async function prepareCover(
  img: HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
  pixelRatio: number,
  maxTextureSize: number,
): Promise<PreparedCover | null> {
  if (frameWidth < 1 || frameHeight < 1) return null;
  if (!(await whenLoaded(img))) return null;

  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const v = visibleRegion(naturalWidth, naturalHeight, frameWidth, frameHeight);
  const mx = Math.min(v.x, v.w * CROP_MARGIN);
  const my = Math.min(v.y, v.h * CROP_MARGIN);
  const sx = Math.max(0, Math.floor(v.x - mx));
  const sy = Math.max(0, Math.floor(v.y - my));
  const sw = Math.min(naturalWidth - sx, Math.ceil(v.w + 2 * mx));
  const sh = Math.min(naturalHeight - sy, Math.ceil(v.h + 2 * my));
  const crop: CoverCrop = { naturalWidth, naturalHeight, sx, sy, sw, sh };

  // Never upscale: a small source is uploaded at its own resolution.
  const scale = Math.min(
    1,
    (frameWidth * pixelRatio) / v.w,
    maxTextureSize / sw,
    maxTextureSize / sh,
  );
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  // Preferred path: decode, crop, resize and premultiply off the main
  // thread (see encodedSource).
  if (typeof createImageBitmap === "function") {
    try {
      const source = await createImageBitmap(await encodedSource(img), sx, sy, sw, sh, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
        premultiplyAlpha: "premultiply",
        // A Blob is decoded raw; apply its EXIF orientation so the crop,
        // computed from the element's (oriented) natural size, lines up.
        imageOrientation: "from-image",
      });
      return { source, width, height, crop, premultiplied: true };
    } catch {
      // Older engines reject the options bag; fall through to a canvas.
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  return { source: canvas, width, height, crop, premultiplied: false };
}
