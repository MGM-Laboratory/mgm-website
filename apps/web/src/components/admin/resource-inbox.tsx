"use client";

import { Archive, Envelope, EnvelopeOpen, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";

/**
 * Shared shape and state machine behind every email-style two-pane admin
 * inbox (contact inquiries, event registrations, ...): filter/search/select,
 * optimistic patch-with-rollback, and bulk archive/unarchive/mark/delete.
 * Resource-specific rendering (row content, detail panel, copy) is supplied
 * by the caller — this owns only the behavior that's identical everywhere.
 */
export type InboxItemState = {
  read: boolean;
  readAt: string | null;
  status: "inbox" | "archived";
};

export type InboxFilter = "all" | "unread" | "archived";
type BulkAction = "archive" | "markUnread" | "delete";

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: "All",
  unread: "Unread",
  archived: "Archived",
};

export function formatSubmittedDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type InboxRecord = { slug: string; createdAt?: string };

export type UseResourceInboxOptions<TRecord extends InboxRecord> = {
  records: TRecord[];
  setRecords: Dispatch<SetStateAction<TRecord[]>>;
  getState: (record: TRecord) => InboxItemState;
  withState: (record: TRecord, patch: Partial<InboxItemState>) => TRecord;
  matchesQuery: (record: TRecord, needle: string) => boolean;
  apiBase: string;
  itemLabel: string;
  readOnly?: boolean;
  /** Appended to the bulk-delete confirm prompt, e.g. a note about side effects. */
  deleteConfirmSuffix?: string;
  onMutated?: () => void;
};

/**
 * Owns shared inbox filtering, selection, and mutation requests. Single-item
 * state changes are optimistic and roll back on failure; bulk changes apply
 * after the API succeeds.
 */
