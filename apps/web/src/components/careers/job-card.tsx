import { ArrowRight } from "lucide-react";
import Link from "next/link";

import {
  COMMITMENT_LABELS,
  MODE_LABELS,
  daysUntilDeadline,
  formatJobDeadline,
  type CmsJobRecord,
} from "@/lib/career-cms";

export function JobCard({ record }: { record: CmsJobRecord }) {
  const { job } = record;
  const days = daysUntilDeadline(job);
  const closingSoon = days >= 0 && days <= 7;
  const visiblePerks = job.perks.slice(0, 4);
  const extraPerks = job.perks.length - visiblePerks.length;

  return (
    <Link
      className="group flex h-full min-w-0 flex-col rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-1)] transition hover:border-brand-yellow/60 dark:bg-white/[0.045]"
      href={`/careers/${job.slug}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-brand-yellow-50 px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] text-[#8a6a1a] uppercase dark:bg-brand-yellow/15 dark:text-[#eed27f]">
          {job.focus}
        </span>
        {closingSoon ? (
          <span className="rounded-full bg-brand-red-50 px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] text-brand-red uppercase dark:bg-brand-red/15 dark:text-[#f09a9a]">
            {days === 0 ? "Closes today" : `Closes in ${days}d`}
          </span>
        ) : null}
      </div>

      <h2 className="mt-4 font-display text-[1.375rem] leading-snug font-medium text-[#0e1116] transition group-hover:text-brand-blue dark:text-white">
        {job.title}
      </h2>

      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm text-[var(--ink-2)] dark:text-[#c3c7d1]">
        <span>{COMMITMENT_LABELS[job.commitment]}</span>
        <span aria-hidden="true">·</span>
        <span>{MODE_LABELS[job.mode]}</span>
        <span aria-hidden="true">·</span>
        <span>Deadline {formatJobDeadline(job.deadline)}</span>
      </p>

      {visiblePerks.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {visiblePerks.map((perk) => (
            <span
              className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-2)] dark:bg-white/[0.07] dark:text-[#c3c7d1]"
              key={perk}
            >
              {perk}
            </span>
          ))}
          {extraPerks > 0 ? (
            <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-2)] dark:bg-white/[0.07] dark:text-[#c3c7d1]">
              +{extraPerks}
            </span>
          ) : null}
        </div>
      ) : null}

      <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-semibold text-brand-blue">
        View role
        <ArrowRight
          aria-hidden="true"
          className="transition-transform group-hover:translate-x-0.5"
          size={15}
          strokeWidth={2.25}
        />
      </span>
    </Link>
  );
}
