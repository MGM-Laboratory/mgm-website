/**
 * The responses view: quick segments, a global search, per-column filters
 * and one sort, applied after the cleaning pipeline. The Analytics tab reads
 * the same view so its charts describe the rows the table shows.
 */

import {
  answerValue,
  cellIds,
  cellIsEmpty,
  cellText,
  sortKey,
  type DataColumn,
  type WorkingRow,
} from "./columns";

export const SEGMENTS = [
  { id: "all", label: "All" },
  { id: "starred", label: "Starred" },
  { id: "flagged", label: "Flagged" },
  { id: "unreviewed", label: "Unreviewed" },
  { id: "spam", label: "Spam" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
] as const;
export type Segment = (typeof SEGMENTS)[number]["id"];

export type FilterOp =
  | "contains"
  | "equals"
  | "empty"
  | "notEmpty"
  | "range"
  | "in"
  | "dateRange"
  | "isTrue"
  | "isFalse";

export type ColumnFilter = {
  key: string;
  op: FilterOp;
  value?: string;
  min?: number | null;
  max?: number | null;
  values?: string[];
  /** `YYYY-MM-DD`, inclusive, in the admin's local time. */
  from?: string;
  to?: string;
};

export type SortState = { key: string; direction: "asc" | "desc" } | null;

export type ViewState = {
  segment: Segment;
  search: string;
  filters: ColumnFilter[];
  sort: SortState;
};

export const DEFAULT_VIEW: ViewState = { segment: "all", search: "", filters: [], sort: null };

export function filterOpsFor(column: DataColumn): FilterOp[] {
  switch (column.valueType) {
    case "number":
      return ["range", "equals", "empty", "notEmpty"];
    case "date":
      return ["dateRange", "empty", "notEmpty"];
    case "boolean":
      return ["isTrue", "isFalse", "empty"];
    case "choice":
    case "multi":
      return column.options?.length || column.group === "meta"
        ? ["in", "empty", "notEmpty"]
        : ["contains", "equals", "empty", "notEmpty"];
    case "file":
      return ["notEmpty", "empty"];
    default:
      return ["contains", "equals", "empty", "notEmpty"];
  }
}

export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  contains: "contains",
  equals: "equals",
  empty: "is empty",
  notEmpty: "is not empty",
  range: "between",
  in: "is any of",
  dateRange: "between dates",
  isTrue: "is yes",
  isFalse: "is no",
};

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function localDayMs(text: string, endOfDay: boolean) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  return endOfDay ? start + 86_400_000 - 1 : start;
}

export function segmentTest(
  segment: Segment,
  now = new Date(),
): ((row: WorkingRow) => boolean) | null {
  switch (segment) {
    case "starred":
      return (row) => row.record.admin.starred;
    case "flagged":
      return (row) => row.record.admin.flagged;
    case "unreviewed":
      return (row) => !row.record.admin.reviewed;
    case "spam":
      return (row) => row.record.spam;
    case "today": {
      const start = startOfLocalDay(now);
      return (row) => Date.parse(row.record.createdAt) >= start;
    }
    case "week": {
      // The week starts on Monday.
      const day = (now.getDay() + 6) % 7;
      const start = startOfLocalDay(now) - day * 86_400_000;
      return (row) => Date.parse(row.record.createdAt) >= start;
    }
    default:
      return null;
  }
}

export function isFilterActive(filter: ColumnFilter) {
  switch (filter.op) {
    case "contains":
    case "equals":
      return Boolean(filter.value?.trim());
    case "range":
      return filter.min !== null && filter.min !== undefined
        ? true
        : filter.max !== null && filter.max !== undefined;
    case "in":
      return Boolean(filter.values?.length);
    case "dateRange":
      return Boolean(filter.from || filter.to);
    default:
      return true;
  }
}

