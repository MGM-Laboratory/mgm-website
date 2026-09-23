import { runTextEffect } from "@/components/projects/card-text/ticker";
import { randomInt } from "@/lib/random";

/**
 * lusion.co's category "typing" (ProjectItem, `.project-item-line-1`): a
 * five-glyph head of random printable ASCII sweeps left to right at 40
 * letters per second with the real text locked in behind it. The random
 * glyphs are re-rolled on every frame, the head shrinks away over the last
 * 125 ms, and the line ends on the exact text. There is no caret.
 */

const LETTERS_PER_SECOND = 40;
const RANDOM_HEAD = 5;

// The pre-state keeps one zero-width glyph so the line keeps its height
// (an empty block collapses and would pull the title up a line).
const EMPTY_LINE = "​";

/** How long a scramble of `text` lasts, in seconds. */
export function scrambleDuration(text: string) {
  return (text.length + RANDOM_HEAD) / LETTERS_PER_SECOND;
}

/** One frame of the scramble `t` seconds in (lusion's formula verbatim). */
export function scrambleFrame(text: string, t: number) {
  const typed = Math.floor(LETTERS_PER_SECOND * t);
  // Real characters locked in so far (negative during the first 125 ms)...
  const solid = Math.min(text.length, typed - RANDOM_HEAD);
  // ...and everything shown, so `total - solid` random glyphs follow them:
  // five while typing, shrinking to none once `total` reaches the end.
  const total = Math.min(text.length, typed);
  let frame = solid > 0 ? text.slice(0, solid) : "";
  for (let i = 0; i < total - solid; i++) {
    // "!" (33) to "}" (125); CSS uppercases the letters like the text.
    frame += String.fromCharCode(randomInt(33, 125));
  }
  return frame;
}

export type Scramble = {
  /** Replays from the first frame. */
  play(): void;
  /** Stops and empties the line (the pre-entrance state). */
  reset(): void;
  /** Stops and shows the real text. */
  finish(): void;
};

/** Drives `line`'s text content; nothing else may write it meanwhile. */
export function createScramble(line: HTMLElement, text: string): Scramble {
  let time = 0;
  let stop: (() => void) | null = null;

  const halt = () => {
    stop?.();
    stop = null;
  };
  const show = (value: string) => {
    // Skip redundant writes (each one re-lays out the line).
    if (line.textContent !== value) line.textContent = value;
  };

  return {
    play() {
      halt();
      time = 0;
      show(scrambleFrame(text, 0) || EMPTY_LINE);
      stop = runTextEffect((dt) => {
        time += dt;
        if (time >= scrambleDuration(text)) {
          show(text);
          stop = null;
          return false;
        }
        show(scrambleFrame(text, time) || EMPTY_LINE);
        return true;
      });
    },
    reset() {
      halt();
      show(EMPTY_LINE);
    },
    finish() {
      halt();
      show(text);
    },
  };
}
