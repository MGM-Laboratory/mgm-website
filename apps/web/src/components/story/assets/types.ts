import type { Texture } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * The contract between the homepage story's asset cache (engine side) and
 * the prop modules that build meshes from its files (the room, the deck,
 * the character, the toy letters). Types only, so importing it never pulls
 * three.js into a page's first chunk.
 */

/** Quality tiers, highest first. Phones start low, laptops medium, desktops high. */
export type StoryTier = "high" | "medium" | "low";

/** Which part of the story a file belongs to, for progress and lazy groups. */
export type StoryAssetGroup = "deck" | "room" | "character" | "letters" | "worlds" | "stills";

export type StoryAssetKind = "gltf" | "bin" | "ktx2" | "image" | "json";

/**
 * One shipped file under `/story/v1/`. `bytes` is its exact size on disk, so
 * the loading screen can weight its progress before anything arrives.
 * `tiers` lists the tiers that load it (a phone loads the low texture set,
 * not both).
 */
export type StoryFile = Readonly<{
  url: string;
  bytes: number;
  kind: StoryAssetKind;
  group: StoryAssetGroup;
  tiers: readonly StoryTier[];
}>;

export type StoryTextureOptions = Readonly<{
  /** Colour data (albedo, card faces) is sRGB; data maps (normals, lightmaps stored linear) are not. */
  srgb?: boolean;
  flipY?: boolean;
}>;

/**
 * What a prop module gets to build itself. The engine's cache implements it
 * over already-fetched bytes (nothing here touches the network twice), and a
 * standalone harness can implement it over plain fetches.
 */
export interface StoryLoaderLike {
  /** A glTF with meshopt geometry and KTX2 textures resolved (relative URIs follow `url`). */
  gltf(url: string): Promise<GLTF>;
  /** A KTX2 or image texture. */
  texture(url: string, options?: StoryTextureOptions): Promise<Texture>;
  json<T>(url: string): Promise<T>;
  arrayBuffer(url: string): Promise<ArrayBuffer>;
}
