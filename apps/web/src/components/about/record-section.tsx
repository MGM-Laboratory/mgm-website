import { ACHIEVEMENT, ACHIEVEMENT_CAVEAT, PROJECTS } from "@/data/about-content";
import { SourceMarks, TierChip } from "./cite";
import { RevealSection } from "./reveal-section";

export function RecordSection() {
  return (
    <section id="record" className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <RevealSection className="mx-auto max-w-3xl" stagger={0.06}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-blue uppercase opacity-0">
          Projects &amp; outputs
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          What was actually shipped or shown
        </h2>

        <div className="mt-10 flex flex-col gap-5">
          {PROJECTS.map((project) => (
            <div
              key={project.name}
              data-tier={project.tier}
              className="reveal-item rounded-2xl border border-[var(--line)] p-5 opacity-0 dark:border-white/10"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-[var(--ink)] dark:text-white">{project.name}</h3>
                <TierChip tier={project.tier} />
              </div>
              <p className="mt-2 text-sm text-[var(--ink-2)] dark:text-white/65">
                {project.documented}
                <SourceMarks ids={project.sourceIds} />
              </p>
              <p className="mt-2 border-t border-[var(--line)] pt-2 text-xs text-[var(--ink-3)] dark:border-white/10 dark:text-white/45">
                Status boundary — {project.boundary}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-14">
          <div className="reveal-item flex items-baseline justify-between gap-2 opacity-0">
            <h3 className="font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
              The one documented award
            </h3>
            <TierChip tier={ACHIEVEMENT.tier} />
          </div>
          <div
            data-tier={ACHIEVEMENT.tier}
            className="reveal-item mt-5 rounded-2xl border-2 border-[var(--tier-color)] p-6 opacity-0"
          >
            <p className="text-[var(--ink)] dark:text-white">
              {ACHIEVEMENT.text}
              <SourceMarks ids={ACHIEVEMENT.sourceIds} />
            </p>
          </div>
          <p
            data-tier={ACHIEVEMENT_CAVEAT.tier}
            className="reveal-item mt-3 max-w-xl text-sm text-[var(--ink-3)] opacity-0 dark:text-white/45"
          >
            {ACHIEVEMENT_CAVEAT.text}
            <SourceMarks ids={ACHIEVEMENT_CAVEAT.sourceIds} />
          </p>
        </div>
      </RevealSection>
    </section>
  );
}
