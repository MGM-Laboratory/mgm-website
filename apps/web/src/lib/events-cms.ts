import type { ArticleBlock } from "@/lib/article-cms";

export type EventSpeaker = { name: string; institution?: string; photoKey?: string };
export type EventRundownItem = { time: string; item: string };

export type CmsEventRecord = {
  slug: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezoneOffset: number;
  location?: string;
  meetingLink?: string;
  draft: boolean;
  thumbnailKey?: string;
  speakers: EventSpeaker[];
  organizer?: string;
  coordinator?: string;
  attendees?: string;
  rundown: EventRundownItem[];
  mapsUrl?: string;
  mapsLat?: number;
  mapsLng?: number;
  registrationEnabled: boolean;
  registrationCapacity?: number;
  content: ArticleBlock[];
  updatedAt: string;
};

/** The editable fields, split from `content` the same way the Jobs editor splits `job`/`content`. */
export type EventDraft = Omit<CmsEventRecord, "content" | "updatedAt">;

/** GMT+7 — Jakarta/WIB — the lab's home timezone and every event's default. */
export const DEFAULT_TIMEZONE_OFFSET = 7;

/** Whole-hour GMT offsets for the admin timezone picker. */
export const TIMEZONE_OFFSETS = Array.from({ length: 27 }, (_, i) => i - 12);

export function emptyEventDraft(): EventDraft {
  return {
    slug: "",
    title: "",
    description: "",
    startAt: "",
    endAt: "",
    allDay: false,
    timezoneOffset: DEFAULT_TIMEZONE_OFFSET,
    location: "",
    meetingLink: "",
    draft: true,
    thumbnailKey: undefined,
    speakers: [],
    organizer: "",
    coordinator: "",
    attendees: "",
    rundown: [],
    mapsUrl: "",
    mapsLat: undefined,
    mapsLng: undefined,
    registrationEnabled: false,
    registrationCapacity: undefined,
  };
}

export type CmsEventRegistrationRecord = {
  slug: string;
  registration: {
    eventSlug: string;
    eventTitle: string;
    fullName: string;
    email: string;
    phone: string;
    read: boolean;
    readAt: string | null;
    status: "inbox" | "archived";
  };
  createdAt: string;
  updatedAt: string;
};

/** "GMT+7", "GMT-5" — Intl's `timeZone` option won't take an arbitrary numeric offset, so display is hand-built from this instead of an IANA zone name. */
export function timezoneLabel(offsetHours: number): string {
  const sign = offsetHours >= 0 ? "+" : "-";
  return `GMT${sign}${Math.abs(offsetHours)}`;
}

function shiftByOffset(iso: string, offsetHours: number) {
  return new Date(new Date(iso).getTime() + offsetHours * 60 * 60 * 1000);
}

/** A `datetime-local` input value, interpreted as wall-clock time at the given GMT offset. */
export function localToUtcIso(value: string, offsetHours: number): string {
  const sign = offsetHours >= 0 ? "+" : "-";
  const offsetStr = `${sign}${String(Math.abs(offsetHours)).padStart(2, "0")}:00`;
  return new Date(`${value}:00${offsetStr}`).toISOString();
}

/** The inverse, for populating a `datetime-local` input when editing. */
export function utcIsoToLocal(iso: string, offsetHours: number): string {
  const shifted = shiftByOffset(iso, offsetHours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** An all-day event's date, stored as UTC midnight — independent of any timezone offset. */
export function dateOnlyToUtcMidnightIso(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function utcIsoToDateOnly(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function sortEventsByStart(records: readonly CmsEventRecord[]) {
  return [...records].sort((left, right) => left.startAt.localeCompare(right.startAt));
}

/** Upcoming first (soonest first), then past (most recent first). */
export function partitionEvents(records: readonly CmsEventRecord[], now = new Date()) {
  const nowIso = now.toISOString();
  const upcoming = sortEventsByStart(records.filter((record) => record.endAt >= nowIso));
  const past = sortEventsByStart(records.filter((record) => record.endAt < nowIso)).reverse();
  return { past, upcoming };
}

function formatDayAtOffset(iso: string, offsetHours: number) {
  return shiftByOffset(iso, offsetHours).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function formatTimeAtOffset(iso: string, offsetHours: number) {
  return shiftByOffset(iso, offsetHours).toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export type EventDateTimeParts = { date: string; time?: string };

/** The date and time rendered as separate parts, so the UI can give them a clear visual boundary instead of gluing them into one string. */
export function formatEventDateTimeParts(record: CmsEventRecord): EventDateTimeParts {
  const offset = record.timezoneOffset ?? DEFAULT_TIMEZONE_OFFSET;
  const startDay = formatDayAtOffset(record.startAt, offset);
  const endDay = formatDayAtOffset(record.endAt, offset);
  const date = startDay === endDay ? startDay : `${startDay} – ${endDay}`;
  if (record.allDay) return { date };
  const time = `${formatTimeAtOffset(record.startAt, offset)} – ${formatTimeAtOffset(record.endAt, offset)} ${timezoneLabel(offset)}`;
  return { date, time };
}
