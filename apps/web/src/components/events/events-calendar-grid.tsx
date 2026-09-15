"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import {
  buildMonthGrid,
  EVENT_COLOR_CHIP_CLASSES,
  EVENT_COLOR_DOT_CLASSES,
  eventsByDay,
  formatEventDateRange,
  MONTH_LABELS,
  WEEKDAY_LABELS,
  type CmsEventRecord,
} from "@/lib/events-cms";

const MAX_CHIPS_PER_DAY = 3;

export function EventsCalendarGrid({ records }: { records: readonly CmsEventRecord[] }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [activeDay, setActiveDay] = useState<string | undefined>();

  const byDay = useMemo(() => eventsByDay(records), [records]);
  const grid = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const todayKey = useMemo(
    () =>
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    [today],
  );

  function goToMonth(offset: number) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    setActiveDay(undefined);
  }

  const activeEvents = activeDay ? (byDay.get(activeDay) ?? []) : [];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-[var(--ink)] dark:text-white">
          {MONTH_LABELS[cursor.getMonth()]} {cursor.getFullYear()}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            aria-label="Previous month"
            className="grid size-9 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:border-white/10 dark:text-white/70"
            onClick={() => goToMonth(-1)}
            type="button"
          >
            <CaretLeft size={15} weight="bold" />
          </button>
          <button
            className="h-9 rounded-full border border-[var(--line)] px-3.5 text-xs font-semibold text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:border-white/10 dark:text-white/70"
            onClick={() => {
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
              setActiveDay(undefined);
            }}
            type="button"
          >
            Today
          </button>
          <button
            aria-label="Next month"
            className="grid size-9 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-2)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:border-white/10 dark:text-white/70"
            onClick={() => goToMonth(1)}
            type="button"
          >
            <CaretRight size={15} weight="bold" />
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] dark:border-white/10 dark:bg-white/10">
        {WEEKDAY_LABELS.map((label) => (
          <div
            className="bg-[var(--surface-muted)] px-2 py-2 text-center text-[10px] font-bold tracking-[0.1em] text-[var(--ink-3)] uppercase dark:bg-[#12151c] dark:text-white/45"
            key={label}
          >
            {label}
          </div>
        ))}
        {grid.map((day) => {
          const dayEvents = byDay.get(day.key) ?? [];
          const shown = dayEvents.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = dayEvents.length - shown.length;
          const isToday = day.key === todayKey;
          const isActive = day.key === activeDay;
          return (
            <button
              className={`flex min-h-24 flex-col items-stretch gap-1 bg-[var(--surface)] p-1.5 text-left transition sm:min-h-28 sm:p-2 dark:bg-[#0e1116] ${
                day.inMonth ? "" : "opacity-40"
              } ${isActive ? "ring-2 ring-inset ring-brand-blue" : "hover:bg-[var(--surface-muted)] dark:hover:bg-white/[0.03]"}`}
              disabled={!dayEvents.length}
              key={day.key}
              onClick={() => setActiveDay((prev) => (prev === day.key ? undefined : day.key))}
              type="button"
            >
              <span
                className={`inline-flex size-6 items-center justify-center self-start rounded-full text-xs font-semibold ${
                  isToday ? "bg-brand-blue text-white" : "text-[var(--ink-2)] dark:text-white/70"
                }`}
              >
                {day.date.getDate()}
              </span>
              <div className="flex flex-1 flex-col gap-1">
                {shown.map((event) => (
                  <span
                    className={`truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium leading-4 ${EVENT_COLOR_CHIP_CLASSES[event.color]}`}
                    key={event.slug}
                  >
                    {event.title}
                  </span>
                ))}
                {overflow > 0 ? (
                  <span className="px-1.5 text-[10px] font-semibold text-[var(--ink-3)]">
                    +{overflow} more
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {activeDay && activeEvents.length ? (
        <div className="mt-6 space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 dark:border-white/10 dark:bg-white/[0.02]">
          {activeEvents.map((event) => (
            <div className="flex items-start gap-3" key={event.slug}>
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${EVENT_COLOR_DOT_CLASSES[event.color]}`}
              />
              <div className="min-w-0">
                <p className="font-medium text-[var(--ink)] dark:text-white">{event.title}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  {formatEventDateRange(event)}
                  {event.location ? ` · ${event.location}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
