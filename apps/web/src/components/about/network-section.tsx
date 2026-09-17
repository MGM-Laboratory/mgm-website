import { PARTNERS } from "@/data/about-content";
import { SourceMarks, TierChip } from "./cite";
import { RevealSection } from "./reveal-section";

export function NetworkSection() {
  return (
    <section
      id="network"
      className="bg-[var(--surface-muted)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16"
    >
      <RevealSection className="mx-auto max-w-3xl">
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-green uppercase opacity-0">
          Collaborators &amp; partners
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          Contact isn&apos;t the same as partnership
        </h2>
        <p className="reveal-item mt-5 max-w-xl text-[var(--ink-2)] opacity-0 dark:text-white/65">
          A visit, a discussion, and a signed agreement are three different things — the record
          keeps them separate here instead of flattening every named organization into
          &ldquo;partner.&rdquo;
        </p>

        <div className="mt-10 flex flex-col divide-y divide-[var(--line)] dark:divide-white/10">
          {PARTNERS.map((partner) => (
            <div
              key={partner.name}
              data-tier={partner.tier}
              className="reveal-item flex flex-col gap-2 py-5 opacity-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <div className="sm:max-w-[13rem] sm:shrink-0">
                <p className="font-semibold text-[var(--ink)] dark:text-white">{partner.name}</p>
                <TierChip tier={partner.tier} className="mt-1.5" />
              </div>
              <p className="text-sm text-[var(--ink-2)] sm:flex-1 dark:text-white/60">
                {partner.relationship}
                <SourceMarks ids={partner.sourceIds} />
              </p>
            </div>
          ))}
        </div>
      </RevealSection>
    </section>
  );
}
