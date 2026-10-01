import { CHARACTER_FILES } from "@/components/story/assets/files-character";
import { DECK_FILES } from "@/components/story/assets/files-deck";
import { LETTERS_FILES } from "@/components/story/assets/files-letters";
import { ROOM_FILES } from "@/components/story/assets/files-room";
import { STILLS_FILES } from "@/components/story/assets/files-stills";
import { WORLDS_FILES } from "@/components/story/assets/files-worlds";
import type { StoryAssetGroup, StoryFile, StoryTier } from "@/components/story/assets/types";

/**
 * Every file the homepage story ships, from the per-group lists each asset
 * package owns (`files-<group>.ts`). Files live under
 * `public/story/<version>/<group>/` and are served immutable
 * (`next.config.ts`): bump `STORY_ASSET_VERSION` whenever any file changes.
 * No three.js here, so the loading screen can import it from any page.
 */

export const STORY_ASSET_VERSION = "v1";

/** The URL prefix every story asset starts with. */
export const STORY_ASSET_BASE = `/story/${STORY_ASSET_VERSION}/`;

export const STORY_FILES: readonly StoryFile[] = [
  ...DECK_FILES,
  ...ROOM_FILES,
  ...CHARACTER_FILES,
  ...LETTERS_FILES,
  ...WORLDS_FILES,
  ...STILLS_FILES,
];

/** The groups the WebGL story needs. The stills belong to the storybook (DOM) version. */
export const GL_GROUPS: readonly StoryAssetGroup[] = [
  "deck",
  "room",
  "character",
  "letters",
  "worlds",
];

/** The files `tier` loads from `groups`, in manifest order. */
export function storyFilesFor(
  tier: StoryTier,
  groups: readonly StoryAssetGroup[] = GL_GROUPS,
): StoryFile[] {
  return STORY_FILES.filter((file) => file.tiers.includes(tier) && groups.includes(file.group));
}

export function totalBytes(files: readonly StoryFile[]) {
  let sum = 0;
  for (const file of files) sum += file.bytes;
  return sum;
}
