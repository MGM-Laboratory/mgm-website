import { RevealSection } from "@/components/about/reveal-section";
import { PatternTile, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";

export type StoryRowItem = {
  tag: string;
  title: string;
  body: string;
  pattern: PatternKind;
  tone: PatternTone;
};

// Real, documented lab history laid out exactly like /about's story
// timeline — an alternating image+text row per item, a brand pattern tile
// standing in for a photo since none exists for this content. Works for a
// single highlight too (mobile has several; game has one) since a lone
// item simply never reaches the alternating i % 2 === 1 case.
export function FocusStoryRows({
  eyebrow,
  eyebrowClassName = "text-brand-blue",
  headline,
  items,
}: {
  eyebrow: string;
  eyebrowClassName?: string;
  headline: string;
  items: StoryRowItem[];
}) {
  return (
    <RevealSection
      className="border-t border-[var(--line)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16"
      stagger={0.1}
    >
      <div className="mx-auto max-w-3xl">
        <p
          className={`reveal-item font-mono text-xs font-semibold tracking-[0.14em] uppercase opacity-0 ${eyebrowClassName}`}
        >
          {eyebrow}
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
          {headline}
        </h2>

        <div className="mt-14 flex flex-col gap-16 sm:gap-20">
          {items.map((item, i) => (
            <div
              key={item.title}
              className={`reveal-item flex flex-col items-center gap-6 opacity-0 sm:gap-10 ${
                i % 2 === 1 ? "sm:flex-row-reverse" : "sm:flex-row"
              }`}
            >
              <div className="w-full max-w-[220px] shrink-0 sm:max-w-[260px]">
                <PatternTile
                  kind={item.pattern}
                  bg="canvas"
                  fg={item.tone}
                  className="aspect-square w-full overflow-hidden rounded-3xl"
                />
              </div>
              <div>
                <p className="font-mono text-xs font-semibold tracking-wide text-foreground/45 uppercase">
                  {item.tag}
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 max-w-md text-foreground/65">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
