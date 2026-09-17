import { RESEARCH_AREAS, SQUADS_2019, SQUADS_CAVEAT } from "@/data/about-content";
import { SourceMarks, TierChip } from "./cite";
import { RevealSection } from "./reveal-section";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function ResearchSection() {
  return (
    <section id="research-scope" className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <RevealSection className="mx-auto max-w-4xl" stagger={0.06}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-red uppercase opacity-0">
          Research scope
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          Seven listed areas, unevenly substantiated
        </h2>
        <p className="reveal-item mt-5 max-w-xl text-[var(--ink-2)] opacity-0 dark:text-white/65">
          The lab&apos;s research page names seven interests. These are topics, not a verified
          administrative division chart — some are backed by named projects and people, others are a
          label with nothing public underneath it yet.
        </p>

        <ol className="mt-10 flex flex-col divide-y divide-[var(--line)] dark:divide-white/10">
          {RESEARCH_AREAS.map((area, i) => (
            <li
              key={area.name}
              data-tier={area.tier}
              className="reveal-item flex flex-col gap-2 py-5 opacity-0 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="font-mono text-sm text-[var(--ink-4)] tabular-nums sm:w-8 sm:shrink-0">
                {pad(i + 1)}
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-[var(--ink)] dark:text-white">
                    {area.name}
                  </h3>
                  <TierChip tier={area.tier} />
                </div>
                <p className="mt-1.5 text-sm text-[var(--ink-2)] dark:text-white/60">
                  {area.note}
                  <SourceMarks ids={area.sourceIds} />
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-14">
          <div className="reveal-item flex flex-wrap items-baseline justify-between gap-2 opacity-0">
            <h3 className="font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
              2019&apos;s recruiting squads
            </h3>
            <TierChip tier={SQUADS_CAVEAT.tier} />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {SQUADS_2019.map((squad) => (
              <div
                key={squad.name}
                data-tier={squad.tier}
                className="reveal-item rounded-2xl border border-[var(--line)] p-5 opacity-0 dark:border-white/10"
              >
                <p className="font-semibold text-[var(--ink)] dark:text-white">
                  {squad.name}
                  <SourceMarks ids={squad.sourceIds} />
                </p>
                <p className="mt-2 text-sm text-[var(--ink-2)] dark:text-white/60">
                  {squad.seeking}
                </p>
              </div>
            ))}
          </div>
          <p className="reveal-item mt-4 max-w-xl text-sm text-[var(--ink-3)] opacity-0 dark:text-white/45">
            {SQUADS_CAVEAT.text}
            <SourceMarks ids={SQUADS_CAVEAT.sourceIds} />
          </p>
        </div>
      </RevealSection>
    </section>
  );
}
