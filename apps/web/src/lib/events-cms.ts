export const EVENT_COLORS = ["blue", "yellow", "red", "green"] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

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
  updatedAt: string;
};

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

/**
 * The calendar day an instant falls on, for bucketing events onto a month
 * grid. All-day instants are stored as UTC midnight and read back with UTC
 * getters so the date never shifts for a viewer west of UTC; timed events
 * use the viewer's local wall-clock day, matching what they'd expect to see
 * on their own calendar.
 */
function calendarDateParts(iso: string, allDay: boolean) {
  const date = new Date(iso);
  return allDay
    ? { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() }
    : { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

export function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Maps each calendar day a record spans (inclusive) to the records on it. */
export function eventsByDay(records: readonly CmsEventRecord[]) {
  const map = new Map<string, CmsEventRecord[]>();
  for (const record of records) {
    const start = calendarDateParts(record.startAt, record.allDay);
    const end = calendarDateParts(record.endAt, record.allDay);
    const cursor = new Date(start.year, start.month, start.day);
    const last = new Date(end.year, end.month, end.day);
    // A malformed record (end before start) would spin forever otherwise.
    let guard = 0;
    while (cursor <= last && guard < 366) {
      const key = dayKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      const bucket = map.get(key);
      if (bucket) bucket.push(record);
      else map.set(key, [record]);
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }
  return map;
}

export type MonthDay = { date: Date; inMonth: boolean; key: string };

/** A fixed 6-week (42-day) grid for the given month, weeks starting Monday. */
export function buildMonthGrid(year: number, month: number): MonthDay[] {
  const firstOfMonth = new Date(year, month, 1);
  const mondayIndex = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayIndex);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return {
      date,
      inMonth: date.getMonth() === month,
      key: dayKey(date.getFullYear(), date.getMonth(), date.getDate()),
    };
  });
}

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
