import {
  GL_GROUPS,
  STORY_ASSET_BASE,
  storyFilesFor,
  totalBytes,
} from "@/components/story/assets/manifest";
import type { StoryAssetGroup, StoryFile, StoryTier } from "@/components/story/assets/types";

/**
 * The story's byte cache: every manifest file fetched once per visit into a
 * module-level map, with byte progress for the loading screen. It outlives
 * routes (the root layout never unmounts), so `/ -> /projects -> /` never
 * fetches twice. Parsing (glTF, KTX2, images) lives in `loaders.ts`, which
 * pulls in three.js: this module stays free of it, so the loading screen can
 * import it on any page.
 *
 * Nothing here ever rejects. A failed file is retried once and then
 * reported in `failed`: CI and Lighthouse run with no API and dropped
 * connections, and an unhandled rejection is a page error there.
 *
 * Requests use XMLHttpRequest, not fetch: its progress events count bytes
 * even when the response is gzipped (no Content-Length), and every URL is
 * shape-checked to be a same-origin `/story/` asset first.
 */

export type StoryPreloadProgress = Readonly<{
  loadedBytes: number;
  totalBytes: number;
  /** Files finished (loaded or failed) and the file count. */
  done: number;
  files: number;
  /** URLs that failed twice. */
  failed: readonly string[];
}>;

const buffers = new Map<string, ArrayBuffer>();
const failures = new Set<string>();
const inflight = new Map<string, Promise<ArrayBuffer | null>>();

const SAFE_PATH = /^[\w./-]+$/;
const CONCURRENCY = 4;
const TIMEOUT_MS = 30_000;

/** The cache key for `url`: its same-origin path, or null when it is not a story asset. */
export function storyAssetPath(url: string): string | null {
  if (typeof window === "undefined") return null;
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return null;
  }
  const path = parsed.pathname;
  if (parsed.origin !== window.location.origin) return null;
  if (!path.startsWith(STORY_ASSET_BASE) || path.includes("..") || !SAFE_PATH.test(path)) {
    return null;
  }
  return path;
}

/** The fetched bytes of `url`, if the cache has them. Callers must not mutate them. */
export function cachedStoryBytes(url: string): ArrayBuffer | undefined {
  const path = storyAssetPath(url);
  return path ? buffers.get(path) : undefined;
}

export function storyBytesFailed(url: string) {
  const path = storyAssetPath(url);
  return path ? failures.has(path) : true;
}

function request(path: string, onBytes: (loaded: number) => void): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", path);
    xhr.responseType = "arraybuffer";
    xhr.timeout = TIMEOUT_MS;
    xhr.onprogress = (event) => {
      onBytes(event.loaded);
    };
    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof ArrayBuffer;
      resolve(ok ? (xhr.response as ArrayBuffer) : null);
    };
    const fail = () => {
      resolve(null);
    };
    xhr.onerror = fail;
    xhr.onabort = fail;
    xhr.ontimeout = fail;
    try {
      xhr.send();
    } catch {
      resolve(null);
    }
  });
}

/**
 * The bytes of one story asset, from the cache or the network (one retry).
 * Resolves null for a URL that is not a same-origin story asset or that
 * failed. Concurrent callers share one request.
 */
export function fetchStoryBytes(
  url: string,
  onBytes?: (loaded: number) => void,
): Promise<ArrayBuffer | null> {
  const path = storyAssetPath(url);
  if (!path) return Promise.resolve(null);
  const cached = buffers.get(path);
  if (cached) return Promise.resolve(cached);
  const running = inflight.get(path);
  if (running) return running;
  const report = onBytes ?? (() => {});
  const job = request(path, report)
    .then((first) => first ?? request(path, report))
    .then((bytes) => {
      inflight.delete(path);
      if (bytes) {
        buffers.set(path, bytes);
        failures.delete(path);
      } else {
        failures.add(path);
      }
      return bytes;
    });
  inflight.set(path, job);
  return job;
}

type PreloadRun = {
  key: string;
  promise: Promise<StoryPreloadProgress>;
  listeners: Set<(progress: StoryPreloadProgress) => void>;
  progress: StoryPreloadProgress;
};

let run: PreloadRun | null = null;

/**
 * Fetches every file `tier` needs from `groups` (default: the WebGL story's
 * groups) into the cache, reporting byte progress. Calls for the same tier
 * and groups while one runs share it (both get progress). Never rejects.
 */
export function preloadStory(
  tier: StoryTier,
  onProgress?: (progress: StoryPreloadProgress) => void,
  groups: readonly StoryAssetGroup[] = GL_GROUPS,
): Promise<StoryPreloadProgress> {
  const key = `${tier}:${groups.join(",")}`;
  if (run && run.key === key) {
    if (onProgress) {
      run.listeners.add(onProgress);
      onProgress(run.progress);
    }
    return run.promise;
  }
  const files = storyFilesFor(tier, groups);
  const listeners = new Set<(progress: StoryPreloadProgress) => void>();
  if (onProgress) listeners.add(onProgress);
  const current: PreloadRun = {
    key,
    listeners,
    promise: Promise.resolve(emptyProgress(files)),
    progress: emptyProgress(files),
  };
  run = current;
  current.promise = loadAll(files, (progress) => {
    current.progress = progress;
    for (const listener of [...current.listeners]) listener(progress);
  });
  return current.promise;
}

function emptyProgress(files: readonly StoryFile[]): StoryPreloadProgress {
  return {
    loadedBytes: 0,
    totalBytes: totalBytes(files),
    done: 0,
    files: files.length,
    failed: [],
  };
}

async function loadAll(
  files: readonly StoryFile[],
  report: (progress: StoryPreloadProgress) => void,
): Promise<StoryPreloadProgress> {
  const total = totalBytes(files);
  const received = new Map<string, number>();
  const failed: string[] = [];
  let done = 0;
  const snapshot = (): StoryPreloadProgress => {
    let loaded = 0;
    for (const bytes of received.values()) loaded += bytes;
    return {
      loadedBytes: Math.min(loaded, total),
      totalBytes: total,
      done,
      files: files.length,
      failed: [...failed],
    };
  };
  report(snapshot());
  const queue = [...files];
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const expected = file.bytes;
      const url = file.url;
      const bytes = await fetchStoryBytes(url, (loaded) => {
        received.set(url, Math.min(loaded, expected));
        report(snapshot());
      });
      if (bytes) received.set(url, expected);
      else failed.push(url);
      done += 1;
      report(snapshot());
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, files.length); i += 1) workers.push(worker());
  try {
    await Promise.all(workers);
  } catch {
    // fetchStoryBytes never rejects; this only guards the report callbacks.
  }
  const result = snapshot();
  report(result);
  return result;
}
