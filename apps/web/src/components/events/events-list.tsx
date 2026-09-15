import { MapPin, VideoCamera } from "@phosphor-icons/react/dist/ssr";

import {
  EVENT_COLOR_CHIP_CLASSES,
  EVENT_COLOR_LABELS,
  formatEventDateRange,
  type CmsEventRecord,
} from "@/lib/events-cms";

function EventRow({ event }: { event: CmsEventRecord }) {
  return (
    <li className="flex flex-col gap-3 py-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-[0.06em] uppercase ${EVENT_COLOR_CHIP_CLASSES[event.color]}`}
          >
            {EVENT_COLOR_LABELS[event.color]}
          </span>
          <span className="font-mono text-xs tracking-[0.04em] text-[var(--ink-3)] tnum">
            {formatEventDateRange(event)}
          </span>
        </div>
        <h3 className="mt-2 font-display text-lg font-semibold tracking-[-0.01em] text-[var(--ink)] dark:text-white">
          {event.title}
        </h3>
        {event.description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
            {event.description}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[var(--ink-3)]">
          {event.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} weight="bold" /> {event.location}
            </span>
          ) : null}
          {event.meetingLink ? (
            <a
              className="inline-flex items-center gap-1.5 text-brand-blue hover:underline"
              href={event.meetingLink}
              rel="noreferrer noopener"
              target="_blank"
            >
              <VideoCamera size={14} weight="bold" /> Join online
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function EventsList({
  emptyLabel,
  events,
}: {
  emptyLabel: string;
  events: readonly CmsEventRecord[];
}) {
  if (!events.length) {
    return <p className="py-10 text-sm leading-6 text-[var(--ink-3)]">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)] dark:divide-white/10 dark:border-white/10">
      {events.map((event) => (
        <EventRow event={event} key={event.slug} />
      ))}
    </ul>
  );
}