export function useResourceInbox<TRecord extends InboxRecord>({
  records,
  setRecords,
  getState,
  withState,
  matchesQuery,
  apiBase,
  itemLabel,
  readOnly = false,
  deleteConfirmSuffix,
  onMutated,
}: UseResourceInboxOptions<TRecord>) {
  const [filterState, setFilterState] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastClickedIndex = useRef(-1);

  const resetSelection = () => {
    setSelectedIds(new Set());
    lastClickedIndex.current = -1;
  };

  const setFilter = (value: InboxFilter) => {
    setFilterState(value);
    resetSelection();
  };

  const counts = useMemo(
    () => ({
      all: records.filter((record) => getState(record).status === "inbox").length,
      unread: records.filter(
        (record) => getState(record).status === "inbox" && !getState(record).read,
      ).length,
      archived: records.filter((record) => getState(record).status === "archived").length,
    }),
    [records, getState],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      const state = getState(record);
      if (filterState === "archived" && state.status !== "archived") return false;
      if (filterState !== "archived" && state.status !== "inbox") return false;
      if (filterState === "unread" && state.read) return false;
      // skipcq: JS-W1041 -- guard clauses read clearer here than one large boolean expression.
      if (needle && !matchesQuery(record, needle)) return false;
      return true;
    });
  }, [filterState, query, records, getState, matchesQuery]);

  const selected = records.find((record) => record.slug === selectedSlug);

  const patchState = async (slug: string, patch: Partial<InboxItemState>) => {
    const previous = records;
    setRecords((current) =>
      current.map((record) =>
        record.slug === slug
          ? withState(record, {
              ...patch,
              ...(patch.read !== undefined
                ? { readAt: patch.read ? new Date().toISOString() : null }
                : {}),
            })
          : record,
      ),
    );
    try {
      const response = await fetch(`${apiBase}/${encodeURIComponent(slug)}`, {
        body: JSON.stringify(patch),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) throw new Error(`The API answered ${response.status}.`);
      onMutated?.();
    } catch (error) {
      setRecords(previous);
      toast.error(`Could not update the ${itemLabel}.`, {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const open = (slug: string) => {
    setSelectedSlug(slug);
    const record = records.find((item) => item.slug === slug);
    if (!record) return;
    const state = getState(record);
    if (!readOnly && !state.read && state.status === "inbox") patchState(slug, { read: true });
  };

  const performBulk = async (ids: string[], action: BulkAction) => {
    if (readOnly || !ids.length) return;
    const suffix = deleteConfirmSuffix ? ` ${deleteConfirmSuffix}` : "";
    const confirmMessage = `Delete ${ids.length} ${itemLabel}(s)?${suffix}`;
    // skipcq: JS-0052 -- a native confirm is the intentional, minimal UX here; no modal system exists in this admin panel yet.
    if (action === "delete" && !window.confirm(confirmMessage)) {
      return;
    }
    const idSet = new Set(ids);
    const previous = records;
    try {
      const response = await fetch(`${apiBase}/bulk`, {
        body: JSON.stringify({ ids, action }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(`The API answered ${response.status}.`);
      if (action === "delete") {
        setRecords((current) => current.filter((record) => !idSet.has(record.slug)));
        setSelectedSlug((current) => (current && idSet.has(current) ? undefined : current));
        toast.success(`${ids.length} ${itemLabel}(s) deleted.`);
      } else {
        const patch: Partial<InboxItemState> =
          action === "archive" ? { status: "archived" } : { read: false, readAt: null };
        setRecords((current) =>
          current.map((record) => (idSet.has(record.slug) ? withState(record, patch) : record)),
        );
        toast.success(action === "archive" ? "Archived." : "Marked unread.");
      }
      onMutated?.();
      resetSelection();
    } catch (error) {
      setRecords(previous);
      toast.error("The bulk action failed.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const bulk = (action: BulkAction) => performBulk([...selectedIds], action);

  const deleteOne = (slug: string) => {
    performBulk([slug], "delete");
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

  return {
    allVisibleSelected,
    bulk,
    counts,
    deleteOne,
    filter: filterState,
    filtered,
    getState,
    open,
    patchState,
    query,
    readOnly,
    selected,
    selectedIds,
    setFilter,
    setQuery,
    setSelectedIds,
    toggleRow,
  };
}

export type ResourceInbox<TRecord extends InboxRecord> = ReturnType<
  typeof useResourceInbox<TRecord>
>;

/**
 * Renders the shared two-pane inbox around resource-specific row, detail, and
 * primary-action renderers supplied by the caller.
 */
export function ResourceInboxShell<TRecord extends InboxRecord>({
  inbox,
  searchPlaceholder,
  emptyMessages,
  emptyDetailCopy,
  submittedLabel,
  renderRow,
  getRowAriaLabel,
  renderDetail,
  renderPrimaryAction,
}: Readonly<{
  inbox: ResourceInbox<TRecord>;
  searchPlaceholder: string;
  emptyMessages: Record<InboxFilter, string>;
  emptyDetailCopy: { title: string; description: string };
  submittedLabel: string;
  renderRow: (record: TRecord, opts: { unread: boolean }) => ReactNode;
  getRowAriaLabel: (record: TRecord) => string;
  renderDetail: (record: TRecord) => ReactNode;
  renderPrimaryAction: (record: TRecord) => ReactNode;
}>) {
  const {
    allVisibleSelected,
    bulk,
    counts,
    deleteOne,
    filter,
    filtered,
    getState,
    open,
    patchState,
    query,
    readOnly,
    selected,
    selectedIds,
    setFilter,
    setQuery,
    setSelectedIds,
    toggleRow,
  } = inbox;

  return (
    <div className="mt-8 grid overflow-hidden rounded-2xl border border-[#dfe4ee] bg-white shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] lg:grid-cols-[22rem_minmax(0,1fr)] dark:border-white/10 dark:bg-white/[0.035]">
      <div className="flex min-h-0 flex-col border-b border-[#dee4ef] dark:border-white/10 lg:border-b-0 lg:border-r">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-1.5">
            {(Object.keys(FILTER_LABELS) as InboxFilter[]).map((value) => (
              <button
                aria-current={filter === value ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === value ? "bg-[#171b25] text-white dark:bg-white dark:text-[#0e1116]" : "bg-[#f2f5fa] text-[#5d687d] hover:text-[#171b25] dark:bg-white/[0.06] dark:text-white/55 dark:hover:text-white"}`}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {FILTER_LABELS[value]} · {counts[value]}
              </button>
            ))}
          </div>
          <div className="relative">
            <MagnifyingGlass
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#8490a5]"
              size={16}
            />
            <input
              className="h-9 w-full rounded-xl border border-[#d9dfeb] bg-white pl-9 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              value={query}
            />
          </div>
        </div>

        {!readOnly ? (
          <div className="flex items-center gap-3 border-y border-[#dee4ef] px-4 py-2 dark:border-white/10">
            <input
              aria-label="Select all visible items"
              checked={allVisibleSelected}
              className="size-4 accent-brand-blue"
              onChange={(event) => {
                if (event.target.checked) {
                  setSelectedIds(new Set(filtered.map((record) => record.slug)));
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
                  onClick={() => {
                    bulk("archive");
                  }}
                  title="Archive"
                  type="button"
                >
                  <Archive size={14} weight="bold" />
                </button>
                <button
                  className="rounded-lg border border-[#d9dfeb] px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                  onClick={() => {
                    bulk("markUnread");
                  }}
                  title="Mark unread"
                  type="button"
                >
                  <Envelope size={14} weight="bold" />
                </button>
                <button
                  className="rounded-lg border border-[#d9dfeb] px-2.5 py-1.5 text-xs font-semibold text-[#5d687d] transition hover:border-brand-red/40 hover:text-brand-red dark:border-white/10 dark:text-white/55"
                  onClick={() => {
                    bulk("delete");
                  }}
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
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.map((record, index) => {
            const state = getState(record);
            const unread = state.status === "inbox" && !state.read;
            const active = record.slug === selected?.slug;
            return (
              <button
                className={`flex w-full items-center gap-3 border-b border-[#eef1f7] px-4 py-3 text-left transition dark:border-white/[0.06] ${active ? "bg-brand-blue/[0.06]" : "hover:bg-[#f7f9fd] dark:hover:bg-white/[0.04]"}`}
                key={record.slug}
                onClick={() => open(record.slug)}
                type="button"
              >
                {!readOnly ? (
                  <input
                    aria-label={getRowAriaLabel(record)}
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
                ) : null}
                {renderRow(record, { unread })}
                {state.status === "archived" ? (
                  <span className="shrink-0 rounded-full bg-[#e8ecf4] px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[#667187] uppercase">
                    Archived
                  </span>
                ) : null}
              </button>
            );
          })}
          {!filtered.length ? (
            <p className="px-4 py-10 text-center text-sm leading-6 text-[#9ba4b5]">
              {emptyMessages[filter]}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-h-[480px] p-6 sm:p-8">
        {selected ? (
          <div className="admin-editor-enter">
            <p className="text-xs text-[#9ba4b5]">
              {submittedLabel} {formatSubmittedDate(selected.createdAt)}
            </p>

            {renderDetail(selected)}

            <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-[#dee4ef] pt-5 dark:border-white/10">
              {!readOnly && getState(selected).status === "archived" ? (
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                  onClick={() => {
                    patchState(selected.slug, { status: "inbox" });
                  }}
                  type="button"
                >
                  <Envelope size={15} weight="bold" />
                  Move to inbox
                </button>
              ) : !readOnly ? (
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                  onClick={() => {
                    patchState(selected.slug, { status: "archived" });
                  }}
                  type="button"
                >
                  <Archive size={15} weight="bold" />
                  Archive
                </button>
              ) : null}
              {!readOnly ? (
                <>
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3.5 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
                    onClick={() => {
                      patchState(selected.slug, { read: !getState(selected).read });
                    }}
                    type="button"
                  >
                    {getState(selected).read ? (
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
                    onClick={() => deleteOne(selected.slug)}
                    type="button"
                  >
                    <Trash size={15} weight="bold" />
                    Delete
                  </button>
                </>
              ) : null}
              {renderPrimaryAction(selected)}
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[420px] place-items-center text-center">
            <div>
              <EnvelopeOpen className="mx-auto text-[#c3cad9] dark:text-white/20" size={36} />
              <p className="mt-4 font-display text-lg font-semibold tracking-[-0.03em]">
                {emptyDetailCopy.title}
              </p>
              <p className="mt-1 max-w-xs text-sm leading-6 text-[#778299] dark:text-white/45">
                {emptyDetailCopy.description}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
