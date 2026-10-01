import type { StoryFile } from "@/components/story/assets/types";

/**
 * The storybook's stills, rendered from the WebGL story's own scenes (one per
 * panel of `STORY_PANELS`, and "finale", a cut-out of Godette waving), in
 * both schemes, under `/story/v1/stills/`. Each name carries a hash of its
 * bytes, so the immutable cache never serves an old picture. The stills
 * script rewrites this file (exact sizes); the manifest picks the files up
 * as the `stills` group, which the WebGL preload leaves out.
 */

export type StoryStillFile = Readonly<{ url: string; bytes: number }>;

export type StoryStill = Readonly<{
  /** Pixel size of both files. */
  width: number;
  height: number;
  light: StoryStillFile;
  dark: StoryStillFile;
}>;

export const STORY_STILLS: ReadonlyMap<string, StoryStill> = new Map<string, StoryStill>([
  [
    "finale",
    {
      width: 480,
      height: 600,
      light: { url: "/story/v1/stills/finale-light.dcfa64e775.webp", bytes: 20072 },
      dark: { url: "/story/v1/stills/finale-dark.ea159e01d6.webp", bytes: 21490 },
    },
  ],
]);

export const STILLS_FILES: readonly StoryFile[] = [...STORY_STILLS.values()].flatMap((still) =>
  [still.light, still.dark].map((file): StoryFile => ({
    url: file.url,
    bytes: file.bytes,
    kind: "image",
    group: "stills",
    tiers: ["high", "medium", "low"],
  })),
);
