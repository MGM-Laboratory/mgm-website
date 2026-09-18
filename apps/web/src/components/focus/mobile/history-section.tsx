import { RevealSection } from "@/components/about/reveal-section";
import { PatternTile, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";
import { HISTORY_HIGHLIGHTS } from "@/data/mobile-focus";

// Same "image" treatment as /about's story timeline — an alternating
// image+text row per item — except there's no real photo for a 2016 iPad
// pilot, so a brand pattern tile stands in for the picture instead of
// sourcing one.
const TILES: { kind: PatternKind; tone: PatternTone }[] = [
  { kind: "arcs", tone: "red" },
  { kind: "square", tone: "blue" },
  { kind: "leaves", tone: "green" },
];

// Unlike /website, this page can't point at itself as proof — so instead of
// a "built here" trick, it closes on real documented history: work this lab
// actually shipped, dated and sourced, not an invented showcase.
export function HistorySection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16"
      stagger={0.1}
    >
      <div className="mx-auto max-w-3xl">
        <p className="reveal-item font-mono text-xs font-semibold tracking-[0.14em] text-brand-red uppercase opacity-0">
          Some of it, on record
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
          We&apos;ve been shipping to phones for a while.
        </h2>

        <div className="mt-14 flex flex-col gap-16 sm:gap-20">
          {HISTORY_HIGHLIGHTS.map((item, i) => {
            const tile = TILES[i % TILES.length]!;
            return (
              <div
                key={item.title}
                className={`reveal-item flex flex-col items-center gap-6 opacity-0 sm:gap-10 ${
                  i % 2 === 1 ? "sm:flex-row-reverse" : "sm:flex-row"
                }`}
              >
                <div className="w-full max-w-[220px] shrink-0 sm:max-w-[260px]">
                  <PatternTile
                    kind={tile.kind}
                    bg="canvas"
                    fg={tile.tone}
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
            );
          })}
        </div>
      </div>
    </RevealSection>
  );
}
