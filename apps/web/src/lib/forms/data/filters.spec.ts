import type { FormAnswers, FormField, FormFieldType, FormResponseRecord } from "@repo/shared";
import { describe, expect, it } from "vitest";

import {
  META_COLUMNS,
  extraDataColumn,
  formAnswerDataColumns,
  type DataColumn,
  type WorkingRow,
} from "./columns";
import {
  DEFAULT_VIEW,
  FILTER_OP_LABELS,
  SEGMENTS,
  applyView,
  filterOpsFor,
  filterRows,
  isFilterActive,
  segmentTest,
  sortRows,
  type ColumnFilter,
  type ViewState,
} from "./filters";

function field(id: string, type: FormFieldType, extra: Partial<FormField> = {}): FormField {
  return { id, type, label: id.toUpperCase(), ...extra } as FormField;
}

const fields: FormField[] = [
  field("name", "short_text"),
  field("age", "number"),
  field("when", "date"),
  field("agree", "yes_no"),
  field("plan", "multiple_choice", {
    options: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ],
  }),
  field("tags", "checkboxes", { options: [{ id: "x", label: "Ex" }] }),
  field("free", "dropdown"),
  field("docs", "file_upload"),
];
const base = formAnswerDataColumns({ fields });
const columns: DataColumn[] = [...base, ...META_COLUMNS];
const col = (key: string) => columns.find((column) => column.key === key) as DataColumn;

function record(
  id: string,
  answers: FormAnswers,
  patch: {
    createdAt?: string;
    starred?: boolean;
    flagged?: boolean;
    reviewed?: boolean;
    spam?: boolean;
    note?: string | null;
    city?: string | null;
    country?: string | null;
  } = {},
): FormResponseRecord {
  return {
    id,
    formId: "f",
    answers,
    score: null,
    endingId: null,
    sessionId: null,
    spam: patch.spam ?? false,
    meta: {
      ip: null,
      userAgent: null,
      referer: null,
      country: patch.country ?? null,
      region: null,
      city: patch.city ?? null,
      latitude: null,
      longitude: null,
      timezone: null,
      device: null,
      browser: null,
      os: null,
      language: null,
      screen: null,
      deviceId: null,
      utm: null,
      startedAt: null,
      durationMs: null,
    },
    admin: {
      starred: patch.starred ?? false,
      flagged: patch.flagged ?? false,
      reviewed: patch.reviewed ?? false,
      tags: [],
      note: patch.note ?? null,
      editedAt: null,
    },
    createdAt: patch.createdAt ?? "2024-03-05T10:30:00.000Z",
  };
}

function row(rec: FormResponseRecord, extra: WorkingRow["extra"] = {}): WorkingRow {
  return { id: rec.id, index: 0, record: rec, answers: rec.answers, extra };
}

const view = (patch: Partial<ViewState>): ViewState => ({ ...DEFAULT_VIEW, ...patch });
const ids = (list: readonly WorkingRow[]) => list.map((item) => item.id);

describe("filterOpsFor", () => {
  it("offers the operations of each value type", () => {
    expect(filterOpsFor(col("age"))).toEqual(["range", "equals", "empty", "notEmpty"]);
    expect(filterOpsFor(col("when"))).toEqual(["dateRange", "empty", "notEmpty"]);
    expect(filterOpsFor(col("agree"))).toEqual(["isTrue", "isFalse", "empty"]);
    expect(filterOpsFor(col("plan"))).toEqual(["in", "empty", "notEmpty"]);
    expect(filterOpsFor(col("tags"))).toEqual(["in", "empty", "notEmpty"]);
    expect(filterOpsFor(col("free"))).toEqual(["contains", "equals", "empty", "notEmpty"]);
    expect(filterOpsFor(col("$country"))).toEqual(["in", "empty", "notEmpty"]);
    expect(filterOpsFor(col("docs"))).toEqual(["notEmpty", "empty"]);
    expect(filterOpsFor(col("name"))).toEqual(["contains", "equals", "empty", "notEmpty"]);
    expect(Object.keys(FILTER_OP_LABELS)).toHaveLength(9);
    expect(SEGMENTS.map((segment) => segment.id)).toContain("week");
  });
});

