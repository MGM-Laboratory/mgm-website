import { RevealSection } from "@/components/about/reveal-section";
import { CompetencyMotifShape } from "@/components/sections/competency-motif";
import { BANDOAR_HIGHLIGHT } from "@/data/game-focus";

// One real, documented highlight instead of an invented showcase — a lab
// member's actual award (see mgm.md [S11]), framed as history, not a live
// product.
export function BandoarSection() {
  return (
    <RevealSection className="border-t border-[var(--line)] bg-background px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="reveal-item font-mono text-xs font-semibold tracking-[0.14em] text-brand-green uppercase opacity-0">
          From the archive
        </p>
        <h2 className="reveal-item mt-3 font-display text-3xl font-semibold tracking-tight text-foreground opacity-0 sm:text-4xl">
          Real work, recognized on a real stage.
        </h2>

        <div className="reveal-item relative mx-auto mt-10 max-w-lg overflow-hidden rounded-lg border border-[var(--line)] p-8 text-left opacity-0">
          <CompetencyMotifShape
            motif="chevron"
            stroke="var(--brand-green)"
            className="-top-6 -right-6 size-28 opacity-[0.12]"
          />
          <h3 className="relative font-display text-2xl font-semibold text-foreground">
            {BANDOAR_HIGHLIGHT.title}
          </h3>
          <p className="relative mt-1.5 text-xs font-semibold tracking-wide text-brand-green uppercase">
            {BANDOAR_HIGHLIGHT.meta}
          </p>
          <p className="relative mt-4 text-sm text-foreground/65">{BANDOAR_HIGHLIGHT.body}</p>
        </div>
      </div>
    </RevealSection>
  );
}
