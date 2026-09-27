/**
 * The homepage is told as a short story in chapters (hello, how we think,
 * meet the lab, what we do, and so on), and each section past the reel
 * carries a small chapter mark. They all live here, so renumbering the
 * story is a one-line change.
 */

export type ChapterTone = "blue" | "red" | "yellow" | "green";
export type ChapterShape = "circle" | "square" | "triangle" | "plus";

export type HomeChapter = {
  /** Two digits, "04". */
  number: string;
  /** A few words, sentence case: "What we do". */
  label: string;
  tone: ChapterTone;
  shape: ChapterShape;
};

export const HOME_CHAPTERS = {
  competencies: { number: "04", label: "What we do", tone: "yellow", shape: "circle" },
  trustedBy: { number: "05", label: "Who we build with", tone: "green", shape: "square" },
  projects: { number: "06", label: "What we made", tone: "blue", shape: "triangle" },
  publications: { number: "07", label: "What we learned", tone: "red", shape: "plus" },
  articles: { number: "08", label: "What we wrote", tone: "yellow", shape: "square" },
  finale: { number: "09", label: "Your turn", tone: "blue", shape: "circle" },
} as const satisfies Record<string, HomeChapter>;
