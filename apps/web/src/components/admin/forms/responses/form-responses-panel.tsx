"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  Broom,
  CheckCircle,
  Columns,
  DownloadSimple,
  Flag,
  GridFour,
  Images,
  MagnifyingGlass,
  Prohibit,
  Rows,
  SquaresFour,
  Star,
  Tag,
  Trash,
  X,
} from "@phosphor-icons/react";
import type {
  FormAnswerValue,
  FormAnswers,
  FormBulkAction,
  FormFileAnswer,
  FormRecord,
  FormResponsePatch,
  FormResponseRecord,
} from "@repo/shared";

import { formsAdminApi } from "@/lib/forms/admin-api";
import type { DataColumn, WorkingRow } from "@/lib/forms/data/columns";
import { SEGMENTS, isFilterActive, type ColumnFilter } from "@/lib/forms/data/filters";
import {
  loadResponses,
  replaceResponse,
  setView,
  updateResponses,
  useFormDataset,
} from "@/lib/forms/data/store";
import { VIZ_ROOT, formatMs } from "@/components/admin/forms/charts/viz";
import { PrintReport } from "@/components/admin/forms/analytics/print-report";

import { answerKeyOf, withAnswer } from "./answer-editor";
import { CardsView, GalleryView } from "./card-views";
import { CleanPanel } from "./clean-panel";
import {
  ColumnMenu,
  ColumnsManager,
  Popover,
  ghostButton,
  inputClass,
  primaryButton,
} from "./column-menus";
import { ExportMenu } from "./export-menu";
import { Lightbox, type LightboxItem } from "./lightbox";
import { ResponseDrawer } from "./response-drawer";
import { ResponsesTable, type Density } from "./responses-table";

export type FormResponsesPanelProps = {
  form: FormRecord;
  canWrite: boolean;
  canDelete: boolean;
};

type ViewMode = "table" | "cards" | "gallery";

type TableConfig = {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
  pinned: number;
  density: Density;
};

const DEFAULT_HIDDEN_META = [
  "$score",
  "$ending",
  "$city",
  "$ip",
  "$browser",
  "$os",
  "$language",
  "$referrer",
  "$utmSource",
  "$utmMedium",
  "$utmCampaign",
  "$starred",
  "$flagged",
  "$reviewed",
  "$spam",
];

const configKey = (formId: string) => `mgm.forms.table.${formId}`;

function readConfig(formId: string): Partial<TableConfig> {
  try {
    const raw = window.localStorage.getItem(configKey(formId));
    return raw ? (JSON.parse(raw) as Partial<TableConfig>) : {};
  } catch {
    return {};
  }
}

function writeConfig(formId: string, config: TableConfig) {
  try {
    window.localStorage.setItem(configKey(formId), JSON.stringify(config));
  } catch {
    // Storage off: the layout resets next visit.
  }
}

const AUTO_REFRESH_MS = 30_000;

