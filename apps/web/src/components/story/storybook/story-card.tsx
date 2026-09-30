import Link from "next/link";

import type { StoryCard as StoryCardData, StoryCardId } from "@/data/story";

/**
 * One competency as a real DOM playing card: a white face with a thin ink
 * border, corner indices, the division logo as the big visual on the top
 * half, the title and one line under it. Used by the storybook; the WebGL
 * story draws its own fronts.
 */

/** Each logo's ink box inside its 2000 x 2000 frame, so the four read at the same weight. */
const INK_BOXES: ReadonlyMap<StoryCardId, string> = new Map([
  ["website", "276 620 1447 760"],
  ["mobile", "638 432 723 1136"],
  ["game", "240 515 1520 970"],
  ["ux", "466 452 1067 1151"],
]);

const INDEX: ReadonlyMap<StoryCardId, string> = new Map([
  ["website", "W"],
  ["mobile", "M"],
  ["game", "G"],
  ["ux", "UX"],
]);

export function StoryCard({ card }: Readonly<{ card: StoryCardData }>) {
  const index = INDEX.get(card.id) ?? card.title.slice(0, 1);
  return (
    <Link
      href={card.href}
      data-story-card={card.id}
      data-accent={card.accent}
      className="story-card group block rounded-[1.1rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]"
    >
      <div className="story-card-face">
        <div aria-hidden className="story-card-index story-card-index-top">
          <span>{index}</span>
          <span className="story-card-pip" />
        </div>
        <div aria-hidden className="story-card-index story-card-index-bottom">
          <span>{index}</span>
          <span className="story-card-pip" />
        </div>
        <div aria-hidden className="story-card-visual">
          <svg viewBox={INK_BOXES.get(card.id) ?? "0 0 2000 2000"} className="h-full w-full">
            <image href={card.logo} x="0" y="0" width="2000" height="2000" />
          </svg>
        </div>
        <div className="story-card-copy">
          <h3 className="font-display text-[clamp(1.35rem,2.1vw,1.9rem)] leading-none font-semibold tracking-tight text-[#0e1116]">
            {card.title}
          </h3>
          <p className="mt-2 text-[0.8125rem] leading-snug text-[#3b4150]">{card.line}</p>
        </div>
      </div>
    </Link>
  );
}
