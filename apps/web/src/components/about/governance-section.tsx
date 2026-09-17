import {
  CORE_MEMBERS,
  CORE_MEMBERS_NOTE,
  HEADCOUNT_UNVERIFIED,
  HEADSHIP_CONFLICT,
  HEADSHIP_NOTE,
  ROSTER_SNAPSHOT,
} from "@/data/about-content";
import { SourceMarks, TierChip } from "./cite";
import { RevealSection } from "./reveal-section";

export function GovernanceSection() {
  return (
    <section
      id="governance"
      className="bg-[var(--surface-muted)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16"
    >
      <RevealSection className="mx-auto max-w-4xl" stagger={0.05}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-yellow uppercase opacity-0">
          People &amp; governance
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          Two institutional pages, two different heads
        </h2>
        <p className="reveal-item mt-5 max-w-xl text-[var(--ink-2)] opacity-0 dark:text-white/65">
          We&apos;re not resolving this for you — both claims come from a named institutional
          source, and both are shown as-is.
        </p>

        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 dark:border-white/10 dark:bg-white/10">
          {HEADSHIP_CONFLICT.map((claim) => (
            <div
              key={claim.source}
              data-tier="confirmed"
              className="reveal-item bg-background p-6 opacity-0 dark:bg-[#15181e]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-wide text-[var(--ink-3)] uppercase dark:text-white/40">
                  {claim.source}
                </p>
                <TierChip tier="confirmed" />
              </div>
              <p className="mt-3 text-lg font-semibold text-[var(--ink)] dark:text-white">
                {claim.claim}
                <SourceMarks ids={claim.sourceIds} />
              </p>
            </div>
          ))}
        </div>

        <p
          data-tier={HEADSHIP_NOTE.tier}
          className="reveal-item mt-4 max-w-xl text-sm text-[var(--ink-3)] opacity-0 dark:text-white/50"
        >
          {HEADSHIP_NOTE.text}
          <SourceMarks ids={HEADSHIP_NOTE.sourceIds} />
        </p>

        <div className="mt-14">
          <div className="reveal-item flex items-baseline justify-between gap-2 opacity-0">
            <h3 className="font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
              Named lab members
            </h3>
            <TierChip tier={CORE_MEMBERS_NOTE.tier} />
          </div>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CORE_MEMBERS.map((member) => (
              <li
                key={member.name}
                className="reveal-item rounded-xl border border-[var(--line)] bg-background p-4 opacity-0 dark:border-white/10 dark:bg-transparent"
              >
                <p className="text-sm font-semibold text-[var(--ink)] dark:text-white">
                  {member.name}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-3)] dark:text-white/45">
                  {member.focus}
                </p>
              </li>
            ))}
          </ul>
          <p className="reveal-item mt-4 max-w-xl text-sm text-[var(--ink-3)] opacity-0 dark:text-white/45">
            {CORE_MEMBERS_NOTE.text}
            <SourceMarks ids={CORE_MEMBERS_NOTE.sourceIds} />
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div
            data-tier={ROSTER_SNAPSHOT.tier}
            className="reveal-item rounded-2xl border border-[var(--line)] p-5 opacity-0 dark:border-white/10"
          >
            <TierChip tier={ROSTER_SNAPSHOT.tier} />
            <p className="mt-2.5 text-sm text-[var(--ink-2)] dark:text-white/65">
              {ROSTER_SNAPSHOT.text}
              <SourceMarks ids={ROSTER_SNAPSHOT.sourceIds} />
            </p>
          </div>
          <div
            data-tier={HEADCOUNT_UNVERIFIED.tier}
            className="reveal-item rounded-2xl border border-[var(--line)] p-5 opacity-0 dark:border-white/10"
          >
            <TierChip tier={HEADCOUNT_UNVERIFIED.tier} />
            <p className="mt-2.5 text-sm text-[var(--ink-2)] dark:text-white/65">
              {HEADCOUNT_UNVERIFIED.text}
              <SourceMarks ids={HEADCOUNT_UNVERIFIED.sourceIds} />
            </p>
          </div>
        </div>
      </RevealSection>
    </section>
  );
}