describe("segmentTest", () => {
  // Wednesday 2024-03-06 at noon, local time
  const now = new Date(2024, 2, 6, 12);
  const at = (date: Date) => row(record("r", {}, { createdAt: date.toISOString() }));

  it("returns no test for all", () => {
    expect(segmentTest("all", now)).toBeNull();
  });

  it("tests the admin flags", () => {
    expect(segmentTest("starred", now)?.(row(record("a", {}, { starred: true })))).toBe(true);
    expect(segmentTest("starred", now)?.(row(record("a", {})))).toBe(false);
    expect(segmentTest("flagged", now)?.(row(record("a", {}, { flagged: true })))).toBe(true);
    expect(segmentTest("unreviewed", now)?.(row(record("a", {})))).toBe(true);
    expect(segmentTest("unreviewed", now)?.(row(record("a", {}, { reviewed: true })))).toBe(false);
    expect(segmentTest("spam", now)?.(row(record("a", {}, { spam: true })))).toBe(true);
  });

  it("tests today and this week from local midnight, weeks starting Monday", () => {
    const today = segmentTest("today", now);
    expect(today?.(at(new Date(2024, 2, 6, 0, 0)))).toBe(true);
    expect(today?.(at(new Date(2024, 2, 5, 23, 59)))).toBe(false);
    const week = segmentTest("week", now);
    expect(week?.(at(new Date(2024, 2, 4, 0, 0)))).toBe(true);
    expect(week?.(at(new Date(2024, 2, 3, 23, 59)))).toBe(false);
    // On a Sunday the week still began the Monday before
    const sunday = new Date(2024, 2, 10, 12);
    expect(segmentTest("week", sunday)?.(at(new Date(2024, 2, 4, 1)))).toBe(true);
    expect(segmentTest("week", sunday)?.(at(new Date(2024, 2, 3, 23)))).toBe(false);
  });

  it("defaults to the current time", () => {
    const test = segmentTest("today");
    expect(test?.(at(new Date()))).toBe(true);
    expect(test?.(at(new Date(2000, 0, 1)))).toBe(false);
  });
});

describe("isFilterActive", () => {
  it("is active only when it carries a condition", () => {
    expect(isFilterActive({ key: "k", op: "contains", value: "  " })).toBe(false);
    expect(isFilterActive({ key: "k", op: "contains" })).toBe(false);
    expect(isFilterActive({ key: "k", op: "equals", value: "x" })).toBe(true);
    expect(isFilterActive({ key: "k", op: "range" })).toBe(false);
    expect(isFilterActive({ key: "k", op: "range", min: null, max: null })).toBe(false);
    expect(isFilterActive({ key: "k", op: "range", min: 0 })).toBe(true);
    expect(isFilterActive({ key: "k", op: "range", min: null, max: 0 })).toBe(true);
    expect(isFilterActive({ key: "k", op: "in", values: [] })).toBe(false);
    expect(isFilterActive({ key: "k", op: "in", values: ["a"] })).toBe(true);
    expect(isFilterActive({ key: "k", op: "dateRange" })).toBe(false);
    expect(isFilterActive({ key: "k", op: "dateRange", from: "2024-01-01" })).toBe(true);
    expect(isFilterActive({ key: "k", op: "empty" })).toBe(true);
    expect(isFilterActive({ key: "k", op: "isTrue" })).toBe(true);
  });
});

