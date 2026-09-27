/**
 * Copy for the homepage reel (components/reel): the chapter that introduces
 * the lab with its company profile video. Static on purpose, the video
 * itself comes from the CMS (Settings, Home).
 */

export type ReelCopy = {
  /** The heading, as two lines of words. */
  titleLines: readonly (readonly string[])[];
  description: string;
  cta: { label: string; href: string };
  /** The two words either side of the play button. */
  playWords: readonly [string, string];
  /** The play button's accessible name. */
  watchLabel: string;
  /** Shown in place of the button while no video is uploaded. */
  placeholderCaption: string;
  /** The strips above and below the big video take turns with these. */
  stripLines: readonly string[];
  /** The same strips without a video (nothing there to play). */
  placeholderStripLines: readonly string[];
  /** Where the lab is, for the corner readout. Faculty of Computer Science, UB. */
  coordinates: string;
};

export const REEL_COPY: ReelCopy = {
  titleLines: [
    ["Curious", "Ideas,"],
    ["Built", "for", "Real"],
  ],
  description:
    "We are researchers, designers and engineers at Universitas Brawijaya. We turn curious questions into games, apps and websites that people can hold, play and use. Some begin in a classroom. Some end up in journals. This is the lab behind them.",
  cta: { label: "Our story", href: "/about" },
  playWords: ["Play", "Video"],
  watchLabel: "Play the company profile video",
  placeholderCaption: "Our film is on its way.",
  stripLines: [
    "Play video",
    "Meet the lab",
    "Media, game and mobile",
    "Malang, Indonesia",
    "FILKOM, Universitas Brawijaya",
  ],
  placeholderStripLines: [
    "Meet the lab",
    "Media, game and mobile",
    "Malang, Indonesia",
    "FILKOM, Universitas Brawijaya",
  ],
  coordinates: "7.95° S 112.61° E",
};
