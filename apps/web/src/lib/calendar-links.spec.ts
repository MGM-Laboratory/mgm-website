// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import type { CmsEventRecord } from "@/lib/events-cms";

import { buildGoogleCalendarUrl, buildOutlookUrl } from "./calendar-links";

function event(extra: Partial<CmsEventRecord> = {}): CmsEventRecord {
  return {
    slug: "e",
    title: "Open house",
    startAt: "2025-03-10T02:30:00.000Z",
    endAt: "2025-03-10T05:00:00.000Z",
    allDay: false,
    timezoneOffset: 7,
    draft: false,
    speakers: [],
    rundown: [],
    registrationEnabled: false,
    content: [],
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...extra,
  };
}

function params(url: string) {
  return new URL(url).searchParams;
}

describe("buildGoogleCalendarUrl", () => {
  it("prefills a timed event with compact UTC dates", () => {
    const url = buildGoogleCalendarUrl(event());

    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(params(url).get("action")).toBe("TEMPLATE");
    expect(params(url).get("text")).toBe("Open house");
    expect(params(url).get("dates")).toBe("20250310T023000Z/20250310T050000Z");
    expect(params(url).has("details")).toBe(false);
    expect(params(url).has("location")).toBe(false);
  });

  it("makes the end of an all day event exclusive", () => {
    const url = buildGoogleCalendarUrl(
      event({
        allDay: true,
        startAt: "2025-03-10T00:00:00.000Z",
        endAt: "2025-03-11T00:00:00.000Z",
      }),
    );

    expect(params(url).get("dates")).toBe("20250310/20250312");
  });

  it("adds the description, the meeting link and prefers the maps url for the place", () => {
    const url = buildGoogleCalendarUrl(
      event({
        description: "Bring a friend",
        meetingLink: "https://meet.test/x",
        location: "Room 1",
        mapsUrl: " https://maps.test/p ",
      }),
    );

    expect(params(url).get("details")).toBe("Bring a friend\nMeeting link: https://meet.test/x");
    expect(params(url).get("location")).toBe("https://maps.test/p");
  });

  it("uses the plain location when the maps url is blank, and only the link as details", () => {
    const url = buildGoogleCalendarUrl(
      event({ location: " Room 1 ", mapsUrl: "  ", meetingLink: "https://meet.test/x" }),
    );

    expect(params(url).get("location")).toBe("Room 1");
    expect(params(url).get("details")).toBe("Meeting link: https://meet.test/x");
  });

  it("leaves the place out when both are blank", () => {
    expect(
      params(buildGoogleCalendarUrl(event({ location: " ", mapsUrl: " " }))).has("location"),
    ).toBe(false);
  });
});

describe("buildOutlookUrl", () => {
  it("prefills a timed event with the ISO times", () => {
    const url = buildOutlookUrl(event());

    expect(url.startsWith("https://outlook.live.com/calendar/0/deeplink/compose?")).toBe(true);
    expect(params(url).get("path")).toBe("/calendar/action/compose");
    expect(params(url).get("rru")).toBe("addevent");
    expect(params(url).get("subject")).toBe("Open house");
    expect(params(url).get("allday")).toBe("false");
    expect(params(url).get("startdt")).toBe("2025-03-10T02:30:00.000Z");
    expect(params(url).get("enddt")).toBe("2025-03-10T05:00:00.000Z");
    expect(params(url).has("body")).toBe(false);
  });

  it("uses plain dates for an all day event", () => {
    const url = buildOutlookUrl(
      event({
        allDay: true,
        startAt: "2025-03-10T00:00:00.000Z",
        endAt: "2025-03-11T00:00:00.000Z",
      }),
    );

    expect(params(url).get("allday")).toBe("true");
    expect(params(url).get("startdt")).toBe("2025-03-10");
    expect(params(url).get("enddt")).toBe("2025-03-11");
  });

  it("adds the body and the place", () => {
    const url = buildOutlookUrl(
      event({ description: "Hi", meetingLink: "https://meet.test/x", location: "Room 1" }),
    );

    expect(params(url).get("body")).toBe("Hi\nMeeting link: https://meet.test/x");
    expect(params(url).get("location")).toBe("Room 1");
  });
});
