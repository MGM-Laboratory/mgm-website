import gsap from "gsap";

/**
 * The hero's entrance, after unseen.co's detail intro: every letter of the
 * title rises into place from under its word's mask (expo.inOut, a short
 * stagger left to right), the description's words follow, then the
 * categories and the authors fade up, and the cover emerges from the sea.
 *
 * Every hidden piece starts hidden from the stylesheet with opacity only
 * (never a transform class: docs/animation-system.md gotcha #1); the timeline
 * shows the containers and owns the transforms of the letters and words
 * inside them from its first frame.
 */

export type EntranceParts = {
  meta: HTMLElement | null;
  title: HTMLElement | null;
  subtitle: HTMLElement | null;
  chips: HTMLElement | null;
  authors: HTMLElement | null;
};

export type EntranceOptions = {
  /** The title is already in place (the next-article hand-off carried it here). */
  titleShown: boolean;
  /** Called when the cover should start emerging. */
  onCover: () => void;
  /** Called when the story below may start revealing itself. */
  onStory: () => void;
};

const TITLE_SECONDS = 0.95;
/** The title's letters take at most this long to start, whatever its length. */
const TITLE_SPREAD = 0.62;

export function heroParts(root: HTMLElement): EntranceParts {
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-enter="${name}"]`);
  return {
    meta: part("meta"),
    title: part("title"),
    subtitle: part("subtitle"),
    chips: part("chips"),
    authors: part("authors"),
  };
}

/** Shows every hidden piece at rest (reduced motion, or a failsafe). */
export function showHero(parts: EntranceParts) {
  for (const element of Object.values(parts)) {
    if (!element) continue;
    gsap.set(element, { opacity: 1 });
    gsap.set(element.querySelectorAll(".ad-tg, .ad-wi, li"), { clearProps: "transform,opacity" });
  }
}

export function playHeroEntrance(parts: EntranceParts, options: EntranceOptions) {
  const tl = gsap.timeline({ delay: 0.08, defaults: { ease: "expo.out" } });

  if (parts.meta) {
    tl.fromTo(parts.meta, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.1 }, 0);
  }

  if (parts.title) {
    gsap.set(parts.title, { opacity: 1 });
    if (!options.titleShown) {
      const glyphs = parts.title.querySelectorAll<HTMLElement>(".ad-tg");
      const stagger = Math.min(0.03, TITLE_SPREAD / Math.max(1, glyphs.length));
      tl.fromTo(
        glyphs,
        { yPercent: 118 },
        { yPercent: 0, duration: TITLE_SECONDS, ease: "expo.inOut", stagger },
        0.05,
      );
    }
  }

  const bodyAt = options.titleShown ? 0.1 : 0.34;
  if (parts.subtitle) {
    gsap.set(parts.subtitle, { opacity: 1 });
    const words = parts.subtitle.querySelectorAll<HTMLElement>(".ad-wi");
    tl.fromTo(
      words,
      { yPercent: 112 },
      {
        yPercent: 0,
        duration: 1.05,
        ease: "expo.out",
        stagger: Math.min(0.018, 0.5 / Math.max(1, words.length)),
      },
      bodyAt,
    );
  }

  if (parts.chips) {
    gsap.set(parts.chips, { opacity: 1 });
    tl.fromTo(
      parts.chips.querySelectorAll("li"),
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.9, stagger: 0.07 },
      bodyAt + 0.26,
    );
  }

  if (parts.authors) {
    tl.fromTo(
      parts.authors,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 1 },
      bodyAt + 0.4,
    );
  }

  tl.call(options.onCover, undefined, options.titleShown ? 0.2 : 0.5);
  tl.call(options.onStory, undefined, options.titleShown ? 0.45 : 0.95);
  return tl;
}
