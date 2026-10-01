import type { StoryFile } from "@/components/story/assets/types";

/**
 * The deck's shipped files (the card box, the card back, the baked fall), with
 * their exact sizes on disk, read from the files themselves by the deck
 * pipeline. The box textures and the card back come in a high set (high and
 * medium tiers) and a low set.
 */
export const DECK_FILES: StoryFile[] = [
  {
    url: "/story/v1/deck/box.glb",
    bytes: 15972,
    kind: "gltf",
    group: "deck",
    tiers: ["high", "medium", "low"],
  },
  {
    url: "/story/v1/deck/box-wrap-4k.ktx2",
    bytes: 568144,
    kind: "ktx2",
    group: "deck",
    tiers: ["high", "medium"],
  },
  {
    url: "/story/v1/deck/box-wrap-2k.ktx2",
    bytes: 248855,
    kind: "ktx2",
    group: "deck",
    tiers: ["low"],
  },
  {
    url: "/story/v1/deck/box-panels-2k.ktx2",
    bytes: 177573,
    kind: "ktx2",
    group: "deck",
    tiers: ["high", "medium"],
  },
  {
    url: "/story/v1/deck/box-panels-1k.ktx2",
    bytes: 89063,
    kind: "ktx2",
    group: "deck",
    tiers: ["low"],
  },
  {
    url: "/story/v1/deck/card-back-1k.ktx2",
    bytes: 255866,
    kind: "ktx2",
    group: "deck",
    tiers: ["high", "medium"],
  },
  {
    url: "/story/v1/deck/card-back-512.ktx2",
    bytes: 110350,
    kind: "ktx2",
    group: "deck",
    tiers: ["low"],
  },
  {
    url: "/story/v1/deck/box-drop.json",
    bytes: 7975,
    kind: "json",
    group: "deck",
    tiers: ["high", "medium", "low"],
  },
];
