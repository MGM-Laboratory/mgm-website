import type { StoryFile } from "@/components/story/assets/types";

/**
 * The toy letters' typeface: Hanken Grotesk ExtraBold outlines for the
 * phrase and a few spare glyphs, as three.js typeface JSON, with exact size.
 */
export const LETTERS_FILES: StoryFile[] = [
  {
    url: "/story/v1/letters/toy-letters.typeface.json",
    bytes: 19543,
    kind: "json",
    group: "letters",
    tiers: ["high", "medium", "low"],
  },
];
