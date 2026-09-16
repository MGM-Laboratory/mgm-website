import { formatEventDateTimeParts, type CmsEventRecord } from "@/lib/events-cms";

/**
 * The date and time as two distinct chips split by a physical divider bar —
 * not a middle dot glued into one string — so it's unambiguous which part is
 * the date and which is the time.
 */
export function EventDateTime({ event }: { event: CmsEventRecord }) {
  const { date, time } = formatEventDateTimeParts(event);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs font-semibold text-[var(--ink)] dark:bg-white/[0.08] dark:text-white">
        {date}
      </span>
      {time ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-px shrink-0 bg-[var(--line)] dark:bg-white/15"
          />
          <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs font-semibold text-[var(--ink)] dark:bg-white/[0.08] dark:text-white">
            {time}
          </span>
        </>
      ) : null}
    </div>
  );
}
