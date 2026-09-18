import { RevealSection } from "@/components/about/reveal-section";
import { HISTORY_HIGHLIGHTS } from "@/data/mobile-focus";

// Unlike /website, this page can't point at itself as proof — so instead of
// a "built here" trick, it closes on real documented history: work this lab
// actually shipped, dated and sourced, not an invented showcase.
export function HistorySection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] bg-background px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.08}
    >
      <div className="mx-auto max-w-6xl">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-brand-red uppercase">
          Some of it, on record
        </p>
        <h2 className="reveal-item opacity-0 mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          We&apos;ve been shipping to phones for a while.
        </h2>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {HISTORY_HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className="reveal-item opacity-0 rounded-lg border border-[var(--line)] p-6"
            >
              <p className="font-mono text-xs font-semibold tracking-wide text-brand-red uppercase">
                {item.tag}
              </p>
              <h3 className="mt-2 font-display text-lg font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-3 text-sm text-foreground/65">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
