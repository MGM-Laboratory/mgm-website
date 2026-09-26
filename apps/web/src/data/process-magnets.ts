import type { PatternKind, PatternTone } from "@/components/process/pattern-tile";

/**
 * The homepage's process board: ten fridge magnets, one per word, each with
 * its pattern tile. The visitor can move them around, so the order below is
 * only where they start (their "home"), grouped into the rows of the
 * original poster. The word doubles as the magnet's id in a saved
 * arrangement, so renaming one resets where that magnet was left.
 */
export type ProcessMagnet = {
  /** The word on the front. Also the magnet's id in saved arrangements. */
  word: string;
  /** How the lab does this step, shown on the back when the magnet flips. */
  back: string;
  kind: PatternKind;
  bg: PatternTone;
  fg: PatternTone;
};

export const PROCESS_ROWS: ProcessMagnet[][] = [
  [
    {
      word: "We.",
      back: "Students and lecturers at FILKOM who like to make things together.",
      kind: "fans",
      bg: "canvas",
      fg: "red",
    },
    {
      word: "Research.",
      back: "We read, ask and measure before we make anything.",
      kind: "square",
      bg: "canvas",
      fg: "yellow",
    },
  ],
  [
    {
      word: "Explore.",
      back: "We try a few directions early, while ideas are still cheap.",
      kind: "arcs",
      bg: "blue",
      fg: "canvas",
    },
    {
      word: "Build.",
      back: "We turn the strongest idea into something people can hold.",
      kind: "circle",
      bg: "red",
      fg: "canvas",
    },
    {
      word: "Design.",
      back: "We shape how it looks and feels for the people who use it.",
      kind: "leaves",
      bg: "green",
      fg: "canvas",
    },
  ],
  [
    {
      word: "Test.",
      back: "We put it in real hands early, then listen.",
      kind: "plus",
      bg: "red",
      fg: "canvas",
    },
    {
      word: "Learn.",
      back: "Every result, good or bad, tells us what to change next.",
      kind: "clover",
      bg: "yellow",
      fg: "canvas",
    },
    {
      word: "Code.",
      back: "We write code the next person can read and trust.",
      kind: "fans",
      bg: "canvas",
      fg: "blue",
    },
  ],
  [
    {
      word: "Iterate.",
      back: "We go around again, a little sharper every time.",
      kind: "square",
      bg: "canvas",
      fg: "blue",
    },
    {
      word: "Grow.",
      back: "Every project leaves us a little better at the next one.",
      kind: "leaves",
      bg: "red",
      fg: "canvas",
    },
  ],
];

export const PROCESS_MAGNETS: ProcessMagnet[] = PROCESS_ROWS.flat();

export const PROCESS_COPY = {
  chapterNumber: "02",
  chapter: "How we think",
  hint: "This is how we work. The order changes every day, so go ahead and move them.",
  /** Appended for a mouse or trackpad. */
  hintFine: "Drag one anywhere, or click it to flip it over.",
  /** Appended for touch screens. */
  hintTouch: "Press and hold one to pick it up, or tap it to flip it over.",
  reset: "Put them back",
  /** Read after each magnet's word, as its accessible name. */
  instructions: "Press Enter to flip, arrow keys to move",
} as const;
