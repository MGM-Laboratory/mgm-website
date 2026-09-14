"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Member } from "@/data/members";
import {
  latestMilestone,
  RESEARCH_AREA_LABELS,
  RESEARCH_AREAS,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_LABELS,
  researchMembers,
  researchYear,
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

function filterPillClass(active: boolean) {
  return `rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
    active
      ? "bg-[#0e1116] text-white dark:bg-white dark:text-[#0e1116]"
      : "bg-[var(--surface-muted)] text-[var(--ink-2)] hover:text-[var(--ink)] dark:bg-white/[0.06] dark:text-white/60 dark:hover:text-white"
  }`;
}

/**
 * The research explorer: filters published initiatives by focus area,
 * status, and year. Filtering happens in the browser over the already
 * server-rendered feed, so the page stays server-rendered and this stays
 * a small isolated client island.
 */
export function ResearchExplorer({
  initialArea,
  members,
  records,
}: {
  initialArea?: ResearchArea | "all";
  members: readonly Member[];
  records: readonly CmsResearchRecord[];
}) {
  const [area, setArea] = useState<ResearchArea | "all">(initialArea ?? "all");
  const [status, setStatus] = useState<ResearchStatus | "all">("all");
  const [year, setYear] = useState<string | "all">("all");

  // Follows focus-area card links like /research?area=website#explorer.
  // Adjusted during render (not in an effect) so a navigation with a new
  // area filter re-renders with the right filter without a flash of stale
  // results; other filters are kept.
  const [previousInitialArea, setPreviousInitialArea] = useState(initialArea);
  if (previousInitialArea !== initialArea) {
    setPreviousInitialArea(initialArea);
    setArea(initialArea ?? "all");
  }

  const years = useMemo(() => {
    const found = new Set<string>();
    for (const record of records) {
      const value = researchYear(record.research);
      if (value) found.add(value);
    }
    return [...found].sort((left, right) => right.localeCompare(left));
  }, [records]);

  const visible = useMemo(
    () =>
      records.filter((record) => {
        const research = record.research;
        if (area !== "all" && !research.areas.includes(area)) return false;
        if (status !== "all" && research.status !== status) return false;
        if (year !== "all" && researchYear(research) !== year) return false;
        return true;
      }),
    [area, records, status, year],
  );

  return (
    <div>
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span
            className="text-[11px] font-bold tracking-[0.08em] text-[var(--ink-3)] uppercase"
            id="research-area-filter"
          >
            Focus area
          </span>
          <div
            aria-labelledby="research-area-filter"
            className="flex flex-wrap gap-1.5"
            role="group"
          >
            <button
              aria-pressed={area === "all"}
              className={filterPillClass(area === "all")}
              onClick={() => setArea("all")}
              type="button"
            >
              All areas · {records.length}
            </button>
            {RESEARCH_AREAS.map((entry) => {
              const count = records.filter((record) =>
                record.research.areas.includes(entry),
              ).length;
              if (!count) return null;
              return (
                <button
                  aria-pressed={area === entry}
                  className={filterPillClass(area === entry)}
                  key={entry}
                  onClick={() => setArea(entry)}
                  type="button"
                >
                  {RESEARCH_AREA_LABELS[entry]} · {count}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span
            className="text-[11px] font-bold tracking-[0.08em] text-[var(--ink-3)] uppercase"
            id="research-status-filter"
          >
            Status
          </span>
          <div
            aria-labelledby="research-status-filter"
            className="flex flex-wrap gap-1.5"
            role="group"
          >
            <button
              aria-pressed={status === "all"}
              className={filterPillClass(status === "all")}
              onClick={() => setStatus("all")}
              type="button"
            >
              All statuses · {records.length}
            </button>
            {RESEARCH_STATUSES.map((entry) => {
              const count = records.filter((record) => record.research.status === entry).length;
              if (!count) return null;
              return (
                <button
                  aria-pressed={status === entry}
                  className={filterPillClass(status === entry)}
                  key={entry}
                  onClick={() => setStatus(entry)}
                  type="button"
                >
                  {RESEARCH_STATUS_LABELS[entry]} · {count}
                </button>
              );
            })}
          </div>
        </div>
        {years.length ? (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span
              className="text-[11px] font-bold tracking-[0.08em] text-[var(--ink-3)] uppercase"
              id="research-year-filter"
            >
              Year
            </span>
            <div
              aria-labelledby="research-year-filter"
              className="flex flex-wrap gap-1.5"
              role="group"
            >
              <button
                aria-pressed={year === "all"}
                className={filterPillClass(year === "all")}
                onClick={() => setYear("all")}
                type="button"
              >
                All years
              </button>
              {years.map((entry) => (
                <button
                  aria-pressed={year === entry}
                  className={filterPillClass(year === entry)}
                  key={entry}
                  onClick={() => setYear(entry)}
                  type="button"
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-8">
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
                    {research.outputs.length ? (
                      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[var(--ink-3)]">
                        {research.outputs.map((output) => (
                          <span key={output.id}>{output.label}</span>
                        ))}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] px-8 py-16 text-center dark:border-white/10">
            {records.length ? (
              <>
                <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                  No initiatives match these filters
                </p>
                <p className="mt-2 text-[var(--ink-3)]">
                  Try a different focus area, status, or year.
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
                  Research initiatives will appear here as studies begin.
                </p>
                <p className="mt-2 text-[var(--ink-3)]">
                  Each initiative carries its question, methods, members, and the milestones that
                  mark real progress.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
