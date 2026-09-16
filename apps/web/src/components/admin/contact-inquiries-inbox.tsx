"use client";

import {
  Archive,
  ArrowSquareOut,
  Envelope,
  EnvelopeOpen,
  MagnifyingGlass,
  Paperclip,
  Trash,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { CmsContactInquiryRecord } from "@/lib/contact-inquiries-cms";

type Filter = "all" | "unread" | "archived";
type BulkAction = "archive" | "markUnread" | "delete";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  unread: "Unread",
  archived: "Archived",
};

function formatSubmittedDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The contact inquiries inbox: an email-style two-pane reader, mirroring the
 * event-registrations inbox. Every /contact form submission is persisted
 * here unconditionally — before the reply email is even attempted — so an
 * inquiry is never lost to an email provider outage.
 */
export function ContactInquiriesInbox({
  records,
  setRecords,
}: {
  records: CmsContactInquiryRecord[];
  setRecords: React.Dispatch<React.SetStateAction<CmsContactInquiryRecord[]>>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastClickedIndex = useRef(-1);

  const counts = useMemo(
    () => ({
      all: records.filter((record) => record.inquiry.status === "inbox").length,
      unread: records.filter((record) => record.inquiry.status === "inbox" && !record.inquiry.read)
        .length,
      archived: records.filter((record) => record.inquiry.status === "archived").length,
    }),
    [records],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      const inquiry = record.inquiry;
      if (filter === "archived" && inquiry.status !== "archived") return false;
      if (filter !== "archived" && inquiry.status !== "inbox") return false;
      if (filter === "unread" && inquiry.read) return false;
      if (
        needle &&
        !`${inquiry.name} ${inquiry.email} ${inquiry.company ?? ""}`
          .toLocaleLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [filter, query, records]);

  const selected = records.find((record) => record.slug === selectedSlug);

  const patchState = async (
    slug: string,
    patch: { read?: boolean; status?: "inbox" | "archived" },
  ) => {
    const previous = records;
    setRecords((current) =>
      current.map((record) =>
        record.slug === slug
          ? {
              ...record,
              inquiry: {
                ...record.inquiry,
                ...patch,
                ...(patch.read !== undefined
                  ? { readAt: patch.read ? new Date().toISOString() : null }
                  : {}),
              },
            }
          : record,
      ),
    );
    try {
      const response = await fetch(`/api/admin/contact-inquiries/${encodeURIComponent(slug)}`, {
        body: JSON.stringify(patch),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) throw new Error(`The API answered ${response.status}.`);
    } catch (error) {
      setRecords(previous);
      toast.error("Could not update the inquiry.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const open = (slug: string) => {
    setSelectedSlug(slug);
    const record = records.find((item) => item.slug === slug);
    if (record && !record.inquiry.read && record.inquiry.status === "inbox") {
      void patchState(slug, { read: true });
    }
  };

  const bulk = async (action: BulkAction) => {
    if (!selectedIds.size) return;
    if (action === "delete" && !window.confirm(`Delete ${selectedIds.size} inquiry(ies)?`)) {
      return;
    }
    const ids = [...selectedIds];
    const previous = records;
    try {
      const response = await fetch("/api/admin/contact-inquiries/bulk", {
        body: JSON.stringify({ ids, action }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(`The API answered ${response.status}.`);
      if (action === "delete") {
        setRecords((current) => current.filter((record) => !selectedIds.has(record.slug)));
        setSelectedSlug((current) => (current && selectedIds.has(current) ? undefined : current));
        toast.success(`${ids.length} inquiry(ies) deleted.`);
      } else {
        setRecords((current) =>
          current.map((record) =>
            selectedIds.has(record.slug)
              ? {
                  ...record,
                  inquiry: {
                    ...record.inquiry,
                    ...(action === "archive"
                      ? { status: "archived" as const }
                      : { read: false, readAt: null }),
                  },
                }
              : record,
          ),
        );
        toast.success(action === "archive" ? "Archived." : "Marked unread.");
      }
      setSelectedIds(new Set());
      lastClickedIndex.current = -1;
    } catch (error) {
      setRecords(previous);
      toast.error("The bulk action failed.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const toggleRow = (index: number, checked: boolean, shiftKey: boolean) => {
    const slug = filtered[index]?.slug;
    if (!slug) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (shiftKey && lastClickedIndex.current >= 0) {
        const from = Math.min(lastClickedIndex.current, index);
        const to = Math.max(lastClickedIndex.current, index);
        for (let cursor = from; cursor <= to; cursor += 1) {
          const rangeSlug = filtered[cursor]?.slug;
          if (rangeSlug) next.add(rangeSlug);
        }
      } else if (checked) {
        next.add(slug);
      } else {
        next.delete(slug);
      }
      return next;
    });
    lastClickedIndex.current = index;
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((record) => selectedIds.has(record.slug));

  return (
    <div className="mt-8 grid overflow-hidden rounded-2xl border border-[#dfe4ee] bg-white shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] lg:grid-cols-[22rem_minmax(0,1fr)] dark:border-white/10 dark:bg-white/[0.035]">
      <div className="flex min-h-0 flex-col border-b border-[#dee4ef] dark:border-white/10 lg:border-b-0 lg:border-r">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-1.5">
            {(Object.keys(FILTER_LABELS) as Filter[]).map((value) => (
              <button
                aria-current={filter === value ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === value ? "bg-[#171b25] text-white dark:bg-white dark:text-[#0e1116]" : "bg-[#f2f5fa] text-[#5d687d] hover:text-[#171b25] dark:bg-white/[0.06] dark:text-white/55 dark:hover:text-white"}`}
                key={value}
                onClick={() => {
                  setFilter(value);
                  setSelectedIds(new Set());
                  lastClickedIndex.current = -1;
                }}
                type="button"
              >
                {FILTER_LABELS[value]} · {counts[value]}
              </button>
            ))}
          </div>
          <div className="relative">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
              size={16}
            />
            <input
              className="h-9 w-full rounded-xl border border-[#d9dfeb] bg-white pl-9 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, or company"
              value={query}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-y border-[#dee4ef] px-4 py-2 dark:border-white/10">
          <input
            aria-label="Select all visible inquiries"
            checked={allVisibleSelected}
            className="size-4 accent-brand-blue"
            onChange={(event) => {
              if (event.target.checked) {
                setSelectedIds(new Set(filtered.map((record) => record.slug)));
                lastClickedIndex.current = -1;
              } else {
                setSelectedIds(new Set());
              }
            }}
            type="checkbox"
          />
          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-[#5d687d] dark:text-white/55">
                {selectedIds.size} selected
              </span>
              <button
                className="rounded-lg border border-[#d9dfeb] px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                onClick={() => void bulk("archive")}
                title="Archive"
                type="button"
              >
                <Archive size={14} weight="bold" />
              </button>
              <button
                className="rounded-lg border border-[#d9dfeb] px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                onClick={() => void bulk("markUnread")}
                title="Mark unread"
                type="button"
              >
                <Envelope size={14} weight="bold" />
              </button>
              <button
                className="rounded-lg border border-[#d9dfeb] px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:border-brand-red/40 hover:text-brand-red dark:border-white/10 dark:text-white/55"
                onClick={() => void bulk("delete")}
                title="Delete"
                type="button"
              >
                <Trash size={14} weight="bold" />
              </button>
            </div>
          ) : (
            <span className="text-xs font-semibold text-[#9ba4b5]">Select</span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.map((record, index) => {
            const inquiry = record.inquiry;
            const unread = inquiry.status === "inbox" && !inquiry.read;
            const active = record.slug === selectedSlug;
            return (
              <button
                className={`flex w-full items-center gap-3 border-b border-[#eef1f7] px-4 py-3 text-left transition dark:border-white/[0.06] ${active ? "bg-brand-blue/[0.06]" : "hover:bg-[#f7f9fd] dark:hover:bg-white/[0.04]"}`}
                key={record.slug}
                onClick={() => open(record.slug)}
                type="button"
              >
                <input
                  aria-label={`Select ${inquiry.name}`}
                  checked={selectedIds.has(record.slug)}
                  className="size-4 shrink-0 accent-brand-blue"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    toggleRow(
                      index,
                      event.target.checked,
                      (event.nativeEvent as MouseEvent).shiftKey,
                    )
                  }
                  type="checkbox"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`flex items-center gap-2 text-sm ${unread ? "font-bold" : "font-medium"}`}
                  >
                    {unread ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-brand-blue" />
                    ) : null}
                    <span className="truncate">{inquiry.name}</span>
                    {inquiry.attachmentKeys.length ? (
                      <Paperclip className="size-3.5 shrink-0 text-[#9ba4b5]" />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[#778299] dark:text-white/45">
                    {inquiry.email}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[#9ba4b5]">
                    {inquiry.message} · {formatSubmittedDate(record.createdAt)}
                  </span>
                </span>
                {inquiry.status === "archived" ? (
                  <span className="shrink-0 rounded-full bg-[#e8ecf4] px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[#667187] uppercase">
                    Archived
                  </span>
                ) : null}
              </button>
            );
          })}
          {!filtered.length ? (
            <p className="px-4 py-10 text-center text-sm leading-6 text-[#9ba4b5]">
              {filter === "archived"
                ? "Nothing archived yet."
                : filter === "unread"
                  ? "Everything is read. Nice."
                  : "No inquiries yet. They land here the moment someone submits the contact form."}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-h-[480px] p-6 sm:p-8">
        {selected ? (
          <div className="admin-editor-enter">
            <p className="text-xs text-[#9ba4b5]">
              Submitted {formatSubmittedDate(selected.createdAt)}
            </p>

            <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em]">
              {selected.inquiry.name}
            </h2>
            {selected.inquiry.company ? (
              <p className="mt-1 text-sm text-[#778299] dark:text-white/45">
                {selected.inquiry.company}
              </p>
            ) : null}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                  Email
                </p>
                <a
                  className="mt-1.5 block truncate text-sm font-semibold text-brand-blue hover:underline"
                  href={`mailto:${selected.inquiry.email}`}
                >
                  {selected.inquiry.email}
                </a>
              </div>
              <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                  Attachments
                </p>
                <p className="mt-1.5 text-sm font-semibold text-[#171b25] dark:text-white">
                  {selected.inquiry.attachmentKeys.length
                    ? `${selected.inquiry.attachmentKeys.length} file(s)`
                    : "None"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                Message
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#3e4859] dark:text-white/80">
                {selected.inquiry.message}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-[#dee4ef] pt-5 dark:border-white/10">
              {selected.inquiry.status === "archived" ? (
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                  onClick={() => void patchState(selected.slug, { status: "inbox" })}
                  type="button"
                >
                  <Envelope size={15} weight="bold" />
                  Move to inbox
                </button>
              ) : (
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                  onClick={() => void patchState(selected.slug, { status: "archived" })}
                  type="button"
                >
                  <Archive size={15} weight="bold" />
                  Archive
                </button>
              )}
              <button
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                onClick={() => void patchState(selected.slug, { read: !selected.inquiry.read })}
                type="button"
              >
                {selected.inquiry.read ? (
                  <>
                    <Envelope size={15} weight="bold" />
                    Mark unread
                  </>
                ) : (
                  <>
                    <EnvelopeOpen size={15} weight="bold" />
                    Mark read
                  </>
                )}
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-red/40 hover:text-brand-red dark:border-white/10 dark:text-white/55"
                onClick={() => {
                  setSelectedIds(new Set([selected.slug]));
                  void bulk("delete");
                }}
                type="button"
              >
                <Trash size={15} weight="bold" />
                Delete
              </button>
              <a
                className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
                href={`mailto:${selected.inquiry.email}`}
                rel="noreferrer"
              >
                <ArrowSquareOut size={15} weight="bold" />
                Reply
              </a>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[420px] place-items-center text-center">
            <div>
              <EnvelopeOpen className="mx-auto text-[#c3cad9] dark:text-white/20" size={36} />
              <p className="mt-4 font-display text-lg font-semibold tracking-[-0.03em]">
                Select an inquiry
              </p>
              <p className="mt-1 max-w-xs text-sm leading-6 text-[#778299] dark:text-white/45">
                Message details appear here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
