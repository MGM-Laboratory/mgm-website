/**
 * Browser-side file handling for the project editor's media sections:
 * preparing images for the JSON upload route, probing videos for their size,
 * duration and a poster frame, measuring already-uploaded files, and
 * uploading with progress.
 */

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const MEDIA_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");

/** Detail page sections can use screens up to 4K on the long edge. */
export const IMAGE_MAX_EDGE = 3840;
/**
 * The API refuses image bodies over 6 MB, and its JSON parser stops at 8 MB,
 * which a base64 data URL of a little under 6 MB already reaches. Staying at
 * 5.5 MB keeps every upload clear of both.
 */
export const IMAGE_UPLOAD_MAX_BYTES = Math.floor(5.5 * 1024 * 1024);

export type MediaFileKind = "image" | "video";

export function mediaKindOf(file: File): MediaFileKind | undefined {
  if ((IMAGE_TYPES as readonly string[]).includes(file.type)) return "image";
  if ((VIDEO_TYPES as readonly string[]).includes(file.type)) return "video";
  return undefined;
}

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("This file could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("This image could not be prepared."));
    element.src = source;
  });
}

/** Decoded byte length of a base64 data URL. */
function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Draws `source` into a canvas no larger than `maxDimension` and encodes it (JPEG, or WebP to keep transparency). */
function encodeImage(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxDimension: number,
  quality: number,
  keepAlpha: boolean,
) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare this image.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  // PNG and WebP sources may carry transparency, which JPEG would flatten
  // onto black: those re-encode as WebP (the API accepts it). A browser
  // without a WebP encoder hands back a PNG instead, which the size check
  // in prepareImage then judges like any other encoding.
  const type = keepAlpha ? "image/webp" : "image/jpeg";
  return {
    dataUrl: canvas.toDataURL(type, quality),
    width: canvas.width,
    height: canvas.height,
  };
}

export type PreparedImage = { dataUrl: string; width: number; height: number };

/**
 * An image ready for the media route. A file that already fits (under the
 * byte ceiling, long edge within 3840 px) goes up untouched, keeping its
 * quality and any transparency. Anything larger is re-encoded (JPEG, or WebP
 * for PNG and WebP sources so transparency survives) at the highest quality,
 * then the highest resolution, that fits.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("This image has no pixels to show.");
    if (file.size <= IMAGE_UPLOAD_MAX_BYTES && Math.max(width, height) <= IMAGE_MAX_EDGE) {
      return { dataUrl: await readAsDataUrl(file), width, height };
    }
    const keepAlpha = file.type === "image/png" || file.type === "image/webp";
    for (const edge of [IMAGE_MAX_EDGE, 3200, 2560, 1920]) {
      for (const quality of [0.9, 0.82, 0.74]) {
        const encoded = encodeImage(image, width, height, edge, quality, keepAlpha);
        if (dataUrlBytes(encoded.dataUrl) <= IMAGE_UPLOAD_MAX_BYTES) return encoded;
      }
    }
    throw new Error("This image stays over 5.5 MB even after compression.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function waitFor(target: HTMLMediaElement, event: string, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to load."));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This browser cannot read the video."));
    };
    function cleanup() {
      window.clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
    }
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

export type VideoProbe = {
  width: number;
  height: number;
  /** Seconds; undefined when the container does not say. */
  duration?: number;
  /** A JPEG data URL of a frame near the start, when one could be drawn. */
  poster?: string;
};

/**
 * Reads a video's intrinsic size and duration from a hidden `<video>`, and
 * optionally draws a frame at about 0.1 s as a JPEG poster.
 */
export async function probeVideo(source: string, { poster = false } = {}): Promise<VideoProbe> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = poster ? "auto" : "metadata";
  video.setAttribute("aria-hidden", "true");
  Object.assign(video.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.append(video);
  try {
    const loaded = waitFor(video, "loadedmetadata", 20_000);
    video.src = source;
    await loaded;
    const probe: VideoProbe = {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: Number.isFinite(video.duration) ? video.duration : undefined,
    };
    if (poster && probe.width && probe.height) {
      try {
        const seeked = waitFor(video, "seeked", 15_000);
        video.currentTime = Math.min(0.1, (probe.duration ?? 0.2) / 2);
        await seeked;
        probe.poster = encodeImage(video, probe.width, probe.height, 2560, 0.85, false).dataUrl;
      } catch {
        // No poster is not fatal: the section still uploads, and the page
        // shows the video's own first frame instead.
      }
    }
    return probe;
  } finally {
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
}

/** The intrinsic size of an image already in storage. */
export async function measureImage(url: string) {
  const image = await loadImage(url);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

export function formatDuration(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

function responseMessage(text: string, fallback: string) {
  try {
    const body = JSON.parse(text) as { error?: string; message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    return message || body.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * POSTs `body` and resolves with the parsed JSON response. XHR rather than
 * fetch, because only XHR reports upload progress.
 */
export function uploadWithProgress<T>({
  body,
  contentType,
  fallbackError,
  onProgress,
  signal,
  url,
}: {
  body: XMLHttpRequestBodyInit;
  contentType: string;
  fallbackError: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  url: string;
}) {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("content-type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText) as T);
        } catch {
          reject(new Error(fallbackError));
        }
        return;
      }
      reject(new Error(responseMessage(request.responseText, fallbackError)));
    };
    request.onerror = () =>
      reject(new Error("The upload was interrupted. Check the connection and retry."));
    request.onabort = () => reject(new DOMException("The upload was cancelled.", "AbortError"));
    if (signal?.aborted) {
      reject(new DOMException("The upload was cancelled.", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(body);
  });
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
