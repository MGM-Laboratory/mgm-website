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
            {STORY_INTRO.title}
          </h2>
          <p
            data-story-description
            className="story-description mx-auto mt-5 max-w-xl text-foreground/70"
          >
            {STORY_INTRO.description}
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
