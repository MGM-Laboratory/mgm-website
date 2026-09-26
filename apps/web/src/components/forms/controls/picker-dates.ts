/**
 * The calendar arithmetic, formatting and lenient parsing behind the date
 * and time pickers. Answers keep the native shapes: dates `YYYY-MM-DD`,
 * times `HH:mm` (24h), datetimes `YYYY-MM-DDTHH:mm` in local time. Days
 * are computed in UTC so no time zone or daylight-saving shift can move
 * them; only "today" and "now" read the visitor's clock.
 */

export type PickerLanguage = "en" | "id";

export type Ymd = { y: number; m: number; d: number };

export const pad2 = (value: number) => String(value).padStart(2, "0");

/** The Intl locale per form language (en uses day-month order, like the brand's copy). */
export function pickerLocale(language: PickerLanguage) {
  return language === "id" ? "id-ID" : "en-GB";
}

/** The first day of a week shown in the grid (0 Sunday, 1 Monday). */
export function weekStartOf(language: PickerLanguage) {
  return language === "id" ? 1 : 0;
}

/** Whether the language shows times on a 12-hour clock. */
export function uses12Hour(language: PickerLanguage) {
  return language === "en";
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function toIso({ y, m, d }: Ymd) {
  return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
}

function validYmd(y: number, m: number, d: number): Ymd | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1) return null;
  return d <= daysInMonth(y, m) ? { y, m, d } : null;
}

/** A strict `YYYY-MM-DD` read. */
export function parseIso(iso: string | undefined): Ymd | null {
  if (!iso || iso.length !== 10) return null;
  const parts = iso.split("-").map(Number);
  const date = validYmd(parts.at(0) ?? 0, parts.at(1) ?? 0, parts.at(2) ?? 0);
  return date && toIso(date) === iso ? date : null;
}

function utc(iso: string) {
  const date = parseIso(iso);
  return date ? new Date(Date.UTC(date.y, date.m - 1, date.d)) : new Date(Number.NaN);
}

function fromUtc(date: Date) {
  return toIso({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() });
}

