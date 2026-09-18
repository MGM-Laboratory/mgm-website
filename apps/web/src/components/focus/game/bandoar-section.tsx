import { RevealSection } from "@/components/about/reveal-section";
import { PatternTile } from "@/components/process/pattern-tile";
import { BANDOAR_HIGHLIGHT } from "@/data/game-focus";

// One real, documented highlight instead of an invented showcase — a lab
// member's actual award (see mgm.md [S11]), framed as history, not a live
// product. Same image+text row as /about's story beats — no real photo of a
// 2018 conference paper exists here, so a brand pattern tile stands in.
export function BandoarSection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16"
      stagger={0.1}
    >
      <div className="mx-auto max-w-3xl">
        <p className="reveal-item font-mono text-xs font-semibold tracking-[0.14em] text-brand-green uppercase opacity-0">
          From the archive
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
          Real work, recognized on a real stage.
        </h2>

        <div className="reveal-item mt-14 flex flex-col items-center gap-6 opacity-0 sm:flex-row sm:gap-10">
          <div className="w-full max-w-[220px] shrink-0 sm:max-w-[260px]">
            <PatternTile
              kind="quads"
              bg="canvas"
              fg="green"
              className="aspect-square w-full overflow-hidden rounded-3xl"
            />
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold text-foreground">
              {BANDOAR_HIGHLIGHT.title}
            </h3>
            <p className="mt-1.5 text-xs font-semibold tracking-wide text-brand-green uppercase">
              {BANDOAR_HIGHLIGHT.meta}
            </p>
            <p className="mt-3 max-w-md text-foreground/65">{BANDOAR_HIGHLIGHT.body}</p>
          </div>
        </div>
      </div>
    </RevealSection>
  );
}