/** The Responses tab: the table (and cards and gallery), the drawer, bulk actions, cleaning and exports. */
export function FormResponsesPanel({ form, canWrite, canDelete }: FormResponsesPanelProps) {
  const data = useFormDataset(form);
  const { state, columns } = data;
  const [mode, setMode] = useState<ViewMode>("table");
  const [config, setConfig] = useState<TableConfig>(() => ({
    order: [],
    hidden: DEFAULT_HIDDEN_META,
    widths: {},
    pinned: 1,
    density: "normal",
    ...readConfig(form.id),
  }));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastToggled = useRef<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [menu, setMenu] = useState<{ column: DataColumn; anchor: DOMRect } | null>(null);
  const [columnsAnchor, setColumnsAnchor] = useState<DOMRect | null>(null);
  const [exportAnchor, setExportAnchor] = useState<DOMRect | null>(null);
  const [tagAnchor, setTagAnchor] = useState<{ anchor: DOMRect; action: "tag" | "untag" } | null>(
    null,
  );
  const [tagText, setTagText] = useState("");
  const [cleanOpen, setCleanOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [seenAt, setSeenAt] = useState<number>(() => Date.now());
  const [searchText, setSearchText] = useState(state.view.search);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const stopPrinting = useCallback(() => {
    setPrinting(false);
  }, []);

  useEffect(() => {
    void loadResponses(form.id).catch(() => undefined);
  }, [form.id]);

  useEffect(() => {
    writeConfig(form.id, config);
  }, [config, form.id]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void loadResponses(form.id, { force: true, quiet: true }).catch(() => undefined);
    }, AUTO_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [autoRefresh, form.id]);

  // Debounced search into the shared view.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setView(form.id, { search: searchText });
    }, 180);
    return () => {
      window.clearTimeout(timer);
    };
  }, [searchText, form.id]);

  useEffect(() => {
    if (state.error && state.status === "ready")
      toast.error("Could not refresh the responses", { description: state.error });
  }, [state.error, state.status]);

  const order = useMemo(() => {
    const keys = columns.map((column) => column.key);
    const known = config.order.filter((key) => keys.includes(key));
    return [...known, ...keys.filter((key) => !known.includes(key))];
  }, [columns, config.order]);
  const hidden = useMemo(() => new Set(config.hidden), [config.hidden]);
  const byKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);
  const visibleColumns = useMemo(
    () =>
      order
        .filter((key) => !hidden.has(key))
        .map((key) => byKey.get(key))
        .filter((column): column is DataColumn => Boolean(column)),
    [order, hidden, byKey],
  );
  const filteredKeys = useMemo(
    () => new Set(state.view.filters.filter(isFilterActive).map((filter) => filter.key)),
    [state.view.filters],
  );

  const rows = data.viewRows;
  const rowById = useMemo(() => new Map(data.rows.map((row) => [row.id, row])), [data.rows]);
  const openIndex = openId ? rows.findIndex((row) => row.id === openId) : -1;
  // Out-of-range positions (including -1) have no row, as with plain indexing.
  const rowAt = (index: number) => (index >= 0 ? rows.at(index) : undefined);
  const openRow = openId ? (rowAt(openIndex) ?? rowById.get(openId) ?? null) : null;
  const selectedRows = useMemo(
    () => data.rows.filter((row) => selected.has(row.id)),
    [data.rows, selected],
  );
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const response of state.responses ?? [])
      for (const tag of response.admin.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [state.responses]);
  const rawRows = useMemo<WorkingRow[]>(
    () =>
      (state.responses ?? []).map((record, index) => ({
        id: record.id,
        index,
        record,
        answers: record.answers,
        extra: {},
      })),
    [state.responses],
  );

  const newCount = useMemo(() => {
    if (!state.responses) return 0;
    return state.responses.filter((response) => Date.parse(response.createdAt) > seenAt).length;
  }, [state.responses, seenAt]);

  const summary = useMemo(() => {
    const filtered = data.filtered;
    const durations = filtered
      .map((row) => row.record.meta.durationMs)
      .filter((value): value is number => typeof value === "number");
    const scores = filtered
      .map((row) => row.record.score)
      .filter((value): value is number => typeof value === "number");
    return {
      total: state.responses?.length ?? 0,
      kept: data.rows.length,
      filtered: filtered.length,
      duration: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    };
  }, [data.filtered, data.rows.length, state.responses]);

  const openFiles = useCallback((files: FormFileAnswer[], index: number) => {
    setLightbox({ items: files, index });
  }, []);

  const patch = useCallback(
    async (row: WorkingRow, body: FormResponsePatch, optimisticAnswers?: FormAnswers) => {
      const previous = row.record;
      // Optimistic for the flags, confirmed by the API's answer.
      const optimistic: FormResponseRecord = {
        ...previous,
        spam: body.spam ?? previous.spam,
        admin: {
          ...previous.admin,
          starred: body.starred ?? previous.admin.starred,
          flagged: body.flagged ?? previous.admin.flagged,
          reviewed: body.reviewed ?? previous.admin.reviewed,
          tags: body.tags ?? previous.admin.tags,
          note: body.note === undefined ? previous.admin.note : body.note,
        },
        answers: optimisticAnswers ?? previous.answers,
      };
      replaceResponse(form.id, optimistic);
      try {
        const { response } = await formsAdminApi.patchResponse(form.id, row.id, body);
        replaceResponse(form.id, response);
      } catch (error) {
        replaceResponse(form.id, previous);
        toast.error("Could not save", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [form.id],
  );

  const editAnswer = useCallback(
    async (row: WorkingRow, column: DataColumn, value: FormAnswerValue | undefined) => {
      const key = answerKeyOf(column);
      const before = new Map(Object.entries(row.record.answers)).get(key);
      if (JSON.stringify(before) === JSON.stringify(value)) return;
      // The API merges answers into the stored ones; a blank value clears a question.
      await patch(
        row,
        { answers: { [key]: value ?? "" } },
        withAnswer(row.record.answers, column, value),
      );
    },
    [patch],
  );

  const toggleRow = useCallback(
    (id: string, index: number, shift: boolean) => {
      const anchor = lastToggled.current;
      setSelected((current) => {
        const next = new Set(current);
        if (shift && anchor !== null) {
          const [from, to] = [Math.min(anchor, index), Math.max(anchor, index)];
          const turnOn = !current.has(id);
          for (let i = from; i <= to; i += 1) {
            const rowId = rows.at(i)?.id;
            if (!rowId) continue;
            if (turnOn) next.add(rowId);
            else next.delete(rowId);
          }
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastToggled.current = index;
    },
    [rows],
  );

  const toggleAll = () => {
    setSelected((current) => {
      const allOn = rows.length > 0 && rows.every((row) => current.has(row.id));
      if (allOn) return new Set();
      return new Set(rows.map((row) => row.id));
    });
  };

  const bulk = async (action: FormBulkAction, tag?: string) => {
    const ids = [...selected];
    if (!ids.length) return;
    if (
      action === "delete" &&
      !window.confirm(
        `Delete ${ids.length} response${ids.length === 1 ? "" : "s"}? This can't be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      for (let index = 0; index < ids.length; index += 2000) {
        await formsAdminApi.bulk(form.id, { ids: ids.slice(index, index + 2000), action, tag });
      }
      const idSet = new Set(ids);
      updateResponses(form.id, (responses) => {
        if (action === "delete") return responses.filter((response) => !idSet.has(response.id));
        return responses.map((response) => {
          if (!idSet.has(response.id)) return response;
          const admin = { ...response.admin };
          let spam = response.spam;
          if (action === "star" || action === "unstar") admin.starred = action === "star";
          if (action === "flag" || action === "unflag") admin.flagged = action === "flag";
          if (action === "review" || action === "unreview") admin.reviewed = action === "review";
          if (action === "spam" || action === "unspam") spam = action === "spam";
          if (action === "tag" && tag && !admin.tags.includes(tag))
            admin.tags = [...admin.tags, tag];
          if (action === "untag" && tag) admin.tags = admin.tags.filter((item) => item !== tag);
          return { ...response, admin, spam };
        });
      });
      if (action === "delete") {
        setSelected(new Set());
        if (openId && idSet.has(openId)) setOpenId(null);
      }
      toast.success(
        `${ids.length} response${ids.length === 1 ? "" : "s"} ${action === "delete" ? "deleted" : "updated"}`,
      );
    } catch (error) {
      toast.error("Bulk action failed", {
        description: error instanceof Error ? error.message : undefined,
      });
      void loadResponses(form.id, { force: true }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const setFilter = (key: string, filter: ColumnFilter | null) => {
    setView(form.id, (view) => ({
      ...view,
      filters: filter
        ? [...view.filters.filter((item) => item.key !== key), filter]
        : view.filters.filter((item) => item.key !== key),
    }));
  };

  const onSort = (key: string) => {
    setView(form.id, (view) => ({
      ...view,
      sort:
        view.sort?.key !== key
          ? { key, direction: "asc" }
          : view.sort.direction === "asc"
            ? { key, direction: "desc" }
            : null,
    }));
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadResponses(form.id, { force: true });
      setSeenAt(Date.now());
    } catch {
      // The store keeps the error; the toast effect shows it.
    } finally {
      setRefreshing(false);
    }
  };

  const activeFilters = state.view.filters.filter(isFilterActive);
  const segmentCounts = useMemo(() => {
    // Cheap counts for the chips from the cleaned rows.
    const out: Record<string, number> = {};
    const rowsAll = data.rows;
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = dayStart - ((now.getDay() + 6) % 7) * 86_400_000;
    out.all = rowsAll.length;
    out.starred = rowsAll.filter((row) => row.record.admin.starred).length;
    out.flagged = rowsAll.filter((row) => row.record.admin.flagged).length;
    out.unreviewed = rowsAll.filter((row) => !row.record.admin.reviewed).length;
    out.spam = rowsAll.filter((row) => row.record.spam).length;
    out.today = rowsAll.filter((row) => Date.parse(row.record.createdAt) >= dayStart).length;
    out.week = rowsAll.filter((row) => Date.parse(row.record.createdAt) >= weekStart).length;
    return out;
  }, [data.rows]);

  if (state.status === "loading" || (state.status === "idle" && !state.responses)) {
    return (
      <div aria-busy="true" className="space-y-3" data-testid="responses-loading">
        <div className="h-10 w-full animate-pulse rounded-xl bg-[#eef0f4] motion-reduce:animate-none dark:bg-white/5" />
        <div className="h-[420px] w-full animate-pulse rounded-xl bg-[#f3f5f8] motion-reduce:animate-none dark:bg-white/[0.03]" />
      </div>
    );
  }

  if (state.status === "error" && !state.responses) {
    return (
      <div className="rounded-2xl border border-[#e4e8f0] bg-white p-8 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <p className="text-sm font-semibold">The responses didn&apos;t load.</p>
        <p className="mt-1 text-xs text-[#8a93a6]">{state.error}</p>
        <button className={`${primaryButton} mt-4`} onClick={() => void refresh()} type="button">
          Try again
        </button>
      </div>
    );
  }

  const noResponses = (state.responses?.length ?? 0) === 0;
  const segmentButton = (active: boolean) =>
    `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${active ? "bg-[#171b25] text-white dark:bg-white dark:text-[#171b25]" : "border border-[#d9dfeb] bg-white text-[#5c6679] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60"}`;

  return (
    <div className={`${VIZ_ROOT} space-y-3`} data-testid="responses-panel">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Search responses</span>
          <MagnifyingGlass
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9ba4b5]"
            size={15}
          />
          <input
            className={`${inputClass} pl-9`}
            onChange={(event) => {
              setSearchText(event.target.value);
            }}
            placeholder="Search every answer, tag and note"
            type="search"
            value={searchText}
          />
        </label>
        <div
          aria-label="View"
          className="flex rounded-xl border border-[#d9dfeb] bg-white p-0.5 dark:border-white/10 dark:bg-white/[0.03]"
          role="group"
        >
          {(
            [
              ["table", "Table", Rows],
              ["cards", "Cards", SquaresFour],
              ["gallery", "Gallery", Images],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              aria-label={label}
              aria-pressed={mode === id}
              className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold transition ${mode === id ? "bg-brand-blue text-white" : "text-[#5c6679] hover:text-brand-blue dark:text-white/60"}`}
              key={id}
              onClick={() => {
                setMode(id);
              }}
              type="button"
            >
              <Icon size={14} /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        {mode === "table" ? (
          <>
            <button
              aria-label="Columns"
              className={ghostButton}
              onClick={(event) => {
                setColumnsAnchor(event.currentTarget.getBoundingClientRect());
              }}
              type="button"
            >
              <Columns size={15} /> <span className="hidden sm:inline">Columns</span>
            </button>
            <button
              aria-label={`Density: ${config.density}`}
              className={ghostButton}
              onClick={() => {
                setConfig((current) => ({
                  ...current,
                  density:
                    current.density === "compact"
                      ? "normal"
                      : current.density === "normal"
                        ? "roomy"
                        : "compact",
                }));
              }}
              title="Row density"
              type="button"
            >
              <GridFour size={15} />{" "}
              <span className="hidden capitalize sm:inline">{config.density}</span>
            </button>
          </>
        ) : null}
        <button
          aria-label="Clean data"
          aria-pressed={cleanOpen}
          className={`${ghostButton} ${cleanOpen || state.pipeline.length ? "border-brand-green text-brand-green" : ""}`}
          onClick={() => {
            setCleanOpen((value) => !value);
          }}
          type="button"
        >
          <Broom size={15} /> <span className="hidden sm:inline">Clean data</span>
          {state.pipeline.length ? (
            <span className="rounded-full bg-brand-green px-1.5 text-[10px] text-white tabular-nums">
              {state.pipeline.filter((step) => step.enabled).length}
            </span>
          ) : null}
        </button>
        <button
          className={ghostButton}
          aria-label="Export"
          data-testid="export-button"
          onClick={(event) => {
            setExportAnchor(event.currentTarget.getBoundingClientRect());
          }}
          type="button"
        >
          <DownloadSimple size={15} /> <span className="hidden sm:inline">Export</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            aria-label="Refresh"
            className={ghostButton}
            onClick={() => void refresh()}
            title="Refresh"
            type="button"
          >
            <ArrowsClockwise
              className={refreshing ? "animate-spin motion-reduce:animate-none" : ""}
              size={15}
            />
          </button>
          <label
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-xs text-[#5c6679] dark:text-white/55"
            title="Refresh every 30 seconds"
          >
            <input
              checked={autoRefresh}
              className="size-3.5 accent-brand-blue"
              onChange={(event) => {
                setAutoRefresh(event.target.checked);
              }}
              type="checkbox"
            />{" "}
            Auto
          </label>
        </div>
      </div>

      <div
        className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1"
        role="group"
        aria-label="Segments"
      >
        {SEGMENTS.map((segment) => (
          <button
            aria-pressed={state.view.segment === segment.id}
            className={segmentButton(state.view.segment === segment.id)}
            key={segment.id}
            onClick={() => {
              setView(form.id, { segment: segment.id });
            }}
            type="button"
          >
            {segment.label}
            <span className="tabular-nums opacity-60">{segmentCounts[segment.id] ?? 0}</span>
          </button>
        ))}
        {newCount > 0 ? (
          <button
            aria-live="polite"
            className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-brand-blue px-3 text-xs font-semibold text-white"
            onClick={() => {
              setSeenAt(Date.now());
              setView(form.id, (view) => ({
                ...view,
                sort: { key: "$submittedAt", direction: "desc" },
              }));
            }}
            type="button"
          >
            {newCount} new
          </button>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="responses-summary">
        {[
          [
            "Responses",
            summary.total.toLocaleString(),
            summary.kept !== summary.total
              ? `${summary.kept.toLocaleString()} after cleaning`
              : null,
          ],
          [
            "Showing",
            summary.filtered.toLocaleString(),
            activeFilters.length
              ? `${activeFilters.length} filter${activeFilters.length === 1 ? "" : "s"}`
              : null,
          ],
          ["Average time", formatMs(summary.duration), null],
          ["Average score", summary.score === null ? "–" : summary.score.toFixed(1), null],
        ].map(([label, value, note]) => (
          <div
            className="rounded-xl border border-[#e4e8f0] bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]"
            key={label as string}
          >
            <dt className="text-[11px] font-semibold text-[#7e899d] dark:text-white/40">{label}</dt>
            <dd className="text-lg font-semibold">
              {value}
              {note ? (
                <span className="ml-2 text-[11px] font-normal text-[#8a93a6]">{note}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {activeFilters.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((filter) => (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-brand-blue-50 py-1 pr-1 pl-2.5 text-xs text-brand-blue dark:bg-brand-blue/15"
              key={filter.key}
            >
              {byKey.get(filter.key)?.label ?? filter.key}
              <button
                aria-label="Remove filter"
                className="rounded-full p-0.5 hover:bg-white dark:hover:bg-white/10"
                onClick={() => {
                  setFilter(filter.key, null);
                }}
                type="button"
              >
                <X size={10} weight="bold" />
              </button>
            </span>
          ))}
          <button
            className="text-xs font-semibold text-[#7e899d] hover:text-brand-red"
            onClick={() => {
              setView(form.id, { filters: [] });
            }}
            type="button"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {selected.size ? (
        <div
          aria-label="Bulk actions"
          className="sticky top-[70px] z-30 flex flex-wrap items-center gap-1.5 rounded-xl border border-brand-blue/30 bg-brand-blue-50 px-3 py-2 dark:bg-[#18233a]"
          role="toolbar"
        >
          <span className="mr-1 text-xs font-bold text-brand-blue">{selected.size} selected</span>
          {canWrite ? (
            <>
              <BulkButton
                disabled={busy}
                icon={<Star size={13} />}
                label="Star"
                onClick={() => void bulk("star")}
              />
              <BulkButton disabled={busy} label="Unstar" onClick={() => void bulk("unstar")} />
              <BulkButton
                disabled={busy}
                icon={<Flag size={13} />}
                label="Flag"
                onClick={() => void bulk("flag")}
              />
              <BulkButton disabled={busy} label="Unflag" onClick={() => void bulk("unflag")} />
              <BulkButton
                disabled={busy}
                icon={<CheckCircle size={13} />}
                label="Reviewed"
                onClick={() => void bulk("review")}
              />
              <BulkButton
                disabled={busy}
                label="Unreviewed"
                onClick={() => void bulk("unreview")}
              />
              <BulkButton
                disabled={busy}
                icon={<Prohibit size={13} />}
                label="Spam"
                onClick={() => void bulk("spam")}
              />
              <BulkButton disabled={busy} label="Not spam" onClick={() => void bulk("unspam")} />
              <BulkButton
                disabled={busy}
                icon={<Tag size={13} />}
                label="Tag"
                onClick={(event) => {
                  setTagAnchor({
                    anchor: event.currentTarget.getBoundingClientRect(),
                    action: "tag",
                  });
                }}
              />
              <BulkButton
                disabled={busy}
                label="Untag"
                onClick={(event) => {
                  setTagAnchor({
                    anchor: event.currentTarget.getBoundingClientRect(),
                    action: "untag",
                  });
                }}
              />
            </>
          ) : null}
          <BulkButton
            icon={<DownloadSimple size={13} />}
            label="Export"
            onClick={(event) => {
              setExportAnchor(event.currentTarget.getBoundingClientRect());
            }}
          />
          {canDelete ? (
            <BulkButton
              danger
              disabled={busy}
              icon={<Trash size={13} />}
              label="Delete"
              onClick={() => void bulk("delete")}
            />
          ) : null}
          <button
            aria-label="Clear selection"
            className="ml-auto rounded-lg p-1.5 text-brand-blue hover:bg-white dark:hover:bg-white/10"
            onClick={() => {
              setSelected(new Set());
            }}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className={cleanOpen ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]" : ""}>
        <div className="min-w-0">
          {noResponses ? (
            <div className="rounded-2xl border border-dashed border-[#d9dfeb] bg-white px-6 py-16 text-center dark:border-white/10 dark:bg-white/[0.02]">
              <p className="text-sm font-semibold">No responses yet</p>
              <p className="mt-1 text-xs text-[#8a93a6]">
                Share the form and they will appear here. Turn on Auto to watch them arrive.
              </p>
            </div>
          ) : mode === "table" ? (
            <div className="h-[max(420px,calc(100dvh-330px))]">
              <ResponsesTable
                activeRowId={openId}
                canWrite={canWrite}
                columns={visibleColumns}
                density={config.density}
                filteredKeys={filteredKeys}
                formId={form.id}
                onEdit={(row, column, value) => void editAnswer(row, column, value)}
                onHeaderMenu={(column, anchor) => {
                  setMenu({ column, anchor });
                }}
                onOpen={(row) => {
                  setOpenId(row.id);
                }}
                onOpenFile={openFiles}
                onResize={(key, width) => {
                  setConfig((current) => ({
                    ...current,
                    widths: { ...current.widths, [key]: width },
                  }));
                }}
                onSort={onSort}
                onToggleAll={toggleAll}
                onToggleRow={toggleRow}
                pinned={config.pinned}
                rows={rows}
                selected={selected}
                sort={state.view.sort}
                widths={config.widths}
              />
            </div>
          ) : mode === "cards" ? (
            <CardsView
              columns={visibleColumns}
              formId={form.id}
              onOpen={(row) => {
                setOpenId(row.id);
              }}
              onOpenFile={openFiles}
              rows={rows}
            />
          ) : (
            <GalleryView
              columns={data.answerColumns}
              formId={form.id}
              onOpenItems={(items, index) => {
                setLightbox({ items, index });
              }}
              rows={rows}
            />
          )}
        </div>
        {cleanOpen ? (
          <>
            <div className="hidden lg:block lg:h-[max(420px,calc(100dvh-330px))]">
              <CleanPanel
                baseColumns={[...data.answerColumns, ...data.metaColumns]}
                canWrite={canWrite}
                form={form}
                onClose={() => {
                  setCleanOpen(false);
                }}
                result={data.pipeline}
                steps={state.pipeline}
              />
            </div>
            {createPortal(
              <div
                className={`${VIZ_ROOT} fixed inset-0 z-[55] bg-[#f5f7fb] p-3 lg:hidden dark:bg-[#0f1117]`}
              >
                <CleanPanel
                  baseColumns={[...data.answerColumns, ...data.metaColumns]}
                  canWrite={canWrite}
                  form={form}
                  onClose={() => {
                    setCleanOpen(false);
                  }}
                  result={data.pipeline}
                  steps={state.pipeline}
                />
              </div>,
              document.body,
            )}
          </>
        ) : null}
      </div>

      {menu ? (
        <ColumnMenu
          anchor={menu.anchor}
          column={menu.column}
          filter={state.view.filters.find((filter) => filter.key === menu.column.key)}
          onClose={() => {
            setMenu(null);
          }}
          onFilter={(filter) => {
            setFilter(menu.column.key, filter);
          }}
          onHide={() => {
            setConfig((current) => ({ ...current, hidden: [...current.hidden, menu.column.key] }));
            setMenu(null);
          }}
          onPin={() => {
            const index = visibleColumns.findIndex((column) => column.key === menu.column.key);
            setConfig((current) => ({
              ...current,
              pinned: index < current.pinned ? index : index + 1,
            }));
            setMenu(null);
          }}
          onSort={(direction) => {
            setView(form.id, { sort: direction ? { key: menu.column.key, direction } : null });
            setMenu(null);
          }}
          pinned={
            visibleColumns.findIndex((column) => column.key === menu.column.key) < config.pinned
          }
          rows={data.rows}
        />
      ) : null}

      {columnsAnchor ? (
        <ColumnsManager
          anchor={columnsAnchor}
          columns={columns}
          hidden={hidden}
          onClose={() => {
            setColumnsAnchor(null);
          }}
          onOrder={(next) => {
            setConfig((current) => ({ ...current, order: next }));
          }}
          onReset={() => {
            setConfig((current) => ({
              ...current,
              order: [],
              hidden: DEFAULT_HIDDEN_META,
              widths: {},
              pinned: 1,
            }));
          }}
          onShowAll={(group, show) => {
            setConfig((current) => {
              const keys = columns
                .filter((column) => group === "all" || column.group === group)
                .map((column) => column.key);
              const next = new Set(current.hidden);
              for (const key of keys) {
                if (show) next.delete(key);
                else next.add(key);
              }
              return { ...current, hidden: [...next] };
            });
          }}
          onToggle={(key) => {
            setConfig((current) => ({
              ...current,
              hidden: current.hidden.includes(key)
                ? current.hidden.filter((item) => item !== key)
                : [...current.hidden, key],
            }));
          }}
          order={order}
        />
      ) : null}

      {exportAnchor ? (
        <ExportMenu
          allRows={data.rows}
          anchor={exportAnchor}
          answerColumns={data.answerColumns}
          extraColumns={data.pipeline.extraColumns}
          filteredRows={rows}
          form={form}
          metaColumns={data.metaColumns}
          onClose={() => {
            setExportAnchor(null);
          }}
          onPrint={() => {
            setPrinting(true);
          }}
          rawAll={rawRows}
          selectedRows={selectedRows}
          visibleOrder={visibleColumns.map((column) => column.key)}
        />
      ) : null}

      {tagAnchor ? (
        <Popover
          anchor={tagAnchor.anchor}
          label={tagAnchor.action === "tag" ? "Add a tag" : "Remove a tag"}
          onClose={() => {
            setTagAnchor(null);
          }}
          width={280}
        >
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const tag = tagText.trim();
              if (!tag) return;
              void bulk(tagAnchor.action, tag);
              setTagAnchor(null);
              setTagText("");
            }}
          >
            <input
              autoFocus
              className={inputClass}
              list="bulk-tags"
              onChange={(event) => {
                setTagText(event.target.value);
              }}
              placeholder="Tag name"
              value={tagText}
            />
            <datalist id="bulk-tags">
              {allTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
            <button className={primaryButton} type="submit">
              {tagAnchor.action === "tag" ? "Tag" : "Untag"} {selected.size}
            </button>
          </form>
        </Popover>
      ) : null}

      {openRow ? (
        <ResponseDrawer
          allTags={allTags}
          canDelete={canDelete}
          canWrite={canWrite}
          columns={columns}
          count={rows.length}
          form={form}
          onClose={() => {
            setOpenId(null);
          }}
          onDelete={async () => {
            try {
              await formsAdminApi.bulk(form.id, { ids: [openRow.id], action: "delete" });
              const next = rowAt(openIndex + 1) ?? rowAt(openIndex - 1);
              updateResponses(form.id, (responses) =>
                responses.filter((response) => response.id !== openRow.id),
              );
              setOpenId(next && next.id !== openRow.id ? next.id : null);
              toast.success("Response deleted");
            } catch (error) {
              toast.error("Could not delete", {
                description: error instanceof Error ? error.message : undefined,
              });
            }
          }}
          onEditAnswer={(column, value) => editAnswer(openRow, column, value)}
          onOpenFile={openFiles}
          onPatch={(body) => patch(openRow, body)}
          onStep={(delta) => {
            const next = rowAt(openIndex + delta);
            if (next) setOpenId(next.id);
          }}
          position={Math.max(0, openIndex)}
          row={openRow}
        />
      ) : null}

      {printing ? (
        <PrintReport
          columns={columns}
          form={form}
          onDone={stopPrinting}
          rows={data.filtered}
          total={state.responses?.length ?? 0}
        />
      ) : null}

      {lightbox ? (
        <Lightbox
          formId={form.id}
          index={lightbox.index}
          items={lightbox.items}
          onClose={() => {
            setLightbox(null);
          }}
          onIndex={(index) => {
            setLightbox((current) => (current ? { ...current, index } : current));
          }}
        />
      ) : null}
    </div>
  );
}

function BulkButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition disabled:opacity-50 ${danger ? "text-brand-red hover:bg-brand-red-50 dark:hover:bg-brand-red/15" : "text-[#3b4150] hover:bg-white dark:text-white/75 dark:hover:bg-white/10"}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