export function addDays(iso: string, days: number) {
  const date = utc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** Moves by whole months, keeping the day where the target month has it. */
export function addMonths(iso: string, months: number) {
  const date = parseIso(iso);
  if (!date) return iso;
  const index = date.y * 12 + (date.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return toIso({ y, m, d: Math.min(date.d, daysInMonth(y, m)) });
}

/** 0 Sunday … 6 Saturday. */
export function weekdayOf(iso: string) {
  return utc(iso).getUTCDay();
}

/** The visitor's local today. */
export function todayIso(now = new Date()) {
  return toIso({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

/** The visitor's local time now, `HH:mm`. */
export function nowTime(now = new Date()) {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/** Whether `iso` is inside the optional bounds (ISO strings compare in order). */
export function inRange(iso: string, min?: string, max?: string) {
  return !(min && iso < min) && !(max && iso > max);
}

export function clampIso(iso: string, min?: string, max?: string) {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** The 42 days (six weeks) the month grid of `y`-`m` shows. */
export function monthGrid(y: number, m: number, weekStart: number) {
  const first = toIso({ y, m, d: 1 });
  const offset = (weekdayOf(first) - weekStart + 7) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

// ------------------------------------------------------------ formatting

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(language: PickerLanguage, options: Intl.DateTimeFormatOptions) {
  const key = `${language}|${JSON.stringify(options)}`;
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(pickerLocale(language), { ...options, timeZone: "UTC" });
    formatters.set(key, found);
  }
  return found;
}

/** "Sat, 26 September 2026" / "Sab, 26 September 2026". */
export function formatDateLong(iso: string, language: PickerLanguage) {
  return formatter(language, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(utc(iso));
}

/** "Sat, 26 Sept 2026": the date half of a datetime. */
export function formatDateShort(iso: string, language: PickerLanguage) {
  return formatter(language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(utc(iso));
}

/** "Saturday, 26 September 2026": what a day cell announces. */
export function formatDateFull(iso: string, language: PickerLanguage) {
  return formatter(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(utc(iso));
}

/** "September 2026". */
export function formatMonthYear(y: number, m: number, language: PickerLanguage) {
  return formatter(language, { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** The twelve month names, January first. */
export function monthNames(language: PickerLanguage, style: "long" | "short") {
  const format = formatter(language, { month: style });
  return Array.from({ length: 12 }, (_, index) =>
    format.format(new Date(Date.UTC(2026, index, 1))),
  );
}

/** The seven weekday names in grid order, from `weekStart`. */
export function weekdayNames(language: PickerLanguage, style: "long" | "short") {
  const format = formatter(language, { weekday: style });
  // 2026-09-20 is a Sunday.
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(Date.UTC(2026, 8, 20 + ((index + weekStartOf(language)) % 7)))),
  );
}

export type TimeParts = { h: number; min: number };

export function parseTimeValue(value: string | undefined): TimeParts | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const parts = value.split(":").map(Number);
  const h = parts.at(0) ?? 99;
  const min = parts.at(1) ?? 99;
  return h > 23 || min > 59 ? null : { h, min };
}

export const timeValue = ({ h, min }: TimeParts) => `${pad2(h)}:${pad2(min)}`;

/** "2:30 PM" in English, "14:30" in Indonesian. */
export function formatTime(value: string, language: PickerLanguage) {
  const time = parseTimeValue(value);
  if (!time) return value;
  if (!uses12Hour(language)) return timeValue(time);
  const hour = time.h % 12 === 0 ? 12 : time.h % 12;
  return `${hour}:${pad2(time.min)} ${time.h < 12 ? "AM" : "PM"}`;
}

export function formatDateTime(value: string, language: PickerLanguage) {
  const [date, time] = value.split("T");
  if (!date || !time || !parseIso(date)) return value;
  return `${formatDateShort(date, language)}, ${formatTime(time, language)}`;
}

// --------------------------------------------------------------- parsing

const MONTH_WORDS: readonly (readonly string[])[] = [
  ["january", "januari"],
  ["february", "februari", "pebruari"],
  ["march", "maret"],
  ["april"],
  ["may", "mei"],
  ["june", "juni"],
  ["july", "juli"],
  ["august", "agustus", "agt"],
  ["september", "sept"],
  ["october", "oktober"],
  ["november", "nopember"],
  ["december", "desember"],
];

const WEEKDAY_WORDS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "minggu",
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
];

/** The month (1 to 12) a word names, by a prefix of at least three letters. */
function monthOfWord(word: string) {
  if (word.length < 3) return 0;
  const index = MONTH_WORDS.findIndex((names) =>
    names.some((name) => name.startsWith(word) || word.startsWith(name)),
  );
  return index + 1;
}

function isWeekdayWord(word: string) {
  return word.length >= 3 && WEEKDAY_WORDS.some((name) => name.startsWith(word));
}

function fullYear(text: string) {
  const year = Number(text);
  if (text.length === 4) return year;
  if (text.length === 2) return year < 50 ? 2000 + year : 1900 + year;
  return Number.NaN;
}

/** Day and month as typed, swapped when only the other order is a real date. */
function dayMonth(first: number, second: number, y: number) {
  return validYmd(y, second, first) ?? validYmd(y, first, second);
}

function parseNumericDate(text: string): Ymd | null {
  const digits = /^\d{8}$/.test(text);
  if (digits) {
    return (
      validYmd(Number(text.slice(4)), Number(text.slice(2, 4)), Number(text.slice(0, 2))) ??
      validYmd(Number(text.slice(0, 4)), Number(text.slice(4, 6)), Number(text.slice(6)))
    );
  }
  const parts = text.split(/[-/.]/);
  if (parts.length !== 3 || parts.some((part) => !/^\d{1,4}$/.test(part))) return null;
  const [a = "", b = "", c = ""] = parts;
  if (a.length === 4) return validYmd(Number(a), Number(b), Number(c));
  if (a.length > 2 || b.length > 2) return null;
  const y = fullYear(c);
  return Number.isNaN(y) ? null : dayMonth(Number(a), Number(b), y);
}

function parseWordDate(words: string[]): Ymd | null {
  let month = 0;
  const numbers: string[] = [];
  for (const raw of words) {
    const word = raw.replace(/\.$/, "");
    if (/^\d{1,2}(st|nd|rd|th)$/.test(word)) {
      numbers.push(word.replace(/\D/g, ""));
    } else if (/^\d+$/.test(word)) {
      numbers.push(word);
    } else if (/^[a-z]+$/.test(word)) {
      const found = monthOfWord(word);
      if (found && !month) month = found;
      else if (!isWeekdayWord(word) && word !== "of") return null;
    } else {
      return null;
    }
  }
  if (!month || numbers.length !== 2) return null;
  const [first = "", second = ""] = numbers;
  const yearFirst = first.length === 4;
  const y = fullYear(yearFirst ? first : second);
  const d = Number(yearFirst ? second : first);
  return Number.isNaN(y) ? null : validYmd(y, month, d);
}

function words(text: string) {
  return text.toLowerCase().replace(/[,·]/g, " ").split(/\s+/).filter(Boolean);
}

/**
 * A typed date, read leniently: 26/09/2026, 26-9-26, 2026-09-26, 26092026,
 * "26 Sep 2026", "Sep 26, 2026", "Sabtu, 26 September 2026". Day-month
 * order first; a first number above 12 is read as the day either way.
 */
export function parseDateText(text: string): string | null {
  const list = words(text);
  if (list.length === 1 && list[0]) {
    const date = parseNumericDate(list[0]);
    return date ? toIso(date) : null;
  }
  const date = parseWordDate(list);
  return date ? toIso(date) : null;
}

/**
 * A typed time: 1430, 14:30, 14.30, 9, 2pm, 2:30 PM, 2.30 p.m. Returns
 * `HH:mm` (24h).
 */
export function parseTimeText(text: string): string | null {
  let rest = text.toLowerCase().replace(/[\s.]/g, "");
  let period: "am" | "pm" | null = null;
  for (const [suffix, which] of [
    ["am", "am"],
    ["pm", "pm"],
    ["a", "am"],
    ["p", "pm"],
  ] as const) {
    if (rest.endsWith(suffix)) {
      period = which;
      rest = rest.slice(0, -suffix.length);
      break;
    }
  }
  // "14.30" lost its dot above; "14:30" and "14h30" keep a separator.
  rest = rest.replace(/[:h]/, "");
  if (!/^\d{1,4}$/.test(rest)) return null;
  const h = Number(rest.length <= 2 ? rest : rest.slice(0, -2));
  const min = rest.length <= 2 ? 0 : Number(rest.slice(-2));
  if (min > 59) return null;
  if (period) {
    if (h < 1 || h > 12) return null;
    return timeValue({ h: (h % 12) + (period === "pm" ? 12 : 0), min });
  }
  return h > 23 ? null : timeValue({ h, min });
}

const CONNECTORS = new Set(["at", "pukul", "jam", "pkl", "t"]);

/** A typed date and time: "26/09/2026 14:30", "26 Sep 2026, 2:30 pm", ISO. */
export function parseDateTimeText(text: string): string | null {
  const iso = /^(\d{4}-\d{2}-\d{2})[t\s](\d{1,2}:\d{2})$/i.exec(text.trim());
  if (iso?.[1] && iso[2]) {
    const date = parseDateText(iso[1]);
    const time = parseTimeText(iso[2]);
    return date && time ? `${date}T${time}` : null;
  }
  const list = words(text);
  let timeWords = 1;
  const last = list.at(-1) ?? "";
  if (/^[ap]\.?m?\.?$/.test(last)) timeWords = 2;
  const time = parseTimeText(list.slice(-timeWords).join(""));
  let dateWords = list.slice(0, -timeWords);
  if (CONNECTORS.has(dateWords.at(-1) ?? "")) dateWords = dateWords.slice(0, -1);
  const date = dateWords.length ? parseDateText(dateWords.join(" ")) : null;
  return date && time ? `${date}T${time}` : null;
}

// ------------------------------------------------------------------ copy

export type PickerCopy = {
  chooseDate: string;
  chooseTime: string;
  chooseDateTime: string;
  today: string;
  now: string;
  clear: string;
  done: string;
  close: string;
  previousMonth: string;
  nextMonth: string;
  chooseMonth: string;
  chooseYear: string;
  backToDays: string;
  hours: string;
  minutes: string;
  period: string;
  todayPrefix: string;
  dateHint: string;
  timeHint: string;
  dateTimeHint: string;
  pickTime: string;
  dateFormat: string;
  timeFormat: string;
};

const COPY = new Map<PickerLanguage, PickerCopy>([
  [
    "en",
    {
      chooseDate: "Choose a date",
      chooseTime: "Choose a time",
      chooseDateTime: "Choose a date and time",
      today: "Today",
      now: "Now",
      clear: "Clear",
      done: "Done",
      close: "Close",
      previousMonth: "Previous month",
      nextMonth: "Next month",
      chooseMonth: "Choose a month",
      chooseYear: "Choose a year",
      backToDays: "Back to the days",
      hours: "Hours",
      minutes: "Minutes",
      period: "AM or PM",
      todayPrefix: "Today",
      dateHint: "Type DD/MM/YYYY or 26 Sep 2026",
      timeHint: "Type 2:30 PM or 14:30",
      dateTimeHint: "Type 26/09/2026 2:30 PM",
      pickTime: "Pick a time",
      dateFormat: "DD/MM/YYYY",
      timeFormat: "HH:MM AM",
    },
  ],
  [
    "id",
    {
      chooseDate: "Pilih tanggal",
      chooseTime: "Pilih waktu",
      chooseDateTime: "Pilih tanggal dan waktu",
      today: "Hari ini",
      now: "Sekarang",
      clear: "Hapus",
      done: "Selesai",
      close: "Tutup",
      previousMonth: "Bulan sebelumnya",
      nextMonth: "Bulan berikutnya",
      chooseMonth: "Pilih bulan",
      chooseYear: "Pilih tahun",
      backToDays: "Kembali ke tanggal",
      hours: "Jam",
      minutes: "Menit",
      period: "AM atau PM",
      todayPrefix: "Hari ini",
      dateHint: "Ketik HH/BB/TTTT, misalnya 26/09/2026",
      timeHint: "Ketik JJ:MM, misalnya 14:30",
      dateTimeHint: "Ketik 26/09/2026 14:30",
      pickTime: "Pilih waktu",
      dateFormat: "HH/BB/TTTT",
      timeFormat: "JJ:MM",
    },
  ],
]);

export function pickerCopy(language: PickerLanguage): PickerCopy {
  const found = COPY.get(language) ?? COPY.get("en");
  if (!found) throw new Error("The picker has no English copy.");
  return found;
}
