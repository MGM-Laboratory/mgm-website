import { FinaleBlock } from "@/components/story/finale-block";
import { PanelArt, WavingArt } from "@/components/story/storybook/panel-art";
import { StoryCard } from "@/components/story/storybook/story-card";
import { STORY_CARDS, STORY_INTRO, STORY_PANELS } from "@/data/story";

/**
 * The storybook: the story told in the DOM, for everyone the WebGL story
 * does not reach (no JavaScript, reduced motion, no hardware WebGL2, a lost
 * context, a renderer that cannot keep up, `?nostory`, crawlers, CI and
 * Lighthouse). The same content in about three to four screens: the
 * Competencies title and line, the four cards as real links, the story
 * after the cards as stills with a caption each, and the finale. It is the
 * section's server HTML, shown by default and hidden once the boot script
 * picks the WebGL story (`html[data-story-mode="gl"]`).
 */
export function Storybook() {
  return (
    <div data-storybook className="px-6 pt-24 pb-10 sm:px-10 sm:pt-32 lg:px-14">
      <div className="mx-auto max-w-[90rem]">
        <header className="text-center">
          <h2
            id="storybook-title"
            className="story-title mx-auto w-fit font-display font-semibold text-foreground"
          >
            {STORY_INTRO.title}
          </h2>
          <p className="story-description mx-auto mt-5 max-w-xl text-foreground/70">
            {STORY_INTRO.description}
          </p>
        </header>

        <ul
          data-storybook-cards
          className="mx-auto mt-14 grid max-w-6xl grid-cols-2 gap-5 sm:mt-20 sm:gap-7 lg:grid-cols-4"
        >
          {STORY_CARDS.map((card) => (
            <li key={card.id}>
              <StoryCard card={card} />
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-28 max-w-6xl sm:mt-36">
          <h2 className="font-mono text-xs tracking-[0.18em] text-foreground/65 uppercase">
            What happens next
          </h2>
          <ol className="mt-6 grid grid-cols-1 gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {STORY_PANELS.map((panel, index) => (
              <li key={panel.id} data-storybook-panel={panel.id} className="story-panel">
                <div className="story-panel-art" data-panel={panel.id}>
                  <PanelArt id={panel.id} />
                </div>
                <h3 className="mt-4 flex items-baseline gap-3 font-display text-xl font-semibold tracking-tight text-foreground">
                  <span className="font-mono text-xs font-normal text-foreground/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {panel.title}
                </h3>
                <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-foreground/70">
                  {panel.caption}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <FinaleBlock
          headingId="storybook-finale-title"
          className="story-finale-book mt-28 sm:mt-36"
        >
          <div data-storybook-finale className="story-finale-art">
            <WavingArt />
          </div>
        </FinaleBlock>
      </div>
    </div>
  );
}
