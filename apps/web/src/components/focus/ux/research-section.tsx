import { RevealSection } from "@/components/about/reveal-section";
import { RESEARCH_NOTE, RESEARCH_POINTS } from "@/data/ux-focus";

export function ResearchSection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] bg-background px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.08}
    >
      <div id="research" className="mx-auto max-w-6xl scroll-mt-24">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-foreground/60 uppercase">
          Research, not guesses
        </p>
        <h2 className="reveal-item opacity-0 mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Every design decision has to survive contact with a real person.
        </h2>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {RESEARCH_POINTS.map((point) => (
            <div
              key={point.label}
              className="reveal-item opacity-0 rounded-lg border border-[var(--line)] p-6"
            >
              <span className="inline-block size-2.5 rounded-full bg-brand-yellow" />
              <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
                {point.label}
              </h3>
              <p className="mt-2 text-sm text-foreground/65">{point.body}</p>
            </div>
          ))}
        </div>

        <p className="reveal-item opacity-0 mt-10 max-w-2xl border-l-2 border-brand-yellow pl-4 text-sm text-foreground/60">
          {RESEARCH_NOTE}
        </p>
      </div>
    </RevealSection>
  );
}
