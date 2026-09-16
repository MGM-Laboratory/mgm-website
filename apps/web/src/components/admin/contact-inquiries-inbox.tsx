"use client";

import { ArrowSquareOut, Paperclip } from "@phosphor-icons/react";
import type { Dispatch, SetStateAction } from "react";

import type { CmsContactInquiryRecord } from "@/lib/contact-inquiries-cms";
import {
  formatSubmittedDate,
  ResourceInboxShell,
  useResourceInbox,
} from "@/components/admin/resource-inbox";

const EMPTY_MESSAGES = {
  all: "No inquiries yet. They land here the moment someone submits the contact form.",
  archived: "Nothing archived yet.",
  unread: "Everything is read. Nice.",
};

/**
 * The contact inquiries inbox: an email-style two-pane reader, sharing its
 * behavior with the event-registrations inbox via resource-inbox.tsx. Every
 * /contact form submission is persisted here unconditionally — before the
 * reply email is even attempted — so an inquiry is never lost to an email
 * provider outage.
 */
export function ContactInquiriesInbox({
  records,
  setRecords,
}: Readonly<{
  records: CmsContactInquiryRecord[];
  setRecords: Dispatch<SetStateAction<CmsContactInquiryRecord[]>>;
}>) {
  const inbox = useResourceInbox({
    apiBase: "/api/admin/contact-inquiries",
    getState: (record) => record.inquiry,
    itemLabel: "inquiry",
    matchesQuery: (record, needle) =>
      `${record.inquiry.name} ${record.inquiry.email} ${record.inquiry.company ?? ""}`
        .toLocaleLowerCase()
        .includes(needle),
    records,
    setRecords,
    withState: (record, patch) => ({ ...record, inquiry: { ...record.inquiry, ...patch } }),
  });

  return (
    <ResourceInboxShell
      emptyDetailCopy={{
        description: "Message details appear here.",
        title: "Select an inquiry",
      }}
      emptyMessages={EMPTY_MESSAGES}
      getRowAriaLabel={(record) => `Select ${record.inquiry.name}`}
      inbox={inbox}
      renderDetail={(record) => (
        <>
          <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em]">
            {record.inquiry.name}
          </h2>
          {record.inquiry.company ? (
            <p className="mt-1 text-sm text-[#778299] dark:text-white/45">
              {record.inquiry.company}
            </p>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                Email
              </p>
              <a
                className="mt-1.5 block truncate text-sm font-semibold text-brand-blue hover:underline"
                href={`mailto:${record.inquiry.email}`}
              >
                {record.inquiry.email}
              </a>
            </div>
            <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                Attachments
              </p>
              <p className="mt-1.5 text-sm font-semibold text-[#171b25] dark:text-white">
                {record.inquiry.attachmentKeys.length
                  ? `${record.inquiry.attachmentKeys.length} file(s)`
                  : "None"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
              Message
            </p>
            <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap text-[#3e4859] dark:text-white/80">
              {record.inquiry.message}
            </p>
          </div>
        </>
      )}
      renderPrimaryAction={(record) => (
        <a
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
          href={`mailto:${record.inquiry.email}`}
          rel="noreferrer"
        >
          <ArrowSquareOut size={15} weight="bold" />
          Reply
        </a>
      )}
      renderRow={(record, { unread }) => (
        <span className="min-w-0 flex-1">
          <span
            className={`flex items-center gap-2 text-sm ${unread ? "font-bold" : "font-medium"}`}
          >
            {unread ? <span className="size-1.5 shrink-0 rounded-full bg-brand-blue" /> : null}
            <span className="truncate">{record.inquiry.name}</span>
            {record.inquiry.attachmentKeys.length ? (
              <Paperclip className="size-3.5 shrink-0 text-[#9ba4b5]" />
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[#778299] dark:text-white/45">
            {record.inquiry.email}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[#9ba4b5]">
            {record.inquiry.message} · {formatSubmittedDate(record.createdAt)}
          </span>
        </span>
      )}
      searchPlaceholder="Search name, email, or company"
      submittedLabel="Submitted"
    />
  );
}
