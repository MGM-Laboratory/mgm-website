import Link from "next/link";

import type { Member } from "@/data/members";
import {
  latestMilestone,
  RESEARCH_AREA_LABELS,
  RESEARCH_STATUS_LABELS,
  researchMembers,
  formatResearchDateShort,
  type CmsResearchRecord,
  type ResearchArea,
  type ResearchStatus,
} from "@/lib/research-cms";

const AREA_BADGES: Record<ResearchArea, string> = {
  website: "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]",
  mobile: "bg-brand-yellow-50 text-[#a97b1c] dark:bg-brand-yellow/15 dark:text-[#e3c36a]",
  "hci-ux": "bg-brand-red-50 text-brand-red dark:bg-brand-red/15 dark:text-[#ef9a9a]",
  "game-xr": "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#7cc9a5]",
};

const STATUS_BADGES: Record<ResearchStatus, string> = {
  exploring: "bg-[var(--surface-muted)] text-[var(--ink-2)] dark:bg-white/10 dark:text-white/75",
  active: "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]",
  completed: "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#7cc9a5]",
};

/** A short sample of the linked outputs plus a "+ N more" indicator. */
function OutputSample({ record }: { record: CmsResearchRecord }) {
  const outputs = record.research.outputs;
  if (!outputs.length) return null;
  const shown = outputs.slice(0, 3);
  const rest = outputs.length - shown.length;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--ink-3)]">
      {shown.map((output) => (
        <span
          className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium dark:bg-white/[0.06] dark:text-white/50"
          key={output.id}
        >
          {output.label}
        </span>
      ))}
      {rest > 0 ? (
        <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--ink-3)] uppercase">
          +{rest} more
        </span>
      ) : null}
    </p>
  );
}

/**
 * The research explorer: every published initiative, newest activity first.
 * Server rendered with the rest of the page; each row links to the full
 * initiative.
 */
export function ResearchExplorer({
  members,
  records,
}: {
  members: readonly Member[];
  records: readonly CmsResearchRecord[];
}) {
  const visible = [...records].sort((left, right) =>
    (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
  );

  return (
    <div>
      {visible.length ? (
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)] dark:divide-white/10 dark:border-white/10">
          {visible.map((record) => {
            const research = record.research;
            const milestone = latestMilestone(research);
            const involved = researchMembers(record, members);
            return (
              <li key={record.slug}>
                <Link
                  className="group block px-1 py-7 transition hover:bg-[var(--surface-muted)]/60 sm:px-2 dark:hover:bg-white/[0.02]"
                  href={`/research/${record.slug}`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${STATUS_BADGES[research.status]}`}
                    >
                      {RESEARCH_STATUS_LABELS[research.status]}
                    </span>
                    {research.areas.map((entry) => (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${AREA_BADGES[entry]}`}
                        key={entry}
                      >
                        {RESEARCH_AREA_LABELS[entry]}
                      </span>
                    ))}
                  </div>
                  <h3 className="mt-3 font-display text-[1.375rem] leading-snug font-semibold tracking-[-0.015em] text-[#0e1116] transition group-hover:text-brand-red dark:text-white">
                    {research.title}
                  </h3>
                  <p className="mt-2 border-l-2 border-brand-red/40 pl-3 text-[15px] leading-6 text-[var(--ink-2)] dark:text-white/70">
                    {research.question}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-2)] dark:text-white/60">
                    {research.summary}
                  </p>
                  {involved.length ? (
                    <p className="mt-3 text-[13px] text-[var(--ink-3)]">
                      {involved.map((member) => member.name).join(", ")}
                    </p>
                  ) : null}
                  {milestone ? (
                    <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[13px] text-[var(--ink-3)]">
                      <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--ink-3)] uppercase">
                        {formatResearchDateShort(milestone.date)}
                      </span>
                      <span className="font-semibold text-[var(--ink-2)] dark:text-white/70">
                        Latest: {milestone.title}
                      </span>
                    </p>
                  ) : null}
                  <OutputSample record={record} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center dark:border-white/10">
          <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
            Research initiatives will appear here as studies begin.
          </p>
          <p className="mt-2 text-[var(--ink-3)]">
            Each initiative carries its question, methods, members, and the milestones that mark
            real progress.
          </p>
        </div>
      )}
    </div>
  );
}
