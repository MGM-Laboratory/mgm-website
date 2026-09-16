import { CalendarBlank, MapPin, Microphone, Ticket } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { formatEventDateRange, type CmsEventRecord } from "@/lib/events-cms";

function mediaUrl(key?: string) {
  return key ? `/api/events-cms/media/${encodeURIComponent(key)}` : undefined;
}

/**
 * One row per event: a fixed square thumbnail on the left, metadata on the
 * right. The title link is "stretched" over the whole row (an absolutely
 * positioned overlay) so the row is clickable everywhere except the register
 * pill, which sits above it in its own stacking context.
 */
export function EventCard({ event }: { event: CmsEventRecord }) {
  const thumbnail = mediaUrl(event.thumbnailKey);
  const speakerNames = event.speakers
    .map((speaker) => speaker.name)
    .filter(Boolean)
    .join(", ");

  return (
    <li className="relative flex gap-5 py-6 sm:gap-6">
      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-2xl bg-[var(--surface-muted)] sm:w-40">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="size-full object-cover" src={thumbnail} />
        ) : (
          <div className="grid size-full place-items-center text-[var(--ink-3)]">
            <CalendarBlank size={28} weight="duotone" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="font-mono text-xs tracking-[0.04em] text-[var(--ink-3)] tnum">
            {formatEventDateRange(event)}
          </span>
        </div>

        <h3 className="mt-2 font-display text-lg font-semibold tracking-[-0.01em] text-[var(--ink)] sm:text-xl dark:text-white">
          <Link className="after:absolute after:inset-0" href={`/events/${event.slug}`}>
            {event.title}
          </Link>
        </h3>

        {event.description ? (
          <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
            {event.description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[var(--ink-3)]">
          {event.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} weight="bold" /> {event.location}
            </span>
          ) : null}
          {speakerNames ? (
            <span className="inline-flex items-center gap-1.5">
              <Microphone size={14} weight="bold" /> {speakerNames}
            </span>
          ) : null}
        </div>
      </div>

      {event.registrationEnabled ? (
        <Link
          className="relative z-10 inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full bg-brand-blue px-3.5 text-xs font-semibold text-white transition hover:bg-brand-blue/90"
          href={`/events/${event.slug}#register`}
        >
          <Ticket size={14} weight="bold" />
          Register
        </Link>
      ) : null}
    </li>
  );
}
