import Link from "next/link";

import { FinaleBlock } from "@/components/story/finale-block";
import { ENTRANCE_VH, TIMELINE } from "@/components/story/engine/timeline";
import { STORY_CARDS, STORY_INTRO, STORY_PANELS } from "@/data/story";

/**
 * The WebGL story's DOM (shown when `html[data-story-mode="gl"]`): one story
 * viewport height (`--story-vh`) per vh of the timeline.
 *
 * - The entrance screen (`t` in [0, 1) of the section): the big title, its
 *   line, and the box placeholder the GL box is glued to: 80% of the
 *   title's width, centred, only its top 20% above the screen's bottom.
 * - A transparent spacer while the stage owns the screen.
 * - The finale screen, the last story vh: "Let's work together." in flow,
 *   so it scrolls away with the footer and the character can be glued to it.
 * - A screen-reader mirror of what the pictures say: the four cards, the
 *   story's moments. Its links are left out of the tab order: keyboard
 *   visitors get the overlay's controls over the GL cards instead.
 */

const FINALE_VH = 1;
const MIDDLE_VH = TIMELINE.end - ENTRANCE_VH - FINALE_VH;

/**
 * The title as letters (for the entrance's rise, its slot rolls and the
 * cursor's lift, driven by the cards act) and the line as words. Split here,
 * in the server markup, so nothing rewrites the HTML after hydration; the
 * heading's text is read from an sr-only copy, and the letters are drawn
 * from `data-char` (story.css), so the word is in the page's text once.
 */
const TITLE_LETTERS = Array.from(STORY_INTRO.title).map((char, i) => ({
  char,
  key: `${String(i)}-${char}`,
}));
const DESCRIPTION_WORDS = STORY_INTRO.description
  .split(" ")
  .map((text, i) => ({ text, key: `${String(i)}-${text}` }));

export function StoryShell() {
  return (
    <div data-story-gl>
      <div data-story-intro className="story-intro">
        <div className="story-intro-copy">
          <h2
            id="story-title"
            data-story-title
            className="story-title mx-auto w-fit font-display font-semibold text-foreground"
          >
            <span className="sr-only">{STORY_INTRO.title}</span>
            {TITLE_LETTERS.map((letter) => (
              <span key={letter.key} aria-hidden className="story-letter" data-story-letter>
                <span className="story-letter-roll" data-story-roll data-char={letter.char} />
              </span>
            ))}
          </h2>
          <p
            data-story-description
            className="story-description mx-auto mt-5 max-w-xl text-foreground/70"
          >
            {DESCRIPTION_WORDS.map((word, i) => (
              <span key={word.key}>
                {i > 0 ? " " : null}
                <span className="story-word" data-story-word>
                  {word.text}
                </span>
              </span>
            ))}
          </p>
        </div>
        <div data-story-box aria-hidden className="story-box" />
      </div>

      <div className="sr-only">
        <ul>
          {STORY_CARDS.map((card) => (
            <li key={card.id}>
              <h3>{card.title}</h3>
              <p>{card.line}</p>
              <Link href={card.href} tabIndex={-1}>
                More about {card.title}
              </Link>
            </li>
          ))}
        </ul>
        <h3>What happens next</h3>
        <ol>
          {STORY_PANELS.map((panel) => (
            <li key={panel.id}>
              {panel.title}. {panel.caption}
            </li>
          ))}
        </ol>
      </div>

      <div
        data-story-spacer
        aria-hidden
        style={{ height: `calc(var(--story-vh, 100vh) * ${MIDDLE_VH})` }}
      />

      <div data-story-finale className="story-finale-screen">
        <FinaleBlock headingId="story-finale-title" className="story-finale-gl" />
      </div>
    </div>
  );
}
