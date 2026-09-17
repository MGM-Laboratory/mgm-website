import { QUICK_FACTS } from "@/data/about-content";
import { SourceMarks, TierChip } from "./cite";
import { RevealSection } from "./reveal-section";

export function IdentitySection() {
  return (
    <section className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <RevealSection className="mx-auto max-w-3xl">
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-blue uppercase opacity-0">
          Identity &amp; mandate
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          A faculty laboratory, not yet a settled name
        </h2>
        <p className="reveal-item mt-5 max-w-xl text-[var(--ink-2)] opacity-0 dark:text-white/65">
          FILKOM frames the lab&apos;s core function as practice and applied research — practicum,
          thesis work, simulation, and research collaboration — supporting teaching, research, and
          community service. Even the name has moved: &ldquo;Media, Games and Mobile
          Technologies&rdquo; in older sources, &ldquo;Laboratorium Media Game dan Mobile&rdquo; on
          the current faculty page.
        </p>

        <dl className="mt-10 flex flex-col divide-y divide-[var(--line)] dark:divide-white/10">
          {QUICK_FACTS.map((fact) => (
            <div
              key={fact.label}
              data-tier={fact.tier}
              className="reveal-item grid grid-cols-1 gap-1.5 py-4 opacity-0 sm:grid-cols-[11rem_1fr] sm:items-baseline sm:gap-4"
            >
              <dt className="text-xs font-semibold tracking-wide text-[var(--ink-3)] uppercase dark:text-white/40">
                {fact.label}
              </dt>
              <dd className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[var(--ink)] dark:text-white/85">
                <span>
                  {fact.text}
                  <SourceMarks ids={fact.sourceIds} />
                </span>
                <TierChip tier={fact.tier} />
              </dd>
            </div>
          ))}
        </dl>
      </RevealSection>
    </section>
  );
}
