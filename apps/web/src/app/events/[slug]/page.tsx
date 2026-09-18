import {
  CalendarX,
  Clock,
  MapPin,
  Microphone,
  UsersThree,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCalendarButton } from "@/components/events/add-to-calendar-button";
import { EventBody } from "@/components/events/event-body";
import { EventCard } from "@/components/events/event-card";
import { EventDateTime } from "@/components/events/event-date-time";
import { EventRegisterButton } from "@/components/events/event-register-button";
import { CtaFooter } from "@/components/sections/cta-footer";
import { isEventPast, sortEventsByStart, type CmsEventRecord } from "@/lib/events-cms";
import { fetchEventBySlug, fetchEventsFeed } from "@/lib/events-cms-server";

type EventPageProps = { params: Promise<{ slug: string }> };

// Events resolve entirely at request time: an admin publishing/toggling
// registration must reach the public page immediately.
export const revalidate = 0;

function mediaUrl(key?: string) {
  return key ? `/api/events-cms/media/${encodeURIComponent(key)}` : undefined;
}

async function readRecord(slug: string) {
  try {
    return await fetchEventBySlug(slug);
  } catch {
    return undefined;
  }
}

async function readFeed() {
  try {
    return await fetchEventsFeed();
  } catch {
    return [] as CmsEventRecord[];
  }
}

function InfoRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--ink-3)] uppercase">
        {label}
      </p>
      <div className="mt-1 text-sm leading-6 text-[var(--ink)] dark:text-white/85">{children}</div>
    </div>
  );
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const record = await readRecord(slug);
  if (!record) return { title: "Event not found | MGM Laboratory" };
  return {
    title: `${record.title} | MGM Laboratory`,
    description: record.description || undefined,
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const [event, feed] = await Promise.all([readRecord(slug), readFeed()]);
  if (!event) notFound();

  const cover = mediaUrl(event.thumbnailKey);
  const others = sortEventsByStart(feed.filter((item) => item.slug !== slug)).slice(0, 3);
  const isOnlineLocation = event.location?.trim().toLocaleLowerCase() === "online";
  const locationLinkable = Boolean(event.mapsUrl) && !isOnlineLocation;
  const isPast = isEventPast(event);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <article className="mx-auto max-w-[900px] px-6 pt-[91px] pb-16 sm:px-10">
          <Link
            className="text-sm font-semibold text-[var(--ink-3)] transition hover:text-brand-blue"
            href="/events"
          >
            ← All events
          </Link>

          <div className="mt-6">
            <EventDateTime event={event} />
          </div>

          <h1 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
            {event.title}
          </h1>
          {event.description ? (
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--ink-2)] dark:text-[#c3c7d1]">
              {event.description}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AddToCalendarButton event={event} />
            {event.registrationEnabled ? (
              isPast ? (
                <span className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink-3)] dark:border-white/10">
                  <CalendarX size={16} weight="bold" />
                  Registration closed
                </span>
              ) : (
                <EventRegisterButton
                  eventSlug={event.slug}
                  registrationCapacity={event.registrationCapacity}
                />
              )
            ) : null}
          </div>

          {cover ? (
            <div className="mt-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={event.title}
                className="block aspect-[16/9] w-full rounded-3xl object-cover"
                src={cover}
              />
            </div>
          ) : null}

          <div className="mt-10 grid gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/60 p-5 sm:grid-cols-2">
            <InfoRow label="Date & time">
              <EventDateTime event={event} />
            </InfoRow>
            {event.location ? (
              <InfoRow label="Location">
                <span className="flex items-center gap-2">
                  <MapPin size={15} weight="bold" />
                  {locationLinkable ? (
                    <a
                      className="text-brand-blue hover:underline"
                      href={event.mapsUrl}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {event.location}
                    </a>
                  ) : (
                    event.location
                  )}
                </span>
              </InfoRow>
            ) : null}
            {event.meetingLink ? (
              <InfoRow label="Online">
                <a
                  className="flex items-center gap-2 text-brand-blue hover:underline"
                  href={event.meetingLink}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <VideoCamera size={15} weight="bold" /> Join online
                </a>
              </InfoRow>
            ) : null}
            {event.attendees ? (
              <InfoRow label="Who should attend">{event.attendees}</InfoRow>
            ) : null}
            {event.organizer ? <InfoRow label="Organizer">{event.organizer}</InfoRow> : null}
            {event.coordinator ? <InfoRow label="Coordinator">{event.coordinator}</InfoRow> : null}
          </div>

          {event.speakers.length ? (
            <div className="mt-10">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-[var(--ink)] dark:text-white">
                <Microphone size={19} weight="bold" /> Speakers
              </h2>
              <div className="mt-4 space-y-3">
                {event.speakers.map((speaker, index) => (
                  <div
                    className="flex items-center gap-3 rounded-2xl border border-[var(--line)] p-4"
                    key={`${speaker.name}-${index}`}
                  >
                    {mediaUrl(speaker.photoKey) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="size-12 shrink-0 rounded-full object-cover"
                        src={mediaUrl(speaker.photoKey)}
                      />
                    ) : (
                      <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--ink-3)]">
                        <UsersThree size={20} weight="bold" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold whitespace-nowrap text-[var(--ink)] dark:text-white">
                        {speaker.name}
                      </p>
                      {speaker.institution ? (
                        <p className="text-sm text-[var(--ink-3)]">{speaker.institution}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {event.rundown.length ? (
            <div className="mt-10">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-[var(--ink)] dark:text-white">
                <Clock size={19} weight="bold" /> Rundown
              </h2>
              <ol className="mt-4 space-y-3 border-l-2 border-[var(--line)] pl-5">
                {event.rundown.map((item, index) => (
                  <li key={index}>
                    <p className="font-mono text-xs font-bold tracking-[0.06em] text-brand-blue">
                      {item.time}
                    </p>
                    <p className="mt-0.5 text-sm leading-6 text-[var(--ink-2)] dark:text-white/70">
                      {item.item}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {event.content.length ? (
            <div className="mt-10">
              <EventBody blocks={event.content} />
            </div>
          ) : null}
        </article>

        {others.length ? (
          <section className="mx-auto w-full max-w-[1200px] px-6 pb-32 sm:px-10">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white">
                Other events
              </h2>
              <Link
                className="text-sm font-semibold text-[#464646] transition hover:text-brand-blue dark:text-[#b9bcc6]"
                href="/events"
              >
                View all
              </Link>
            </div>
            <ul className="mt-6 divide-y divide-[var(--line)] border-y border-[var(--line)] dark:divide-white/10 dark:border-white/10">
              {others.map((other) => (
                <EventCard event={other} key={other.slug} />
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <CtaFooter />
    </div>
  );
}
