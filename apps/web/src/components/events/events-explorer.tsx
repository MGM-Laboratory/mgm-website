"use client";

import { CalendarBlank, ListBullets, PlusCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { partitionEvents, type CmsEventRecord } from "@/lib/events-cms";
import { EventsCalendarGrid } from "@/components/events/events-calendar-grid";
import { EventsList } from "@/components/events/events-list";
import { SubscribeCalendarModal } from "@/components/events/subscribe-calendar-modal";

type View = "calendar" | "list";

export function EventsExplorer({ records }: { records: readonly CmsEventRecord[] }) {
  const [view, setView] = useState<View>("calendar");
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const { past, upcoming } = useMemo(() => partitionEvents(records), [records]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          className="inline-flex rounded-full border border-[var(--line)] p-1 dark:border-white/10"
          role="tablist"
        >
          <button
            aria-selected={view === "calendar"}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              view === "calendar"
                ? "bg-brand-red text-white"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] dark:text-white/60 dark:hover:text-white"
            }`}
            onClick={() => setView("calendar")}
            role="tab"
            type="button"
          >
            <CalendarBlank size={16} weight="bold" /> Calendar
          </button>
          <button
            aria-selected={view === "list"}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              view === "list"
                ? "bg-brand-red text-white"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] dark:text-white/60 dark:hover:text-white"
            }`}
            onClick={() => setView("list")}
            role="tab"
            type="button"
          >
            <ListBullets size={16} weight="bold" /> List
          </button>
        </div>

        <button
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:border-white/10 dark:text-white"
          onClick={() => setSubscribeOpen(true)}
          type="button"
        >
          <PlusCircle size={16} weight="bold" /> Subscribe to calendar
        </button>
      </div>

      <div className="mt-8">
        {view === "calendar" ? (
          <EventsCalendarGrid records={records} />
        ) : (
          <div className="space-y-14">
            <div>
              <h3 className="font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
                Upcoming
              </h3>
              <EventsList
                emptyLabel="No upcoming events yet — check back soon."
                events={upcoming}
              />
            </div>
            {past.length ? (
              <div>
                <h3 className="font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
                  Past
                </h3>
                <EventsList emptyLabel="" events={past} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {subscribeOpen ? <SubscribeCalendarModal onClose={() => setSubscribeOpen(false)} /> : null}
    </div>
  );
}
