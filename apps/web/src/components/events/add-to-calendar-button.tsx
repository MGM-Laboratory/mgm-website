"use client";

import {
  AppleLogo,
  CalendarPlus,
  DownloadSimple,
  GoogleLogo,
  MicrosoftOutlookLogo,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { useDismissableOpen } from "@/hooks/use-dismissable-open";
import { buildGoogleCalendarUrl, buildOutlookUrl } from "@/lib/calendar-links";
import { env } from "@/lib/env";
import type { CmsEventRecord } from "@/lib/events-cms";

/**
 * Adds ONLY this event to whichever calendar the visitor picks — Google and
 * Outlook open a prefilled "quick add" page in a new tab, Apple/other
 * downloads the single-event .ics generated server-side (reusing the same
 * VEVENT writer as the whole-feed subscription, so the two never drift).
 */
export function AddToCalendarButton({ event }: { event: CmsEventRecord }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissableOpen(ref, open, setOpen);

  const icsUrl = `${env.NEXT_PUBLIC_API_URL}/cms/events/${encodeURIComponent(event.slug)}/calendar.ics`;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] transition hover:border-brand-blue/50 hover:text-brand-blue dark:border-white/10 dark:text-white"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <CalendarPlus size={16} weight="bold" />
        Add to calendar
      </button>
      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-64 rounded-2xl border border-[var(--line)] bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-[#12151c]"
          role="menu"
        >
          <a
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--surface-muted)] dark:text-white dark:hover:bg-white/[0.06]"
            href={buildGoogleCalendarUrl(event)}
            onClick={() => setOpen(false)}
            rel="noreferrer noopener"
            role="menuitem"
            target="_blank"
          >
            <GoogleLogo size={17} weight="bold" /> Google Calendar
          </a>
          <a
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--surface-muted)] dark:text-white dark:hover:bg-white/[0.06]"
            href={buildOutlookUrl(event)}
            onClick={() => setOpen(false)}
            rel="noreferrer noopener"
            role="menuitem"
            target="_blank"
          >
            <MicrosoftOutlookLogo size={17} weight="bold" /> Outlook
          </a>
          <a
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--surface-muted)] dark:text-white dark:hover:bg-white/[0.06]"
            href={icsUrl}
            onClick={() => setOpen(false)}
            rel="noreferrer noopener"
            role="menuitem"
            target="_blank"
          >
            <AppleLogo size={17} weight="fill" /> Apple / iCal
          </a>
          <a
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--surface-muted)] dark:text-white dark:hover:bg-white/[0.06]"
            href={icsUrl}
            onClick={() => setOpen(false)}
            rel="noreferrer noopener"
            role="menuitem"
            target="_blank"
          >
            <DownloadSimple size={17} weight="bold" /> Download .ics
          </a>
        </div>
      ) : null}
    </div>
  );
}
