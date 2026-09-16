"use client";

import { ArrowSquareOut } from "@phosphor-icons/react";
import type { Dispatch, SetStateAction } from "react";

import type { CmsEventRegistrationRecord } from "@/lib/events-cms";
import {
  formatSubmittedDate,
  ResourceInboxShell,
  useResourceInbox,
} from "@/components/admin/resource-inbox";

const EMPTY_MESSAGES = {
  all: "No registrations yet. They land here the moment someone registers.",
  archived: "Nothing archived yet.",
  unread: "Everything is read. Nice.",
};

/**
 * The registrations inbox: an email-style two-pane reader, sharing its
 * behavior with the contact-inquiries inbox via resource-inbox.tsx.
 * Registrations start unread, flip to read when opened, and can be archived
 * or deleted alone or in bulk.
 */
export function EventRegistrationsInbox({
  records,
  setRecords,
}: Readonly<{
  records: CmsEventRegistrationRecord[];
  setRecords: Dispatch<SetStateAction<CmsEventRegistrationRecord[]>>;
}>) {
  const inbox = useResourceInbox({
    apiBase: "/api/admin/events/registrations",
    getState: (record) => record.registration,
    itemLabel: "registration",
    matchesQuery: (record, needle) =>
      `${record.registration.fullName} ${record.registration.email} ${record.registration.eventTitle}`
        .toLocaleLowerCase()
        .includes(needle),
    onMutated: () => window.dispatchEvent(new CustomEvent("mgm:event-registration-updated")),
    records,
    setRecords,
    withState: (record, patch) => ({
      ...record,
      registration: { ...record.registration, ...patch },
    }),
  });

  return (
    <ResourceInboxShell
      emptyDetailCopy={{
        description: "Attendee details appear here.",
        title: "Select a registration",
      }}
      emptyMessages={EMPTY_MESSAGES}
      getRowAriaLabel={(record) => `Select ${record.registration.fullName}`}
      inbox={inbox}
      renderDetail={(record) => (
        <>
          <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em]">
            {record.registration.fullName}
          </h2>
          <p className="mt-1 text-sm text-[#778299] dark:text-white/45">
            {record.registration.eventTitle}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                Email
              </p>
              <a
                className="mt-1.5 block truncate text-sm font-semibold text-brand-blue hover:underline"
                href={`mailto:${record.registration.email}`}
              >
                {record.registration.email}
              </a>
            </div>
            <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                Phone
              </p>
              <a
                className="mt-1.5 block truncate text-sm font-semibold text-brand-blue hover:underline"
                href={`tel:${record.registration.phone}`}
              >
                {record.registration.phone}
              </a>
            </div>
          </div>
        </>
      )}
      renderPrimaryAction={(record) => (
        <a
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
          href={`/events/${record.registration.eventSlug}`}
          rel="noreferrer"
          target="_blank"
        >
          <ArrowSquareOut size={15} weight="bold" />
          View event
        </a>
      )}
      renderRow={(record, { unread }) => (
        <span className="min-w-0 flex-1">
          <span
            className={`flex items-center gap-2 text-sm ${unread ? "font-bold" : "font-medium"}`}
          >
            {unread ? <span className="size-1.5 shrink-0 rounded-full bg-brand-blue" /> : null}
            <span className="truncate">{record.registration.fullName}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-[#778299] dark:text-white/45">
            {record.registration.email}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[#9ba4b5]">
            {record.registration.eventTitle} · {formatSubmittedDate(record.createdAt)}
          </span>
        </span>
      )}
      searchPlaceholder="Search name, email, or event"
      submittedLabel="Registered"
    />
  );
}
