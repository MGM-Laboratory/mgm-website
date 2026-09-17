import { GROWTH_INFERENCE, TIMELINE } from "@/data/about-content";
import { SourceMarks, TierChip } from "./cite";
import { RevealSection } from "./reveal-section";

export function HistorySection() {
  return (
    <section
      id="history"
      className="bg-[var(--surface-muted)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16"
    >
      <RevealSection className="mx-auto max-w-3xl" stagger={0.1}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-green uppercase opacity-0">
          History &amp; growth
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          A documented lineage, not a founding date
        </h2>
        <p className="reveal-item mt-5 max-w-xl text-[var(--ink-2)] opacity-0 dark:text-white/65">
          The record supports a PAPB → MGM lineage running back to at least 2015–2016. It does not
          supply a rename decree, a founding date, or an audited growth curve — so this timeline
          shows what was actually documented at each point, not a story shaped to look continuous.
        </p>

        <ol className="relative mt-12 flex flex-col gap-10 border-l-2 border-[var(--line-strong)] pl-8 dark:border-white/15">
          {TIMELINE.map((entry) => (
            <li
              key={entry.period}
              data-tier={entry.tier}
              className="reveal-item relative opacity-0"
            >
              <span
                className="absolute top-1.5 -left-8 size-2.5 -translate-x-1/2 rounded-full"
                style={{ background: "var(--tier-color)" }}
                aria-hidden
              />
              <p className="font-mono text-xs font-semibold text-[var(--ink-3)] dark:text-white/45">
                {entry.period}
              </p>
              <p className="mt-1.5 text-[var(--ink)] dark:text-white/85">
                {entry.milestone}
                <SourceMarks ids={entry.sourceIds} />
              </p>
              <p className="mt-2 text-sm text-[var(--ink-3)] dark:text-white/50">{entry.meaning}</p>
            </li>
          ))}
        </ol>

        <div
          data-tier={GROWTH_INFERENCE.tier}
          className="reveal-item mt-10 rounded-2xl border border-[var(--line)] p-5 opacity-0 dark:border-white/10"
        >
          <div className="flex flex-wrap items-center gap-2">
            <TierChip tier={GROWTH_INFERENCE.tier} />
            <p className="text-xs font-semibold tracking-wide text-[var(--ink-3)] uppercase dark:text-white/40">
              What &ldquo;growth&rdquo; means here
            </p>
          </div>
          <p className="mt-2.5 text-sm text-[var(--ink-2)] dark:text-white/70">
            {GROWTH_INFERENCE.text}
            <SourceMarks ids={GROWTH_INFERENCE.sourceIds} />
          </p>
        </div>
      </RevealSection>
    </section>
  );
}
