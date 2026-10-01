import type { StoryFile } from "@/components/story/assets/types";

/**
 * The shipped files of the story's `character` group, under `/story/v1/character/`,
 * each with its exact size in bytes. The character package replaces this list
 * with its real files; the manifest (`manifest.ts`) picks it up as is.
 */
export const CHARACTER_FILES: readonly StoryFile[] = [];
