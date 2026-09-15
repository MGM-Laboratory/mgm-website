"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { EventCard } from "@/components/events/event-card";
import {
  EVENT_COLORS,
  EVENT_COLOR_LABELS,
  partitionEvents,
  type CmsEventRecord,
  type EventColor,
} from "@/lib/events-cms";

type ColorFilter = "all" | EventColor;

/**
 * Client-side search + category filter over an already-fetched feed
 * (Publications' pattern — the dataset is small enough that a server round
 * trip per keystroke would only add latency), split into Upcoming/Past
 * sections via the existing `partitionEvents` helper.
 */
export function EventsList({ records }: { records: readonly CmsEventRecord[] }) {
  const [query, setQuery] = useState("");
  const [colorFilter, setColorFilter] = useState<ColorFilter>("all");

  const counts = useMemo(() => {
    const map = new Map<ColorFilter, number>([["all", records.length]]);
    for (const color of EVENT_COLORS) {
      map.set(color, records.filter((record) => record.color === color).length);
    }
    return map;
  }, [records]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (colorFilter !== "all" && record.color !== colorFilter) return false;
      if (!needle) return true;
      return `${record.title} ${record.description ?? ""} ${record.location ?? ""}`
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [colorFilter, query, records]);

  const { past, upcoming } = useMemo(() => partitionEvents(filtered), [filtered]);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
            size={18}
          />
          <input
            aria-label="Search events"
            className="h-11 w-full rounded-full border border-[var(--line)] bg-[var(--surface)] pl-10 pr-4 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-3)] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:bg-white/[0.04] dark:text-white"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events"
            type="search"
            value={query}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", ...EVENT_COLORS] as ColorFilter[]).map((color) => (
            <button
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                colorFilter === color
                  ? "bg-[var(--ink)] text-white dark:bg-white dark:text-[#0e1116]"
                  : "bg-[var(--surface-muted)] text-[var(--ink-2)] hover:text-[var(--ink)] dark:text-white/60 dark:hover:text-white"
              }`}
              key={color}
              onClick={() => setColorFilter(color)}
              type="button"
            >
              {color === "all" ? "All" : EVENT_COLOR_LABELS[color]} · {counts.get(color) ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 space-y-14">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
            Upcoming
          </h2>
          {upcoming.length ? (
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)] dark:divide-white/10 dark:border-white/10">
              {upcoming.map((event) => (
                <EventCard event={event} key={event.slug} />
              ))}
            </ul>
          ) : (
            <p className="py-10 text-sm leading-6 text-[var(--ink-3)]">
              No upcoming events match your search.
            </p>
          )}
        </div>
        {past.length ? (
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
              Past
            </h2>
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)] dark:divide-white/10 dark:border-white/10">
              {past.map((event) => (
                <EventCard event={event} key={event.slug} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