function filterTest(filter: ColumnFilter, column: DataColumn): (row: WorkingRow) => boolean {
  switch (filter.op) {
    case "empty":
      return (row) => cellIsEmpty(column, row);
    case "notEmpty":
      return (row) => !cellIsEmpty(column, row);
    case "contains": {
      const needle = (filter.value ?? "").trim().toLocaleLowerCase();
      return (row) => cellText(column, row).toLocaleLowerCase().includes(needle);
    }
    case "equals": {
      const needle = (filter.value ?? "").trim().toLocaleLowerCase();
      if (column.valueType === "number") {
        const number = Number(needle);
        return (row) => sortKey(column, row) === number;
      }
      return (row) => cellText(column, row).trim().toLocaleLowerCase() === needle;
    }
    case "range": {
      const min = filter.min ?? -Infinity;
      const max = filter.max ?? Infinity;
      return (row) => {
        const key = sortKey(column, row);
        return typeof key === "number" && key >= min && key <= max;
      };
    }
    case "in": {
      const wanted = new Set(filter.values ?? []);
      return (row) => cellIds(column, row).some((id) => wanted.has(id));
    }
    case "dateRange": {
      const from = filter.from ? localDayMs(filter.from, false) : null;
      const to = filter.to ? localDayMs(filter.to, true) : null;
      const answerDate = column.group === "answer";
      return (row) => {
        const key = sortKey(column, row);
        if (typeof key !== "number") return false;
        // `YYYY-MM-DD` parses as UTC midnight, so it moves to local midnight;
        // `YYYY-MM-DDTHH:mm` already parses as local time and stays.
        const raw = answerDate ? answerValue(column, row.answers) : undefined;
        const dateOnly = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw);
        const value = dateOnly ? key + new Date(key).getTimezoneOffset() * 60_000 : key;
        return (from === null || value >= from) && (to === null || value <= to);
      };
    }
    case "isTrue":
      return (row) => sortKey(column, row) === 1;
    case "isFalse":
      return (row) => sortKey(column, row) === 0;
    default:
      return () => true;
  }
}

const haystacks = new WeakMap<WorkingRow, string>();

function haystack(row: WorkingRow, columns: readonly DataColumn[]) {
  let text = haystacks.get(row);
  if (text === undefined) {
    text = columns
      .map((column) => cellText(column, row))
      .join("\u0001")
      .toLocaleLowerCase();
    text += `\u0001${row.record.admin.note ?? ""}`.toLocaleLowerCase();
    haystacks.set(row, text);
  }
  return text;
}

const collator =
  typeof Intl !== "undefined"
    ? new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
    : null;

export function sortRows(
  rows: readonly WorkingRow[],
  column: DataColumn,
  direction: "asc" | "desc",
): WorkingRow[] {
  const keyed = rows.map((row, index) => ({ row, index, key: sortKey(column, row) }));
  const sign = direction === "asc" ? 1 : -1;
  keyed.sort((a, b) => {
    const ka = a.key;
    const kb = b.key;
    // Empty cells always sink to the bottom.
    if (ka === null && kb === null) return a.index - b.index;
    if (ka === null) return 1;
    if (kb === null) return -1;
    let result: number;
    if (typeof ka === "number" && typeof kb === "number") result = ka - kb;
    else if (collator) result = collator.compare(String(ka), String(kb));
    else result = String(ka) < String(kb) ? -1 : String(ka) > String(kb) ? 1 : 0;
    return result === 0 ? a.index - b.index : result * sign;
  });
  return keyed.map(({ row }) => row);
}

/** Segment, search and filters (no sort): the rows every chart describes. */
export function filterRows(
  rows: readonly WorkingRow[],
  columns: readonly DataColumn[],
  view: ViewState,
  now = new Date(),
): WorkingRow[] {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const tests: ((row: WorkingRow) => boolean)[] = [];
  const segment = segmentTest(view.segment, now);
  if (segment) tests.push(segment);
  for (const filter of view.filters) {
    const column = byKey.get(filter.key);
    if (!column || !isFilterActive(filter)) continue;
    tests.push(filterTest(filter, column));
  }
  const needle = view.search.trim().toLocaleLowerCase();
  if (needle) {
    const terms = needle.split(/\s+/);
    tests.push((row) => {
      const text = haystack(row, columns);
      return terms.every((term) => text.includes(term));
    });
  }
  if (!tests.length) return rows as WorkingRow[];
  return rows.filter((row) => tests.every((test) => test(row)));
}

export function applyView(
  rows: readonly WorkingRow[],
  columns: readonly DataColumn[],
  view: ViewState,
): WorkingRow[] {
  const filtered = filterRows(rows, columns, view);
  if (!view.sort) return filtered;
  const column = columns.find((candidate) => candidate.key === view.sort?.key);
  return column ? sortRows(filtered, column, view.sort.direction) : filtered;
}
