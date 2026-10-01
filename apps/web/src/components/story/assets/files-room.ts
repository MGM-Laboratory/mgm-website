import type { StoryFile } from "@/components/story/assets/types";

/**
 * The shipped files of the story's `room` group, under `/story/v1/room/`,
 * each with its exact size in bytes. The room package replaces this list
 * with its real files; the manifest (`manifest.ts`) picks it up as is.
 */
export const ROOM_FILES: readonly StoryFile[] = [];
