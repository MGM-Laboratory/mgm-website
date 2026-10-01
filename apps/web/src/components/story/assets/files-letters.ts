import type { StoryFile } from "@/components/story/assets/types";

/**
 * The shipped files of the story's `letters` group, under `/story/v1/letters/`,
 * each with its exact size in bytes. The deck package replaces this list
 * with its real files; the manifest (`manifest.ts`) picks it up as is.
 */
export const LETTERS_FILES: readonly StoryFile[] = [];
