import type { ArticleBlock } from "@/lib/article-cms";

export const EVENT_COLORS = ["blue", "yellow", "red", "green"] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

export type EventSpeaker = { name: string; title?: string; photoKey?: string };
export type EventRundownItem = { time: string; item: string };

export type CmsEventRecord = {
  slug: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string;
  meetingLink?: string;
  color: EventColor;
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

export function emptyEventDraft(): EventDraft {
  return {
    slug: "",
    title: "",
    description: "",
    startAt: "",
    endAt: "",
    allDay: false,
    location: "",
    meetingLink: "",
    color: "blue",
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

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** A `datetime-local` input value, always interpreted as WIB wall-clock time. */
export function wibLocalToUtcIso(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}

/** The inverse, for populating a `datetime-local` input when editing. */
export function utcIsoToWibLocal(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + WIB_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** An all-day event's date, stored as UTC midnight (see `calendarDateParts` below). */
export function dateOnlyToUtcMidnightIso(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function utcIsoToDateOnly(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// Tint background + solid-color text, the same convention the research
// explorer's area/status badges already use — every brand color stays
// readable at small sizes without touching the fill-contrast rules in
// DESIGN_SYSTEM.md §2.3 (yellow never carries text, red only passes AA Large).
export const EVENT_COLOR_CHIP_CLASSES: Record<EventColor, string> = {
  blue: "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]",
  yellow: "bg-brand-yellow-50 text-[#a97b1c] dark:bg-brand-yellow/15 dark:text-[#e3c36a]",
  red: "bg-brand-red-50 text-brand-red dark:bg-brand-red/15 dark:text-[#ef9a9a]",
  green: "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#7cc9a5]",
};

export const EVENT_COLOR_DOT_CLASSES: Record<EventColor, string> = {
  blue: "bg-brand-blue",
  yellow: "bg-brand-yellow",
  red: "bg-brand-red",
  green: "bg-brand-green",
};

export const EVENT_COLOR_LABELS: Record<EventColor, string> = {
  blue: "Blue",
  yellow: "Yellow",
  red: "Red",
  green: "Green",
};

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

const TIME_ZONE = "Asia/Jakarta";

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: TIME_ZONE,
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

/** A short, human date/time range for list rows and detail text. */
export function formatEventDateRange(record: CmsEventRecord) {
  const startDay = formatDay(record.startAt);
  const endDay = formatDay(record.endAt);
  if (record.allDay) {
    return startDay === endDay ? startDay : `${startDay} – ${endDay}`;
  }
  const time = `${formatTime(record.startAt)} – ${formatTime(record.endAt)} WIB`;
  return startDay === endDay ? `${startDay} · ${time}` : `${startDay} – ${endDay} · ${time}`;
}
