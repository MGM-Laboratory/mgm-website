import type { StoryFile } from "@/components/story/assets/types";

/**
 * The shipped files of the story's `worlds` group, under `/story/v1/worlds/`,
 * each with its exact size in bytes. The worlds package replaces this list
 * with its real files; the manifest (`manifest.ts`) picks it up as is.
 */
export const WORLDS_FILES: readonly StoryFile[] = [];
