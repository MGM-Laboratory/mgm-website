import {
  cubicBezier,
  saturate,
  seededRandom,
  stepSpring,
  type ActState,
  type StoryContext,
} from "@/components/story/engine/act";

/**
 * The Competencies entrance in the DOM (ACTS Act 1, "The entrance"), driven
 * from the act's update with inline styles only (no ScrollTrigger, no class
 * changes inside the smoothed page): the title's letters rise out of their
 * masks with a slight 3D tilt when the section is 30% into view, the line's
 * words fade up after them, the title and the line drift at 0.85x and 0.95x
 * of the scroll (the box runs at 1.15x in the GL glue), letters near the
 * cursor lift and grow heavier, and every few seconds one letter does a slot
 * roll. The markup is split on the server (`story-shell.tsx`).
 *
 * The rise plays only on an arrival from above: a visitor coming back up
 * from the story finds the title settled, and a first sight already inside
 * the section skips it. The server HTML is the settled state, so the title
 * is never hidden unless this runs.
 */

/** The site's ease, cubic-bezier(.35, 0, 0, 1). */
const siteEase = cubicBezier(0.35, 0, 0, 1);
const RISE_SECONDS = 1;
const LETTER_STAGGER = 0.035;
const WORDS_AFTER = 0.45;
const WORD_STAGGER = 0.05;
const ROLL_SECONDS = 0.72;
/** Weight of the display face at rest and under the cursor. */
const WEIGHT = 600;
const WEIGHT_LIFT = 140;

type Letter = {
  readonly mask: HTMLElement;
  readonly roll: HTMLElement;
  /** Advance in the word, em; and the letter's centre from the title's left edge, em. */
  advance: number;
  centre: number;
  lift: [number, number];
  style: string;
  weight: string;
};

type Word = { readonly element: HTMLElement; style: string };

export class Entrance {
  private title: HTMLElement | null = null;
  private description: HTMLElement | null = null;
  private letters: Letter[] = [];
  private words: Word[] = [];
  private decided = false;
  /** Clock time the rise started; -Infinity: settled without it; null: hidden, waiting. */
  private riseStart: number | null = null;
  private measuredFor = "";
  private rollLetter = -1;
  private rollStart = -10;
  private nextRoll = 0;
  private readonly random = seededRandom(0xc0de);
  private titleStyle = "";
  private descriptionStyle = "";

  /** Finds the split title and line (a new page mount has new elements). */
  private bind(ctx: StoryContext) {
    const title = ctx.dom.element("title");
    if (title === this.title) return this.letters.length > 0;
    this.reset();
    this.title = title;
    this.description = ctx.dom.element("description");
    if (!title) return false;
    this.letters = Array.from(title.querySelectorAll<HTMLElement>("[data-story-letter]")).flatMap(
      (mask) => {
        const roll = mask.querySelector<HTMLElement>("[data-story-roll]");
        return roll
          ? [{ mask, roll, advance: 0, centre: 0, lift: [0, 0], style: "", weight: "" } as Letter]
          : [];
      },
    );
    this.words = Array.from(
      this.description?.querySelectorAll<HTMLElement>("[data-story-word]") ?? [],
    ).map((element) => ({ element, style: "" }));
    this.decided = false;
    this.riseStart = null;
    this.measuredFor = "";
    return this.letters.length > 0;
  }

  /**
   * Locks each letter's width to its advance in the whole word (kerning
   * included), in em, so weight and size changes never reflow the title.
   */
  private measure() {
    const title = this.title;
    if (!title) return;
    const style = getComputedStyle(title);
    const key = `${style.fontFamily}|${String(document.fonts.status)}`;
    if (key === this.measuredFor) return;
    const g = document.createElement("canvas").getContext("2d");
    if (!g) return;
    this.measuredFor = key;
    const size = 100;
    g.font = `${String(WEIGHT)} ${String(size)}px ${style.fontFamily}`;
    const spacing = Number.parseFloat(style.letterSpacing) / Number.parseFloat(style.fontSize);
    g.letterSpacing = `${String(Number.isFinite(spacing) ? spacing * size : 0)}px`;
    const text = this.letters.map((letter) => letter.roll.firstChild?.textContent ?? "").join("");
    let previous = 0;
    let left = 0;
    this.letters.forEach((letter, i) => {
      const next = g.measureText(text.slice(0, i + 1)).width;
      letter.advance = (next - previous) / size;
      letter.centre = left + letter.advance / 2;
      left += letter.advance;
      previous = next;
      letter.mask.style.width = `${letter.advance.toFixed(4)}em`;
    });
  }

