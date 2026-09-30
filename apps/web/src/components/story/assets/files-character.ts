import type { StoryFile } from "./types";

/**
 * Godette's shipped files under /story/v1/character/: the skinned character with her face and lid
 * poses, the colour texture at two sizes (the high tier loads 2k, the others 1k), the figure stand,
 * and her body clips in one file per act. Byte sizes are exact, for the loader's progress.
 */
export const CHARACTER_FILES: StoryFile[] = [
  {
    url: "/story/v1/character/godette.glb",
    bytes: 438140,
    kind: "gltf",
    group: "character",
    tiers: ["high", "medium", "low"],
  },
  {
    url: "/story/v1/character/godette-2k.ktx2",
    bytes: 827665,
    kind: "ktx2",
    group: "character",
    tiers: ["high"],
  },
  {
    url: "/story/v1/character/godette-1k.ktx2",
    bytes: 311052,
    kind: "ktx2",
    group: "character",
    tiers: ["medium", "low"],
  },
  {
    url: "/story/v1/character/stand.glb",
    bytes: 118728,
    kind: "gltf",
    group: "character",
    tiers: ["high", "medium", "low"],
  },
  {
    url: "/story/v1/character/clips-room.glb",
    bytes: 482376,
    kind: "gltf",
    group: "character",
    tiers: ["high", "medium", "low"],
  },
  {
    url: "/story/v1/character/clips-flight.glb",
    bytes: 410956,
    kind: "gltf",
    group: "character",
    tiers: ["high", "medium", "low"],
  },
  {
    url: "/story/v1/character/clips-finale.glb",
    bytes: 602604,
    kind: "gltf",
    group: "character",
    tiers: ["high", "medium", "low"],
  },
];
