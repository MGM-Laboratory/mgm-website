import { describe, expect, it } from "vitest";

import { buildIcsFeed, buildSingleEventIcs, type IcsEventRecord } from "./cms-events.ics.js";

function record(overrides: Partial<IcsEventRecord> = {}): IcsEventRecord {
  return {
    slug: "open-house",
    title: "Open House",
    startAt: "2026-12-01T03:00:00.000Z",
    endAt: "2026-12-01T05:30:00.000Z",
    allDay: false,
    updatedAt: "2026-11-20T10:15:30.000Z",
    ...overrides,
  };
}

function unfold(text: string) {
  return text.replace(/\r\n /g, "");
}

describe("buildIcsFeed", () => {
  it("wraps the events in a VCALENDAR with CRLF line endings", () => {
    const feed = buildIcsFeed([record()]);

    expect(feed.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(feed.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(feed).toContain("VERSION:2.0\r\n");
    expect(feed).toContain("X-WR-CALNAME:MGM Laboratory Events\r\n");
    expect(feed).toContain("X-WR-TIMEZONE:Asia/Jakarta\r\n");
    expect(feed.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("writes one VEVENT for each record and an empty calendar for none", () => {
    const two = buildIcsFeed([record(), record({ slug: "second" })]);
    expect(two.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(two).toContain("UID:second@events.labmgm.org");

    const none = buildIcsFeed([]);
    expect(none).not.toContain("BEGIN:VEVENT");
    expect(none).toContain("END:VCALENDAR");
  });

  it("writes timed events as UTC instants", () => {
    const feed = buildIcsFeed([record()]);

    expect(feed).toContain("UID:open-house@events.labmgm.org\r\n");
    expect(feed).toContain("DTSTART:20261201T030000Z\r\n");
    expect(feed).toContain("DTEND:20261201T053000Z\r\n");
    expect(feed).toContain("LAST-MODIFIED:20261120T101530Z\r\n");
    expect(feed).toMatch(/DTSTAMP:\d{8}T\d{6}Z\r\n/);
  });

  it("writes all day events as dates with an exclusive end", () => {
    const feed = buildIcsFeed([
      record({
        allDay: true,
        startAt: "2026-12-31T00:00:00.000Z",
        endAt: "2026-12-31T00:00:00.000Z",
      }),
    ]);

    expect(feed).toContain("DTSTART;VALUE=DATE:20261231\r\n");
    expect(feed).toContain("DTEND;VALUE=DATE:20270101\r\n");
  });

  it("escapes text values", () => {
    const feed = buildIcsFeed([
      record({ title: "Talk; Q&A, part 1 \\ 2", description: "line one\nline two\r\nline three" }),
    ]);
    const text = unfold(feed);

    expect(text).toContain("SUMMARY:Talk\\; Q&A\\, part 1 \\\\ 2\r\n");
    expect(text).toContain("DESCRIPTION:line one\\nline two\\nline three\r\n");
  });

  it("prefers the maps link over the place name for the location", () => {
    const withMaps = buildIcsFeed([
      record({ location: "Room 1", mapsUrl: "https://maps.example.test/x" }),
    ]);
    expect(withMaps).toContain("LOCATION:https://maps.example.test/x");
    expect(withMaps).not.toContain("Room 1");

    const nameOnly = buildIcsFeed([record({ location: "Room 1", mapsUrl: "  " })]);
    expect(nameOnly).toContain("LOCATION:Room 1\r\n");

    const neither = buildIcsFeed([record()]);
    expect(neither).not.toContain("LOCATION:");
  });

  it("adds the meeting link to the description", () => {
    const both = unfold(
      buildIcsFeed([
        record({ description: "About", meetingLink: " https://meet.example.test/a " }),
      ]),
    );
    expect(both).toContain("DESCRIPTION:About\\nMeeting link: https://meet.example.test/a\r\n");

    const linkOnly = unfold(buildIcsFeed([record({ meetingLink: "https://meet.example.test/a" })]));
    expect(linkOnly).toContain("DESCRIPTION:Meeting link: https://meet.example.test/a\r\n");

    expect(buildIcsFeed([record({ description: "   " })])).not.toContain("DESCRIPTION:");
  });

  it("folds long lines at 75 octets without splitting a multi byte character", () => {
    const title = "é".repeat(120);
    const feed = buildIcsFeed([record({ title })]);
    const lines = feed.split("\r\n");

    for (const line of lines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
    expect(unfold(feed)).toContain(`SUMMARY:${title}`);
  });

  it("folds a long ASCII line and rebuilds it when unfolded", () => {
    const title = "x".repeat(200);
    const feed = buildIcsFeed([record({ title })]);

    expect(unfold(feed)).toContain(`SUMMARY:${title}\r\n`);
  });
});

describe("buildSingleEventIcs", () => {
  it("writes one event without the feed headers", () => {
    const body = buildSingleEventIcs(record());

    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(body).toContain("METHOD:PUBLISH\r\n");
    expect(body).not.toContain("X-WR-CALNAME");
    expect(body.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