describe("filterRows", () => {
  const rows = [
    row(
      record(
        "1",
        {
          name: "Ada Lovelace",
          age: 36,
          when: "2024-03-05",
          agree: true,
          plan: "a",
          tags: ["x"],
          docs: [{ key: "k", name: "n", size: 1, type: "t" }],
        },
        { starred: true, note: "VIP customer", country: "ID" },
      ),
    ),
    row(
      record(
        "2",
        { name: "Bob", age: 5, when: "2024-03-06T10:00", agree: false, plan: "b" },
        { flagged: true, spam: true, city: "Malang" },
      ),
    ),
    row(
      record(
        "3",
        { name: "Cy Young", age: "x" as unknown as number, free: "Hello" },
        { reviewed: true },
      ),
      { calc: 3 },
    ),
  ];
  const run = (filters: ColumnFilter[], extra: Partial<ViewState> = {}) =>
    ids(filterRows(rows, columns, view({ filters, ...extra })));

  it("returns the same list when nothing filters", () => {
    expect(filterRows(rows, columns, DEFAULT_VIEW)).toBe(rows);
    expect(
      filterRows(
        rows,
        columns,
        view({
          filters: [
            { key: "name", op: "contains", value: "" },
            { key: "ghost", op: "empty" },
          ],
        }),
      ),
    ).toBe(rows);
  });

  it("applies segments", () => {
    expect(ids(filterRows(rows, columns, view({ segment: "starred" })))).toEqual(["1"]);
    expect(ids(filterRows(rows, columns, view({ segment: "spam" })))).toEqual(["2"]);
    const now = new Date(2024, 2, 5, 12);
    expect(ids(filterRows(rows, columns, view({ segment: "today" }), now))).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("filters by contains, equals and emptiness", () => {
    expect(run([{ key: "name", op: "contains", value: " LOVE " }])).toEqual(["1"]);
    expect(run([{ key: "name", op: "equals", value: "bob" }])).toEqual(["2"]);
    expect(run([{ key: "name", op: "equals", value: "bo" }])).toEqual([]);
    expect(run([{ key: "free", op: "empty" }])).toEqual(["1", "2"]);
    expect(run([{ key: "free", op: "notEmpty" }])).toEqual(["3"]);
    expect(run([{ key: "docs", op: "notEmpty" }])).toEqual(["1"]);
  });

  it("filters numbers by equality and range", () => {
    expect(run([{ key: "age", op: "equals", value: "5" }])).toEqual(["2"]);
    expect(run([{ key: "age", op: "range", min: 6 }])).toEqual(["1"]);
    expect(run([{ key: "age", op: "range", max: 10 }])).toEqual(["2"]);
    expect(run([{ key: "age", op: "range", min: 1, max: 100 }])).toEqual(["1", "2"]);
    // A stored "x" is not a number
    expect(run([{ key: "age", op: "range", min: -1e9 }])).toEqual(["1", "2"]);
  });

  it("filters by option ids and yes or no", () => {
    expect(run([{ key: "plan", op: "in", values: ["b", "zz"] }])).toEqual(["2"]);
    expect(run([{ key: "tags", op: "in", values: ["x"] }])).toEqual(["1"]);
    expect(run([{ key: "$country", op: "in", values: ["ID"] }])).toEqual(["1"]);
    expect(run([{ key: "agree", op: "isTrue" }])).toEqual(["1"]);
    expect(run([{ key: "agree", op: "isFalse" }])).toEqual(["2"]);
  });

  it("filters dates in local days, inclusive on both ends", () => {
    expect(run([{ key: "when", op: "dateRange", from: "2024-03-05", to: "2024-03-05" }])).toEqual([
      "1",
    ]);
    expect(run([{ key: "when", op: "dateRange", from: "2024-03-06" }])).toEqual(["2"]);
    expect(run([{ key: "when", op: "dateRange", to: "2024-03-06" }])).toEqual(["1", "2"]);
    expect(run([{ key: "when", op: "dateRange", from: "2024-03-07" }])).toEqual([]);
    expect(run([{ key: "when", op: "dateRange", from: "garbage" }])).toEqual(["1", "2"]);
  });

  it("filters meta dates by the submission instant", () => {
    const local = new Date(rows[0].record.createdAt);
    const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    expect(run([{ key: "$submittedAt", op: "dateRange", from: day, to: day }])).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(run([{ key: "$submittedAt", op: "dateRange", from: "2999-01-01" }])).toEqual([]);
  });

  it("filters extra columns and combines filters with a segment", () => {
    const calc = extraDataColumn("calc", "Calc", "number");
    const all = [...columns, calc];
    const result = filterRows(rows, all, view({ filters: [{ key: "calc", op: "range", min: 2 }] }));
    expect(ids(result)).toEqual(["3"]);
    expect(run([{ key: "name", op: "contains", value: "a" }], { segment: "starred" })).toEqual([
      "1",
    ]);
  });

  it("searches every cell and the note, all terms required", () => {
    expect(run([], { search: "  lovelace " })).toEqual(["1"]);
    expect(run([], { search: "ADA vip" })).toEqual(["1"]);
    expect(run([], { search: "ada nobody" })).toEqual([]);
    expect(run([], { search: "malang" })).toEqual(["2"]);
    expect(run([], { search: "hello" })).toEqual(["3"]);
    // The text of a row is cached, a second search reads the same row
    expect(run([], { search: "bob" })).toEqual(["2"]);
  });
});

describe("sortRows and applyView", () => {
  const rows = [
    row(record("1", { name: "item 10", age: 3 })),
    row(record("2", { name: "Item 2", age: 20 })),
    row(record("3", { name: "item 1" })),
    row(record("4", {})),
    row(record("5", { name: "Item 2", age: 20 })),
  ];

  it("sorts text with a natural collator and numbers numerically", () => {
    expect(ids(sortRows(rows, col("name"), "asc"))).toEqual(["3", "2", "5", "1", "4"]);
    expect(ids(sortRows(rows, col("name"), "desc"))).toEqual(["1", "2", "5", "3", "4"]);
    expect(ids(sortRows(rows, col("age"), "asc"))).toEqual(["1", "2", "5", "3", "4"]);
    expect(ids(sortRows(rows, col("age"), "desc"))).toEqual(["2", "5", "1", "3", "4"]);
  });

  it("keeps empty cells in their original order at the bottom", () => {
    const sorted = sortRows(rows, col("age"), "asc");
    expect(ids(sorted).slice(-2)).toEqual(["3", "4"]);
  });

  it("mixes numbers and text without throwing", () => {
    const mixed = [row(record("1", { when: "soon" })), row(record("2", { when: "2024-01-01" }))];
    expect(sortRows(mixed, col("when"), "asc")).toHaveLength(2);
  });

  it("applies filters, then a sort by a known column", () => {
    const state = view({ search: "item", sort: { key: "age", direction: "desc" } });
    expect(ids(applyView(rows, columns, state))).toEqual(["2", "5", "1", "3"]);
    expect(
      ids(applyView(rows, columns, view({ sort: { key: "ghost", direction: "asc" } }))),
    ).toEqual(["1", "2", "3", "4", "5"]);
    expect(applyView(rows, columns, DEFAULT_VIEW)).toBe(rows);
  });
});
