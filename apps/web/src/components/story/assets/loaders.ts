import { LoadingManager, NoColorSpace, SRGBColorSpace, Texture, type WebGLRenderer } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import { cachedStoryBytes, fetchStoryBytes, storyAssetPath } from "@/components/story/assets/cache";
import { storyFilesFor } from "@/components/story/assets/manifest";
import type { StoryFile, StoryTextureOptions, StoryTier } from "@/components/story/assets/types";
import type { StoryAssets } from "@/components/story/engine/act";

/**
 * `StoryLoaderLike` over the byte cache (`cache.ts`): glTF with meshopt
 * geometry and KTX2 textures, images and JSON, parsed from bytes already
 * fetched, so nothing touches the network twice. Relative resources inside
 * a glTF (a `.bin`, a `.ktx2`) resolve to the cached bytes through a URL
 * modifier on this module's loading manager.
 *
 * One `KTX2Loader` per visit (module level; each new instance would re-read
 * the transcoder and start its own worker pool), with the default bundler
 * URLs for the Basis transcoder: never `setTranscoderPath()`. Every parse is
 * memoised by URL, so two props asking for the same file share one result
 * (clone it with `SkeletonUtils.clone()` for a second copy).
 */

const manager = new LoadingManager();
const blobs = new Map<string, string>();

manager.setURLModifier((url) => {
  const path = storyAssetPath(url);
  if (!path) return url;
  const existing = blobs.get(path);
  if (existing) return existing;
  const bytes = cachedStoryBytes(path);
  if (!bytes) return url;
  const blobUrl = URL.createObjectURL(new Blob([bytes]));
  blobs.set(path, blobUrl);
  return blobUrl;
});

// A blob URL is only needed until its request finishes.
const endItem = manager.itemEnd.bind(manager);
manager.itemEnd = (url: string) => {
  endItem(url);
  for (const [path, blobUrl] of blobs) {
    if (blobUrl !== url) continue;
    URL.revokeObjectURL(blobUrl);
    blobs.delete(path);
    break;
  }
};

let ktx2: KTX2Loader | null = null;
let ktx2Renderer: WebGLRenderer | null = null;

/** The visit's KTX2 loader, set up for `renderer`. */
function ktx2For(renderer: WebGLRenderer) {
  if (!ktx2) ktx2 = new KTX2Loader(manager);
  if (ktx2Renderer !== renderer) {
    ktx2.detectSupport(renderer);
    ktx2Renderer = renderer;
  }
  return ktx2;
}

/** Ends the visit's KTX2 worker pool (only when the whole story is torn down). */
export function disposeStoryLoaders() {
  ktx2?.dispose();
  ktx2 = null;
  ktx2Renderer = null;
  for (const blobUrl of blobs.values()) URL.revokeObjectURL(blobUrl);
  blobs.clear();
}

const gltfs = new Map<string, Promise<GLTF>>();
const textures = new Map<string, Promise<Texture>>();
const jsons = new Map<string, Promise<unknown>>();

async function bytesOf(url: string): Promise<ArrayBuffer> {
  const bytes = cachedStoryBytes(url) ?? (await fetchStoryBytes(url));
  if (!bytes) throw new Error(`story asset missing: ${url}`);
  return bytes;
}

function baseOf(path: string) {
  return path.slice(0, path.lastIndexOf("/") + 1);
}

function isKtx2(path: string) {
  return path.endsWith(".ktx2");
}

async function parseGltf(renderer: WebGLRenderer, url: string): Promise<GLTF> {
  const path = storyAssetPath(url);
  if (!path) throw new Error(`not a story asset: ${url}`);
  const bytes = await bytesOf(path);
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2For(renderer));
  return loader.parseAsync(bytes, baseOf(path));
}

async function parseTexture(
  renderer: WebGLRenderer,
  url: string,
  options: StoryTextureOptions,
): Promise<Texture> {
  const path = storyAssetPath(url);
  if (!path) throw new Error(`not a story asset: ${url}`);
  const bytes = await bytesOf(path);
  const colorSpace = options.srgb ? SRGBColorSpace : NoColorSpace;
  if (isKtx2(path)) {
    // The loader transfers its buffer to a worker: hand it a copy, keep the cache whole.
    const loader = ktx2For(renderer);
    const texture = await new Promise<Texture>((resolve, reject) => {
      loader.parse(
        bytes.slice(0),
        (parsed) => {
          resolve(parsed);
        },
        (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
    texture.colorSpace = colorSpace;
    // Compressed textures cannot be flipped at upload; KTX2 files are authored for glTF (flipY false).
    texture.needsUpdate = true;
    return texture;
  }
  const bitmap = await createImageBitmap(new Blob([bytes]), {
    imageOrientation: options.flipY ? "flipY" : "from-image",
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  const texture = new Texture(bitmap);
  texture.flipY = false;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The story's `StoryAssets` for `renderer` and `tier`. Parses lazily, once
 * per URL; `warm()` parses every glTF of the tier up front (the loading
 * screen calls it so no act waits on a parse).
 */
export function createStoryAssets(renderer: WebGLRenderer, tier: StoryTier) {
  const files: readonly StoryFile[] = storyFilesFor(tier);
  const memo = <T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>) => {
    const existing = cache.get(key);
    if (existing) return existing;
    const created = make();
    cache.set(key, created);
    // A failed parse may be retried by the next caller.
    created.catch(() => {
      if (cache.get(key) === created) cache.delete(key);
    });
    return created;
  };

  const assets: StoryAssets & { warm(): Promise<void> } = {
    files,
    has(url) {
      return cachedStoryBytes(url) !== undefined;
    },
    gltf(url) {
      return memo(gltfs, storyAssetPath(url) ?? url, () => parseGltf(renderer, url));
    },
    texture(url, options = {}) {
      const key = `${storyAssetPath(url) ?? url}|${options.srgb ? 1 : 0}|${options.flipY ? 1 : 0}`;
      return memo(textures, key, () => parseTexture(renderer, url, options));
    },
    json<T>(url: string) {
      return memo(jsons, storyAssetPath(url) ?? url, async () => {
        const bytes = await bytesOf(url);
        return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      }) as Promise<T>;
    },
    async arrayBuffer(url) {
      return bytesOf(url);
    },
    async warm() {
      const jobs = files
        .filter((file) => file.kind === "gltf")
        .map((file) => assets.gltf(file.url).then(() => undefined));
      await Promise.allSettled(jobs);
    },
  };
  return assets;
}

export type StoryAssetsWithWarm = ReturnType<typeof createStoryAssets>;
