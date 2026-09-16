// Builds a public iCalendar (RFC 5545) feed of published events. Calendar
// apps (Google, Apple, Outlook) poll this feed's URL to keep a subscribed
// calendar in sync, so it must stay a stable, well-formed VCALENDAR document
// — ported from the reference Go implementation at ~/ren/carendar.

export type IcsEventRecord = {
  slug: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string;
  meetingLink?: string;
  updatedAt: string;
};

function formatIcsUtc(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function formatIcsDate(date: Date) {
  return formatIcsUtc(date).slice(0, 8);
}

// RFC 5545 §3.3.11 TEXT escaping.
function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
}

// Folds a content line at 75 octets with CRLF endings, per RFC 5545 §3.1.
// Continuation lines get a leading space and one less octet of budget to
// leave room for it; folds never split a UTF-8 multi-byte sequence.
function writeIcsLine(lines: string[], line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) {
    lines.push(line);
    return;
  }
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    const budget = first ? 75 : 74;
    let end = Math.min(i + budget, bytes.length);
    while (end > i + 1 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    lines.push((first ? "" : " ") + bytes.subarray(i, end).toString("utf8"));
    i = end;
    first = false;
  }
}

function buildDescription(record: IcsEventRecord) {
  const link = record.meetingLink?.trim();
  const parts = [record.description?.trim(), link ? `Meeting link: ${link}` : undefined].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join("\n");
}

function writeVEvent(lines: string[], record: IcsEventRecord, stamp: Date) {
  writeIcsLine(lines, "BEGIN:VEVENT");
  writeIcsLine(lines, `UID:${record.slug}@events.labmgm.org`);
  writeIcsLine(lines, `DTSTAMP:${formatIcsUtc(stamp)}`);
  if (record.allDay) {
    const start = new Date(record.startAt);
    // DTEND for all-day events is exclusive, so the last day needs +1.
    const end = new Date(record.endAt);
    end.setUTCDate(end.getUTCDate() + 1);
    writeIcsLine(lines, `DTSTART;VALUE=DATE:${formatIcsDate(start)}`);
    writeIcsLine(lines, `DTEND;VALUE=DATE:${formatIcsDate(end)}`);
  } else {
    writeIcsLine(lines, `DTSTART:${formatIcsUtc(new Date(record.startAt))}`);
    writeIcsLine(lines, `DTEND:${formatIcsUtc(new Date(record.endAt))}`);
  }
  writeIcsLine(lines, `SUMMARY:${escapeIcsText(record.title)}`);
  if (record.location?.trim()) {
    writeIcsLine(lines, `LOCATION:${escapeIcsText(record.location.trim())}`);
  }
  const description = buildDescription(record);
  if (description) writeIcsLine(lines, `DESCRIPTION:${escapeIcsText(description)}`);
  writeIcsLine(lines, `LAST-MODIFIED:${formatIcsUtc(new Date(record.updatedAt))}`);
  writeIcsLine(lines, "END:VEVENT");
}

export function buildIcsFeed(records: IcsEventRecord[]) {
  const lines: string[] = [];
  writeIcsLine(lines, "BEGIN:VCALENDAR");
  writeIcsLine(lines, "VERSION:2.0");
  writeIcsLine(lines, "PRODID:-//MGM Laboratory//MGM Event Calendar//EN");
  writeIcsLine(lines, "CALSCALE:GREGORIAN");
  writeIcsLine(lines, "METHOD:PUBLISH");
  writeIcsLine(lines, "X-WR-CALNAME:MGM Laboratory Events");
  writeIcsLine(lines, "X-WR-TIMEZONE:Asia/Jakarta");
  const stamp = new Date();
  for (const record of records) writeVEvent(lines, record, stamp);
  writeIcsLine(lines, "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/**
 * A single-event VCALENDAR document for the detail page's "Add to calendar"
 * (Apple/other) download — reuses the same VEVENT writer as the whole-feed
 * export so both stay byte-for-byte consistent.
 */
export function buildSingleEventIcs(record: IcsEventRecord) {
  const lines: string[] = [];
  writeIcsLine(lines, "BEGIN:VCALENDAR");
  writeIcsLine(lines, "VERSION:2.0");
  writeIcsLine(lines, "PRODID:-//MGM Laboratory//MGM Event Calendar//EN");
  writeIcsLine(lines, "CALSCALE:GREGORIAN");
  writeIcsLine(lines, "METHOD:PUBLISH");
  writeVEvent(lines, record, new Date());
  writeIcsLine(lines, "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
