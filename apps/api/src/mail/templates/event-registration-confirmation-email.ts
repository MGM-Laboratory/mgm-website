import { BRAND, escapeHtml, renderEmailShell } from "./email-shell.js";

// Compares calendar dates in UTC, not the API host's local timezone - start
// and end are already shifted to event-local time and formatted with
// timeZone: "UTC" below, so the same-day check has to use the same frame of
// reference or a host running outside UTC can misclassify an overnight or
// multi-day event.
function isSameUtcDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// Mirrors the GMT-offset convention events-cms.ts uses on the web side
// (Intl's timeZone option won't accept an arbitrary numeric offset, so the
// UTC instant is shifted by hand first, then formatted with timeZone: "UTC").
function formatEventWhen({
  startAt,
  endAt,
  allDay,
  timezoneOffset,
}: {
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezoneOffset: number;
}): string {
  const shiftMs = timezoneOffset * 3_600_000;
  const start = new Date(new Date(startAt).getTime() + shiftMs);
  const end = new Date(new Date(endAt).getTime() + shiftMs);
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  const gmt = `GMT${timezoneOffset >= 0 ? "+" : ""}${timezoneOffset}`;
  const sameDay = isSameUtcDate(start, end);

  if (allDay) {
    return sameDay ? dateFmt.format(start) : `${dateFmt.format(start)} - ${dateFmt.format(end)}`;
  }
  if (sameDay) {
    return `${dateFmt.format(start)}, ${timeFmt.format(start)} - ${timeFmt.format(end)} (${gmt})`;
  }
  return `${dateFmt.format(start)} ${timeFmt.format(start)} - ${dateFmt.format(end)} ${timeFmt.format(end)} (${gmt})`;
}

/**
 * Builds a self-contained, table-based HTML email confirming an event
 * registration. Shares the same brand shell as the contact confirmation -
 * see email-shell.ts for the Outlook-safe inlined-style rationale.
 */
export function buildEventRegistrationConfirmationEmail({
  name,
  eventTitle,
  eventSlug,
  startAt,
  endAt,
  allDay,
  timezoneOffset,
  location,
  siteUrl,
}: {
  name: string;
  eventTitle: string;
  eventSlug: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezoneOffset: number;
  location?: string;
  siteUrl: string;
}): string {
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(eventTitle);
  const when = escapeHtml(formatEventWhen({ startAt, endAt, allDay, timezoneOffset }));
  const eventUrl = `${siteUrl.replace(/\/$/, "")}/events/${encodeURIComponent(eventSlug)}`;

  const locationRow = location
    ? `
    <tr>
      <td style="padding:12px 22px 0 22px;font-family:Arial,Helvetica,sans-serif;">
        <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.ink3};">
          Location
        </p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:${BRAND.ink};">${escapeHtml(location)}</p>
      </td>
    </tr>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">
      Thanks for registering - your spot for <strong>${safeTitle}</strong> is confirmed.
      We&rsquo;ve received your details and can&rsquo;t wait to see you there.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background-color:${BRAND.surfaceMuted};border-left:4px solid ${BRAND.blue};border-radius:12px;">
      <tr>
        <td style="padding:20px 22px 12px 22px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.ink3};">
            Event
          </p>
          <p style="margin:0;font-size:15px;font-weight:700;color:${BRAND.ink};">${safeTitle}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 22px 20px 22px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.ink3};">
            When
          </p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:${BRAND.ink};">${when}</p>
        </td>
      </tr>${locationRow}
    </table>

    <p style="margin:0 0 28px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">
      Plans change - if you can no longer make it, no action is needed on your end,
      but we&rsquo;d appreciate a heads up so we can offer your spot to someone else.
    </p>
  `;

  return renderEmailShell({
    title: `You're registered - ${safeTitle} - MGM Laboratory`,
    previewText: `Hi ${safeName}, your registration for ${safeTitle} is confirmed.`,
    heading: `Hi ${safeName}, you&rsquo;re registered!`,
    bodyHtml,
    ctaLabel: "View event details",
    ctaHref: eventUrl,
    siteUrl,
  });
}
