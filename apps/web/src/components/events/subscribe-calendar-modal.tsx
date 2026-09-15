"use client";

import {
  AppleLogo,
  Check,
  Copy,
  DownloadSimple,
  GoogleLogo,
  Link as LinkIcon,
  MicrosoftOutlookLogo,
  X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import {
  eventsFeedUrl,
  googleSubscribeUrl,
  outlookSubscribeUrl,
  webcalUrl,
} from "@/lib/events-ical";

function ProviderLink({
  download,
  href,
  icon,
  label,
}: {
  download?: boolean;
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      className="group flex items-center gap-3 rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--ink)] transition hover:border-brand-blue/50 hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 dark:border-white/10 dark:text-white dark:hover:bg-white/[0.04]"
      download={download}
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#9db8e8]">
        {icon}
      </span>
      {label}
    </a>
  );
}

export function SubscribeCalendarModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const feedUrl = eventsFeedUrl();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable — the link is still shown and selectable below.
    }
  }

  return (
    <div
      aria-labelledby="subscribe-calendar-title"
      aria-modal="true"
      className="fixed inset-0 z-[110] grid place-items-center bg-[var(--surface-inverse)]/60 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
      role="dialog"
    >
      <section
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-3)] dark:border-white/10 dark:bg-[#12151c]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-6 py-5 dark:border-white/10">
          <div>
            <h2
              className="font-display text-xl font-semibold tracking-[-0.02em] text-[var(--ink)] dark:text-white"
              id="subscribe-calendar-title"
            >
              Subscribe to the events calendar
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
              New and updated events sync automatically to your calendar app.
            </p>
          </div>
          <button
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--ink-3)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] dark:hover:bg-white/10 dark:hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="flex flex-col gap-2 px-6 py-5">
          <ProviderLink
            href={googleSubscribeUrl(feedUrl)}
            icon={<GoogleLogo size={18} weight="bold" />}
            label="Google Calendar"
          />
          <ProviderLink
            href={webcalUrl(feedUrl)}
            icon={<AppleLogo size={18} weight="fill" />}
            label="Apple Calendar (iCal)"
          />
          <ProviderLink
            href={outlookSubscribeUrl(feedUrl)}
            icon={<MicrosoftOutlookLogo size={18} weight="bold" />}
            label="Outlook"
          />
          <ProviderLink
            download
            href={feedUrl}
            icon={<DownloadSimple size={18} weight="bold" />}
            label="Download .ics file"
          />

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <LinkIcon
              aria-hidden="true"
              className="shrink-0 text-[var(--ink-3)]"
              size={16}
              weight="bold"
            />
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-2)] dark:text-white/60">
              {feedUrl}
            </span>
            <button
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand-blue transition hover:bg-brand-blue-50 dark:hover:bg-brand-blue/15"
              onClick={copyLink}
              type="button"
            >
              {copied ? (
                <>
                  <Check size={13} weight="bold" /> Copied
                </>
              ) : (
                <>
                  <Copy size={13} weight="bold" /> Copy
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
