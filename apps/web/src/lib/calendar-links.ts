import type { CmsEventRecord } from "@/lib/events-cms";

function formatUtcCompact(iso: string) {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function formatDateOnlyCompact(iso: string) {
  return formatUtcCompact(iso).slice(0, 8);
}

/** Google Calendar's "quick add" template — opens with the event prefilled. */
export function buildGoogleCalendarUrl(event: CmsEventRecord): string {
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title });
  if (event.allDay) {
    // The end date is exclusive in Google's template, same as the ICS export.
    const end = new Date(event.endAt);
    end.setUTCDate(end.getUTCDate() + 1);
    params.set(
      "dates",
      `${formatDateOnlyCompact(event.startAt)}/${formatDateOnlyCompact(end.toISOString())}`,
    );
  } else {
    params.set("dates", `${formatUtcCompact(event.startAt)}/${formatUtcCompact(event.endAt)}`);
  }
  const details = [
    event.description,
    event.meetingLink ? `Meeting link: ${event.meetingLink}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  if (details) params.set("details", details);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook web's compose deep link, prefilled the same way. */
export function buildOutlookUrl(event: CmsEventRecord): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    allday: String(event.allDay),
  });
  if (event.allDay) {
    params.set("startdt", event.startAt.slice(0, 10));
    params.set("enddt", event.endAt.slice(0, 10));
  } else {
    params.set("startdt", event.startAt);
    params.set("enddt", event.endAt);
  }
  const body = [
    event.description,
    event.meetingLink ? `Meeting link: ${event.meetingLink}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  if (body) params.set("body", body);
  if (event.location) params.set("location", event.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