  update(ctx: StoryContext, state: ActState) {
    if (!this.bind(ctx)) return;
    const title = this.title;
    if (!title) return;
    this.measure();
    const t = state.t;
    const time = ctx.clock.time;
    const dt = ctx.clock.dt;
    const entrance = state.entrance;

    // The rise: decided on first sight, replayed only on an arrival from above.
    if (!this.decided) {
      this.decided = true;
      this.riseStart = entrance >= 0.3 || t >= 0 ? -Infinity : null;
    }
    if (this.riseStart === null && entrance >= 0.3) this.riseStart = time;
    if (this.riseStart !== null && entrance < 0.08 && t < 0) this.riseStart = null;
    const age = this.riseStart === null ? -1 : time - this.riseStart;

    // Off screen (well past the intro): nothing to write.
    if (t > 1.3) return;

    // Parallax: the title at 0.85x of the scroll, the line at 0.95x, both settled at t = 0.
    const height = ctx.size.height;
    const drift = Math.max(-1, Math.min(1.3, t));
    this.write("title", `translate3d(0, ${(0.15 * drift * height).toFixed(2)}px, 0)`);
    this.write("description", `translate3d(0, ${(0.05 * drift * height).toFixed(2)}px, 0)`);

    // The cursor over the title: letters near it lift and grow heavier, on springs.
    const rect = ctx.dom.rect("title");
    const pointer = ctx.pointer;
    let px = Number.NaN;
    let near = 0;
    if (rect && pointer.inside && pointer.type !== "touch" && age > RISE_SECONDS) {
      const em = Number.parseFloat(getComputedStyle(title).fontSize) || 100;
      px = (pointer.px.x - rect.x) / em;
      const below = pointer.px.y - (rect.y + rect.height);
      const above = rect.y - pointer.px.y;
      near = saturate(1 - Math.max(0, below, above) / (rect.height * 0.9));
    }

    // A slot roll every few seconds, never the same letter twice in a row.
    const settled = age > RISE_SECONDS + 0.8;
    if (!settled) this.nextRoll = time + 1.5;
    if (settled && time > this.nextRoll) {
      let pick = Math.floor(this.random() * this.letters.length);
      if (pick === this.rollLetter) pick = (pick + 1) % this.letters.length;
      this.rollLetter = pick;
      this.rollStart = time;
      this.nextRoll = time + 3 + this.random() * 2;
    }

    this.letters.forEach((letter, i) => {
      const p = age < 0 ? 0 : siteEase(saturate((age - i * LETTER_STAGGER) / RISE_SECONDS));
      const d = Number.isNaN(px) ? 9 : (px - letter.centre) / Math.max(0.2, letter.advance * 1.1);
      const k = near * Math.exp(-0.5 * d * d);
      stepSpring(letter.lift, k, dt, 120, 13);
      const lift = letter.lift[0];
      const rollAge = i === this.rollLetter ? (time - this.rollStart) / ROLL_SECONDS : -1;
      const roll = rollAge > 0 && rollAge < 1 ? siteEase(rollAge) * 125 : 0;
      const y = (1 - p) * 135 - roll;
      const tilt = (1 - p) * -35;
      const style =
        p >= 1 && roll === 0 && Math.abs(lift) < 0.002
          ? ""
          : `translate3d(0, ${y.toFixed(2)}%, 0) translateY(${(-6 * lift).toFixed(2)}px) rotateX(${tilt.toFixed(2)}deg)`;
      if (style !== letter.style) {
        letter.style = style;
        letter.roll.style.transform = style;
      }
      const weight = Math.abs(lift) < 0.004 ? "" : String(Math.round(WEIGHT + WEIGHT_LIFT * lift));
      if (weight !== letter.weight) {
        letter.weight = weight;
        letter.roll.style.fontWeight = weight;
      }
    });

    this.words.forEach((word, j) => {
      const q = age < 0 ? 0 : siteEase(saturate((age - WORDS_AFTER - j * WORD_STAGGER) / 0.8));
      const key = q >= 1 ? "" : q.toFixed(3);
      if (key === word.style) return;
      word.style = key;
      word.element.style.opacity = key;
      word.element.style.transform = key
        ? `translate3d(0, ${((1 - q) * 0.7).toFixed(3)}em, 0)`
        : "";
    });
  }

  /** The act went to sleep: above the section, the next arrival plays the rise again. */
  left(t: number) {
    if (t < 0 && this.decided) this.riseStart = null;
  }

  private write(which: "title" | "description", transform: string) {
    if (which === "title") {
      if (transform === this.titleStyle || !this.title) return;
      this.titleStyle = transform;
      this.title.style.transform = transform;
      return;
    }
    if (transform === this.descriptionStyle || !this.description) return;
    this.descriptionStyle = transform;
    this.description.style.transform = transform;
  }

  /** Back to the server state (settled, no inline styles). */
  reset() {
    for (const letter of this.letters) {
      letter.roll.style.transform = "";
      letter.roll.style.fontWeight = "";
      letter.mask.style.width = "";
    }
    for (const word of this.words) {
      word.element.style.opacity = "";
      word.element.style.transform = "";
    }
    if (this.title) this.title.style.transform = "";
    if (this.description) this.description.style.transform = "";
    this.letters = [];
    this.words = [];
    this.title = null;
    this.description = null;
    this.titleStyle = "";
    this.descriptionStyle = "";
  }
}
