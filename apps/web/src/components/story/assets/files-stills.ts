import type { StoryFile } from "@/components/story/assets/types";

/**
 * The shipped files of the story's `stills` group, under `/story/v1/stills/`,
 * each with its exact size in bytes. The finale package replaces this list
 * with its real files; the manifest (`manifest.ts`) picks it up as is.
 */
export const STILLS_FILES: readonly StoryFile[] = [];
