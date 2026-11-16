import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIMEZONE_OFFSET,
  TIMEZONE_OFFSETS,
  dateOnlyToUtcMidnightIso,
  emptyEventDraft,
  formatEventDateTimeParts,
  isEventPast,
  localToUtcIso,
  partitionEvents,
  sortEventsByStart,
  timezoneLabel,
  utcIsoToDateOnly,
  utcIsoToLocal,
  type CmsEventRecord,
} from "./events-cms";

function event(slug: string, startAt: string, endAt: string, extra: Partial<CmsEventRecord> = {}) {
  return {
    slug,
    title: slug,
    startAt,
    endAt,
    allDay: false,
    timezoneOffset: 7,
    draft: false,
    speakers: [],
    rundown: [],
    registrationEnabled: false,
    content: [],
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...extra,
  } satisfies CmsEventRecord;
}

describe("constants and defaults", () => {
  it("offers whole hour offsets from -12 to +14", () => {
    expect(TIMEZONE_OFFSETS[0]).toBe(-12);
    expect(TIMEZONE_OFFSETS.at(-1)).toBe(14);
    expect(TIMEZONE_OFFSETS).toHaveLength(27);
  });

  it("starts an empty draft in Jakarta time", () => {
    expect(emptyEventDraft()).toMatchObject({
      timezoneOffset: DEFAULT_TIMEZONE_OFFSET,
      draft: true,
      allDay: false,
      registrationEnabled: false,
      speakers: [],
      rundown: [],
    });
  });
});

describe("timezone helpers", () => {
  it("labels offsets", () => {
    expect(timezoneLabel(7)).toBe("GMT+7");
    expect(timezoneLabel(0)).toBe("GMT+0");
    expect(timezoneLabel(-5)).toBe("GMT-5");
  });

  it("converts wall clock time to UTC and back", () => {
    expect(localToUtcIso("2025-03-10T09:30", 7)).toBe("2025-03-10T02:30:00.000Z");
    expect(localToUtcIso("2025-03-10T09:30", -5)).toBe("2025-03-10T14:30:00.000Z");
    expect(utcIsoToLocal("2025-03-10T02:30:00.000Z", 7)).toBe("2025-03-10T09:30");
    expect(utcIsoToLocal("2025-03-10T02:30:00.000Z", -5)).toBe("2025-03-09T21:30");
  });

  it("round trips across a day boundary", () => {
    const iso = localToUtcIso("2025-12-31T23:45", 9);
    expect(utcIsoToLocal(iso, 9)).toBe("2025-12-31T23:45");
  });

  it("stores all day dates as UTC midnight", () => {
    expect(dateOnlyToUtcMidnightIso("2025-03-10")).toBe("2025-03-10T00:00:00.000Z");
    expect(utcIsoToDateOnly("2025-03-10T00:00:00.000Z")).toBe("2025-03-10");
    expect(utcIsoToDateOnly("2025-03-10T23:59:59.000Z")).toBe("2025-03-10");
  });
});

describe("ordering", () => {
  it("sorts by start without changing the input", () => {
    const list = [
      event("b", "2025-02-01T00:00:00.000Z", "2025-02-01T01:00:00.000Z"),
      event("a", "2025-01-01T00:00:00.000Z", "2025-01-01T01:00:00.000Z"),
    ];

    expect(sortEventsByStart(list).map((entry) => entry.slug)).toEqual(["a", "b"]);
    expect(list[0].slug).toBe("b");
  });

  it("compares the end as an instant, even without seconds", () => {
    const now = new Date("2025-01-01T10:00:30.000Z");

    expect(isEventPast(event("x", "2025-01-01T09:00Z", "2025-01-01T10:00Z"), now)).toBe(true);
    expect(isEventPast(event("y", "2025-01-01T09:00Z", "2025-01-01T11:00Z"), now)).toBe(false);
  });

  it("keeps an all day event running until its last day ends", () => {
    const allDay = event("d", "2025-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z", {
      allDay: true,
    });

    expect(isEventPast(allDay, new Date("2025-01-01T23:59:00.000Z"))).toBe(false);
    expect(isEventPast(allDay, new Date("2025-01-02T00:00:01.000Z"))).toBe(true);
  });

  it("defaults to the current time", () => {
    expect(isEventPast(event("old", "2000-01-01T00:00:00Z", "2000-01-01T01:00:00Z"))).toBe(true);
    expect(isEventPast(event("far", "2999-01-01T00:00:00Z", "2999-01-01T01:00:00Z"))).toBe(false);
  });

  it("puts upcoming first by soonest and past by most recent", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const parts = partitionEvents(
      [
        event("past1", "2025-01-01T00:00:00Z", "2025-01-01T01:00:00Z"),
        event("past2", "2025-03-01T00:00:00Z", "2025-03-01T01:00:00Z"),
        event("up2", "2025-09-01T00:00:00Z", "2025-09-01T01:00:00Z"),
        event("up1", "2025-07-01T00:00:00Z", "2025-07-01T01:00:00Z"),
      ],
      now,
    );

    expect(parts.upcoming.map((entry) => entry.slug)).toEqual(["up1", "up2"]);
    expect(parts.past.map((entry) => entry.slug)).toEqual(["past2", "past1"]);
  });

  it("partitions with the real clock when none is given", () => {
    const parts = partitionEvents([
      event("old", "2000-01-01T00:00:00Z", "2000-01-01T01:00:00Z"),
      event("far", "2999-01-01T00:00:00Z", "2999-01-01T01:00:00Z"),
    ]);

    expect(parts.past.map((entry) => entry.slug)).toEqual(["old"]);
    expect(parts.upcoming.map((entry) => entry.slug)).toEqual(["far"]);
  });
});

// newer ICU data puts a narrow no-break space before AM and PM
const plain = (parts: { date: string; time?: string }) => ({
  ...parts,
  ...(parts.time ? { time: parts.time.replace(/\s/g, " ") } : {}),
});

describe("formatEventDateTimeParts", () => {
  it("formats a single day event with a time range", () => {
    expect(
      plain(
        formatEventDateTimeParts(
          event("a", "2025-03-10T02:30:00.000Z", "2025-03-10T05:00:00.000Z"),
        ),
      ),
    ).toEqual({ date: "Mar 10, 2025", time: "9:30 AM – 12:00 PM GMT+7" });
  });

  it("formats a multi day event with both days", () => {
    const parts = formatEventDateTimeParts(
      event("a", "2025-03-10T02:30:00.000Z", "2025-03-12T05:00:00.000Z"),
    );

    expect(parts.date).toBe("Mar 10, 2025 – Mar 12, 2025");
  });

  it("leaves out the time of an all day event", () => {
    expect(
      formatEventDateTimeParts(
        event("a", "2025-03-10T00:00:00.000Z", "2025-03-10T00:00:00.000Z", { allDay: true }),
      ),
    ).toEqual({ date: "Mar 10, 2025" });
  });

  it("falls back to the default offset when the record has none", () => {
    const record = event("a", "2025-03-10T02:30:00.000Z", "2025-03-10T05:00:00.000Z");
    delete (record as Partial<CmsEventRecord>).timezoneOffset;

    expect(formatEventDateTimeParts(record).time).toContain("GMT+7");
  });

  it("applies a negative offset to the wall clock", () => {
    const parts = formatEventDateTimeParts(
      event("a", "2025-03-10T14:30:00.000Z", "2025-03-10T16:00:00.000Z", { timezoneOffset: -5 }),
    );

    expect(plain(parts)).toEqual({ date: "Mar 10, 2025", time: "9:30 AM – 11:00 AM GMT-5" });
  });
});
