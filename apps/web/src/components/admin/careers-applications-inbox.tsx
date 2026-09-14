"use client";

import {
  Archive,
  ArrowSquareOut,
  DownloadSimple,
  Envelope,
  EnvelopeOpen,
  FileText,
  MagnifyingGlass,
  Trash,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { CmsJobApplicationRecord } from "@/lib/career-cms";

type Filter = "all" | "unread" | "archived";
type BulkAction = "archive" | "markUnread" | "delete";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  unread: "Unread",
  archived: "Archived",
};

const APPLICANT_BADGE: Record<string, string> = {
  "ub-student": "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20 dark:text-[#9db8e8]",
  general: "bg-brand-green-50 text-brand-green dark:bg-brand-green/20 dark:text-[#6fd3a5]",
};

function formatAppliedDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The applications inbox: an email-style two-pane reader. Applications start
 * unread, flip to read when opened, and can be archived or deleted alone or
 * in bulk. Admin contacts applicants themselves — this surface only shows
 * data and hands out the CV.
 */
export function ApplicationsInbox({
  records,
  setRecords,
}: {
  records: CmsJobApplicationRecord[];
  setRecords: React.Dispatch<React.SetStateAction<CmsJobApplicationRecord[]>>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detail, setDetail] = useState<{ record: CmsJobApplicationRecord; cvUrl: string | null }>();
  const [detailBusy, setDetailBusy] = useState(false);
  const lastClickedIndex = useRef(-1);

  const counts = useMemo(
    () => ({
      all: records.filter((record) => record.application.status === "inbox").length,
      unread: records.filter(
        (record) => record.application.status === "inbox" && !record.application.read,
      ).length,
      archived: records.filter((record) => record.application.status === "archived").length,
    }),
    [records],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      const application = record.application;
      if (filter === "archived" && application.status !== "archived") return false;
      if (filter !== "archived" && application.status !== "inbox") return false;
      if (filter === "unread" && application.read) return false;
      if (
        needle &&
        !`${application.fullName} ${application.email}`.toLocaleLowerCase().includes(needle)
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
              application: {
                ...record.application,
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
      const response = await fetch(`/api/admin/applications/${encodeURIComponent(slug)}`, {
        body: JSON.stringify(patch),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) throw new Error(`The API answered ${response.status}.`);
      window.dispatchEvent(new CustomEvent("mgm:application-updated"));
    } catch (error) {
      setRecords(previous);
      toast.error("Could not update the application.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const open = async (slug: string) => {
    setSelectedSlug(slug);
    setDetail(undefined);
    setDetailBusy(true);
    const record = records.find((item) => item.slug === slug);
    if (record && !record.application.read && record.application.status === "inbox") {
      // Optimistic read state; the list re-sorts nothing but unbolds the row.
      void patchState(slug, { read: true });
    }
    try {
      const response = await fetch(`/api/admin/applications/${encodeURIComponent(slug)}`);
      const payload = (await response.json()) as {
        record?: CmsJobApplicationRecord;
        cvUrl?: string | null;
      };
      if (!response.ok || !payload.record) throw new Error(`The API answered ${response.status}.`);
      setDetail({ record: payload.record, cvUrl: payload.cvUrl ?? null });
    } catch (error) {
      toast.error("Could not load the application.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDetailBusy(false);
    }
  };

  const bulk = async (action: BulkAction) => {
    if (!selectedIds.size) return;
    if (
      action === "delete" &&
      !window.confirm(
        `Delete ${selectedIds.size} application(s)? Their CVs are removed from storage too.`,
      )
    ) {
      return;
    }
    const ids = [...selectedIds];
    const previous = records;
    try {
      const response = await fetch("/api/admin/applications", {
        body: JSON.stringify({ ids, action }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(`The API answered ${response.status}.`);
      if (action === "delete") {
        setRecords((current) => current.filter((record) => !selectedIds.has(record.slug)));
        setSelectedSlug((current) => (current && selectedIds.has(current) ? undefined : current));
        setDetail(undefined);
        toast.success(`${ids.length} application(s) deleted.`);
      } else {
        setRecords((current) =>
          current.map((record) =>
            selectedIds.has(record.slug)
              ? {
                  ...record,
                  application: {
                    ...record.application,
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
      window.dispatchEvent(new CustomEvent("mgm:application-updated"));
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
      {/* List pane */}
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
              placeholder="Search name or email"
              value={query}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-y border-[#dee4ef] px-4 py-2 dark:border-white/10">
          <input
            aria-label="Select all visible applications"
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
            const application = record.application;
            const unread = application.status === "inbox" && !application.read;
            const active = record.slug === selectedSlug;
            return (
              <button
                className={`flex w-full items-center gap-3 border-b border-[#eef1f7] px-4 py-3 text-left transition dark:border-white/[0.06] ${active ? "bg-brand-blue/[0.06]" : "hover:bg-[#f7f9fd] dark:hover:bg-white/[0.04]"}`}
                key={record.slug}
                onClick={() => void open(record.slug)}
                type="button"
              >
                <input
                  aria-label={`Select ${application.fullName}`}
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
                    <span className="truncate">{application.fullName}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[#778299] dark:text-white/45">
                    {application.email}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[#9ba4b5]">
                    {application.jobTitle} · {formatAppliedDate(record.createdAt)}
                  </span>
                </span>
                {application.status === "archived" ? (
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
                  : "No applications yet. They land here the moment someone applies."}
            </p>
          ) : null}
        </div>
      </div>

      {/* Detail pane */}
      <div className="min-h-[480px] p-6 sm:p-8">
        {selected ? (
          <div className="admin-editor-enter">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase ${APPLICANT_BADGE[selected.application.applicantType] ?? APPLICANT_BADGE.general}`}
              >
                {selected.application.applicantType === "ub-student"
                  ? "Universitas Brawijaya"
                  : "General applicant"}
              </span>
              <span className="text-xs text-[#9ba4b5]">
                Applied {formatAppliedDate(selected.createdAt)}
              </span>
            </div>

            <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em]">
              {selected.application.fullName}
            </h2>
            <p className="mt-1 text-sm text-[#778299] dark:text-white/45">
              {selected.application.jobTitle}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                  Email
                </p>
                <a
                  className="mt-1.5 block truncate text-sm font-semibold text-brand-blue hover:underline"
                  href={`mailto:${selected.application.email}`}
                >
                  {selected.application.email}
                </a>
              </div>
              <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                  Phone
                </p>
                <a
                  className="mt-1.5 block truncate text-sm font-semibold text-brand-blue hover:underline"
                  href={`tel:${selected.application.phoneCountry}${selected.application.phoneNumber}`}
                >
                  {selected.application.phoneCountry} {selected.application.phoneNumber}
                </a>
              </div>
              {selected.application.applicantType === "ub-student" ? (
                <>
                  <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                      NIM / NIDN / NIP
                    </p>
                    <p className="mt-1.5 truncate text-sm font-semibold">
                      {selected.application.nim}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                      Faculty
                    </p>
                    <p className="mt-1.5 truncate text-sm font-semibold">
                      {selected.application.faculty}
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            <div className="mt-6">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                Why they want to join
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-[#eef1f7] bg-white p-4 text-sm leading-6 text-[#3e4859] dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/80">
                {selected.application.motivation}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {detailBusy ? (
                <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold text-[#8490a5] dark:border-white/10">
                  Loading CV link…
                </span>
              ) : detail?.cvUrl ? (
                <a
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#171b25] px-4 text-sm font-semibold text-white transition hover:bg-brand-blue"
                  download
                  href={detail.cvUrl}
                >
                  <DownloadSimple size={16} weight="bold" />
                  Download CV
                </a>
              ) : (
                <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold text-[#8490a5] dark:border-white/10">
                  <FileText size={16} weight="bold" />
                  CV unavailable
                </span>
              )}
              <span className="text-xs text-[#9ba4b5]">
                {selected.application.cvFilename}
                {selected.application.cvContentType
                  ? ` · ${selected.application.cvContentType.replace("application/", "")}`
                  : ""}
              </span>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-[#dee4ef] pt-5 dark:border-white/10">
              {selected.application.status === "archived" ? (
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
                onClick={() => void patchState(selected.slug, { read: !selected.application.read })}
                type="button"
              >
                {selected.application.read ? (
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
                onClick={() => void bulk("delete")}
                type="button"
              >
                <Trash size={15} weight="bold" />
                Delete
              </button>
              <a
                className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
                href={`/careers/${selected.application.jobSlug}`}
                rel="noreferrer"
                target="_blank"
              >
                <ArrowSquareOut size={15} weight="bold" />
                View role
              </a>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[420px] place-items-center text-center">
            <div>
              <EnvelopeOpen className="mx-auto text-[#c3cad9] dark:text-white/20" size={36} />
              <p className="mt-4 font-display text-lg font-semibold tracking-[-0.03em]">
                Select an application
              </p>
              <p className="mt-1 max-w-xs text-sm leading-6 text-[#778299] dark:text-white/45">
                Applicant details, their motivation, and a CV download link appear here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
