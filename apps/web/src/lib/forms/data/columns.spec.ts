// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import type { FormAnswers, FormField, FormFieldType, FormResponseRecord } from "@repo/shared";
import { describe, expect, it } from "vitest";

import {
  META_COLUMNS,
  answerValue,
  cellFiles,
  cellIds,
  cellIsEmpty,
  cellText,
  columnResolver,
  countryLabel,
  countryName,
  exprValue,
  extraDataColumn,
  formAnswerDataColumns,
  formatDateTime,
  formatDuration,
  isMetaKey,
  metaValue,
  sortKey,
  type DataColumn,
  type WorkingRow,
} from "./columns";

function field(id: string, type: FormFieldType, extra: Partial<FormField> = {}): FormField {
  return { id, type, label: id.toUpperCase(), ...extra } as FormField;
}

function record(
  answers: FormAnswers = {},
  patch: {
    meta?: Partial<FormResponseRecord["meta"]>;
    admin?: Partial<FormResponseRecord["admin"]>;
  } & Partial<Omit<FormResponseRecord, "meta" | "admin">> = {},
): FormResponseRecord {
  const { meta, admin, ...rest } = patch;
  return {
    id: "r1",
    formId: "f1",
    answers,
    score: null,
    endingId: null,
    sessionId: null,
    spam: false,
    meta: {
      ip: null,
      userAgent: null,
      referer: null,
      country: null,
      region: null,
      city: null,
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
      ...meta,
    },
    admin: {
      starred: false,
      flagged: false,
      reviewed: false,
      tags: [],
      note: null,
      editedAt: null,
      ...admin,
    },
    createdAt: "2024-03-05T10:30:00.000Z",
    ...rest,
  };
}

function rowOf(rec: FormResponseRecord, extra: WorkingRow["extra"] = {}): WorkingRow {
  return { id: rec.id, index: 0, record: rec, answers: rec.answers, extra };
}

const fields: FormField[] = [
  field("name", "short_text"),
  field("notes", "long_text"),
  field("age", "number"),
  field("when", "date"),
  field("agree", "yes_no"),
  field("plan", "multiple_choice", {
    options: [
      { id: "free", label: "Free" },
      { id: "pro", label: "Pro" },
    ],
    allowOther: true,
    otherLabel: "Something else",
  }),
  field("tools", "checkboxes", { options: [{ id: "a", label: "Alpha" }] }),
  field("pics", "picture_choice", { options: [{ id: "p", label: "Pic" }], maxSelections: 2 }),
  field("pic1", "picture_choice", { options: [{ id: "p", label: "Pic" }] }),
  field("docs", "file_upload"),
  field("grid", "matrix", {
    rowsList: [{ id: "r1", label: "Row 1" }],
    columnsList: [
      { id: "c1", label: "Col 1" },
      { id: "c2", label: "Col 2" },
    ],
  }),
  field("home", "country"),
  field("team", "name"),
  field("where", "address"),
  field("hex", "color"),
  field("rate", "rating"),
  field("head", "heading"),
];

const columns = formAnswerDataColumns({ fields });
const col = (key: string): DataColumn => {
  const found = columns.find((column) => column.key === key);
  if (!found) throw new Error(`no column ${key}`);
  return found;
};

describe("countryName and countryLabel", () => {
  it("names an ISO code and caches the result", () => {
    expect(countryName("id")).toBe("Indonesia");
    expect(countryName("ID")).toBe("Indonesia");
  });

  it("passes names and empty values through", () => {
    expect(countryName(null)).toBe("");
    expect(countryName(undefined)).toBe("");
    expect(countryName("Indonesia")).toBe("Indonesia");
    expect(countryLabel("")).toBe("");
    expect(countryLabel(null)).toBe("");
    expect(countryLabel("Germany")).toBe("Germany");
    expect(countryLabel("de")).toBe("DE Germany");
  });
});

describe("formAnswerDataColumns", () => {
  it("skips content blocks and adds an Other column", () => {
    const keys = columns.map((column) => column.key);
    expect(keys).not.toContain("head");
    expect(keys).toContain("plan:other");
    expect(col("plan:other")).toMatchObject({ valueType: "text", cleanable: true });
    expect(col("plan:other").options).toBeUndefined();
  });

  it("maps field types to value types", () => {
    expect(col("name").valueType).toBe("text");
    expect(col("age").valueType).toBe("number");
    expect(col("rate").valueType).toBe("number");
    expect(col("when").valueType).toBe("date");
    expect(col("agree").valueType).toBe("boolean");
    expect(col("plan").valueType).toBe("choice");
    expect(col("tools").valueType).toBe("multi");
    expect(col("pics").valueType).toBe("multi");
    expect(col("pic1").valueType).toBe("choice");
    expect(col("docs").valueType).toBe("file");
    expect(col("grid").valueType).toBe("object");
    expect(col("home").valueType).toBe("choice");
    expect(col("hex").valueType).toBe("text");
  });

  it("sets widths, options and cleanability", () => {
    expect(col("notes").width).toBe(280);
    expect(col("grid").width).toBe(240);
    expect(col("age").width).toBe(130);
    expect(col("hex").width).toBe(130);
    expect(col("docs").width).toBe(200);
    expect(col("name").width).toBe(200);
    expect(col("plan").options).toEqual([
      { id: "free", label: "Free" },
      { id: "pro", label: "Pro" },
      { id: "__other__", label: "Something else" },
    ]);
    expect(col("name").cleanable).toBe(true);
    expect(col("age").cleanable).toBe(false);
    expect(col("plan").cleanable).toBe(false);
  });

  it("keeps a matrix whole as one object column", () => {
    const matrix = formAnswerDataColumns({
      fields: [
        field("m1", "matrix", { rowsList: [{ id: "x", label: "X" }], matrixMultiple: true }),
        field("m2", "matrix", { rowsList: [{ id: "y", label: "Y" }] }),
      ],
    });
    // The default does not split rows, so one object column each
    expect(matrix.map((column) => column.valueType)).toEqual(["object", "object"]);
  });
});

describe("meta and extra columns", () => {
  it("lists meta columns that start with a dollar sign", () => {
    expect(META_COLUMNS.every((column) => isMetaKey(column.key))).toBe(true);
    expect(isMetaKey("name")).toBe(false);
  });

  it("builds an extra column", () => {
    expect(extraDataColumn("k", "Label")).toMatchObject({
      group: "extra",
      valueType: "text",
      cleanable: true,
    });
    expect(extraDataColumn("k", "N", "number").cleanable).toBe(false);
  });
});

describe("answerValue", () => {
  it("reads the field answer, the other text, or nothing", () => {
    const answers: FormAnswers = { plan: "pro", "plan:other": "custom" };
    expect(answerValue(col("plan"), answers)).toBe("pro");
    expect(answerValue(col("plan:other"), answers)).toBe("custom");
    expect(answerValue(META_COLUMNS[0], answers)).toBeUndefined();
  });
});

describe("metaValue", () => {
  const rec = record(
    {},
    {
      score: 7,
      endingId: "end1",
      spam: true,
      meta: {
        durationMs: 12345,
        country: "ID",
        city: "Malang",
        ip: "1.2.3.4",
        device: "mobile",
        browser: "Firefox",
        os: "Linux",
        language: "en",
        referer: "https://x.test",
        utm: { source: "s", medium: "m", campaign: "c" },
      },
      admin: { tags: ["a", "b"], starred: true, flagged: true, reviewed: true },
    },
  );

  it("maps every meta key", () => {
    expect(metaValue("$submittedAt", rec)).toBe(rec.createdAt);
    expect(metaValue("$duration", rec)).toBe(12.3);
    expect(metaValue("$score", rec)).toBe(7);
    expect(metaValue("$ending", rec)).toBe("end1");
    expect(metaValue("$country", rec)).toBe("ID");
    expect(metaValue("$city", rec)).toBe("Malang");
    expect(metaValue("$ip", rec)).toBe("1.2.3.4");
    expect(metaValue("$device", rec)).toBe("mobile");
    expect(metaValue("$browser", rec)).toBe("Firefox");
    expect(metaValue("$os", rec)).toBe("Linux");
    expect(metaValue("$language", rec)).toBe("en");
    expect(metaValue("$referrer", rec)).toBe("https://x.test");
    expect(metaValue("$utmSource", rec)).toBe("s");
    expect(metaValue("$utmMedium", rec)).toBe("m");
    expect(metaValue("$utmCampaign", rec)).toBe("c");
    expect(metaValue("$tags", rec)).toEqual(["a", "b"]);
    expect(metaValue("$starred", rec)).toBe(true);
    expect(metaValue("$flagged", rec)).toBe(true);
    expect(metaValue("$reviewed", rec)).toBe(true);
    expect(metaValue("$spam", rec)).toBe(true);
    expect(metaValue("$unknown", rec)).toBeNull();
  });

  it("returns empty for a missing duration and utm", () => {
    const bare = record();
    expect(metaValue("$duration", bare)).toBeNull();
    expect(metaValue("$utmSource", bare)).toBeNull();
    expect(metaValue("$utmMedium", bare)).toBeNull();
    expect(metaValue("$utmCampaign", bare)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(Number.NaN)).toBe("");
    expect(formatDuration(5.4)).toBe("5s");
    expect(formatDuration(65)).toBe("1m 05s");
    expect(formatDuration(3725)).toBe("1h 02m");
  });

  it("formats date times and keeps what it cannot read", () => {
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime("")).toBe("");
    expect(formatDateTime("not a date")).toBe("not a date");
    expect(formatDateTime("2024-03-05T10:30:00.000Z")).toMatch(/2024/);
  });
});

describe("cellText", () => {
  const rec = record(
    {
      name: "Ada",
      notes: "",
      age: 3,
      agree: true,
      plan: "pro",
      "plan:other": "custom",
      tools: ["a"],
      docs: [{ key: "k1", name: "one.pdf", size: 1, type: "application/pdf" }],
      grid: { r1: "c2" },
      home: "id",
      team: { first: "Ada", last: "L" },
    },
    {
      endingId: "end1",
      meta: { country: "ID", durationMs: 65000 },
      admin: { tags: ["x", "y"], starred: true },
    },
  );
  const row = rowOf(rec, { calc: 2.123456789, flag: true, none: null, whole: 4, word: "w" });

  it("shows answers as labels", () => {
    expect(cellText(col("plan"), row)).toBe("Pro");
    expect(cellText(col("tools"), row)).toBe("Alpha");
    expect(cellText(col("agree"), row)).toBe("Yes");
    expect(cellText(col("team"), row)).toBe("Ada L");
    expect(cellText(col("home"), row)).toBe("ID Indonesia");
    expect(cellText(col("plan:other"), row)).toBe("custom");
    expect(cellText(col("docs"), row)).toBe("one.pdf");
  });

  it("shows an empty country when it is not text", () => {
    const odd = rowOf(record({ home: 5 as unknown as string }));
    expect(cellText(col("home"), odd)).toBe("");
  });

  it("shows a split matrix row as its column label", () => {
    const rows = formAnswerDataColumns({ fields: [fields[10]] });
    const matrixColumns = columns.filter((column) => column.key === "grid");
    expect(matrixColumns).toHaveLength(1);
    expect(rows).toHaveLength(1);
    const rowColumn: DataColumn = {
      ...col("grid"),
      key: "grid.r1",
      answer: {
        key: "grid.r1",
        fieldId: "grid",
        label: "x",
        field: fields[10],
        part: { kind: "row", rowId: "r1" },
      },
    };
    expect(cellText(rowColumn, row)).toBe("Col 2");
  });

  it("shows raw ids when asked", () => {
    expect(cellText(col("plan"), row, { raw: true })).toBe("pro");
    expect(cellText(col("tools"), row, { raw: true })).toBe("a");
    expect(cellText(col("docs"), row, { raw: true })).toBe("k1");
    expect(cellText(col("age"), row, { raw: true })).toBe("3");
    expect(cellText(col("notes"), row, { raw: true })).toBe("");
    expect(cellText(col("when"), row, { raw: true })).toBe("");
    expect(cellText(col("team"), row, { raw: true })).toBe('{"first":"Ada","last":"L"}');
    const rowColumn: DataColumn = {
      ...col("grid"),
      answer: {
        key: "grid.r1",
        fieldId: "grid",
        label: "x",
        field: fields[10],
        part: { kind: "row", rowId: "r1" },
      },
    };
    expect(cellText(rowColumn, row, { raw: true })).toBe("c2");
    const multi = rowOf(record({ grid: { r1: ["c1", "c2"] } }));
    expect(cellText(rowColumn, multi, { raw: true })).toBe("c1, c2");
    const missing = rowOf(record({ grid: { other: "c1" } }));
    expect(cellText(rowColumn, missing, { raw: true })).toBe("");
    expect(cellText(extraDataColumn("zzz", "Z", "text"), row, { raw: true })).toBe("");
  });

  it("shows extra values", () => {
    const extra = (key: string) => cellText(extraDataColumn(key, key), row);
    expect(extra("calc")).toBe("2.123457");
    expect(extra("whole")).toBe("4");
    expect(extra("flag")).toBe("true");
    expect(extra("word")).toBe("w");
    expect(extra("none")).toBe("");
    expect(extra("missing")).toBe("");
  });

  it("shows meta values", () => {
    const meta = (key: string, options = {}) =>
      cellText(META_COLUMNS.find((column) => column.key === key) as DataColumn, row, options);
    expect(meta("$submittedAt", { isoDates: true })).toBe(rec.createdAt);
    expect(meta("$submittedAt")).toMatch(/2024/);
    expect(meta("$duration", { isoDates: true })).toBe("65");
    expect(meta("$duration")).toBe("1m 05s");
    expect(meta("$country")).toBe("ID Indonesia");
    expect(meta("$country", { raw: true })).toBe("ID");
    expect(meta("$ending")).toBe("end1");
    expect(meta("$ending", { endingTitles: new Map([["end1", "Thanks"]]) })).toBe("Thanks");
    expect(meta("$ending", { raw: true, endingTitles: new Map([["end1", "Thanks"]]) })).toBe(
      "end1",
    );
    expect(meta("$tags")).toBe("x, y");
    expect(meta("$starred")).toBe("Yes");
    expect(meta("$spam")).toBe("No");
    expect(meta("$city")).toBe("");
  });

  it("shows nothing for a column with no answer data", () => {
    const orphan: DataColumn = { ...extraDataColumn("q", "Q"), group: "answer" };
    expect(cellText(orphan, row)).toBe("");
  });
});

describe("sortKey and cellIsEmpty", () => {
  const rec = record(
    {
      name: "Ada",
      age: "5",
      when: "2024-03-05",
      badWhen: "soon",
      agree: true,
      docs: [{ key: "k", name: "n", size: 1, type: "t" }],
      plan: "pro",
      tools: [],
    },
    { score: 3, meta: { durationMs: 1000, city: "Malang" }, admin: { tags: [], starred: true } },
  );
  const row = rowOf(rec, { n: 3, b: true, s: "text", e: "" });

  it("keys answer columns by type", () => {
    expect(sortKey(col("name"), row)).toBe("Ada");
    expect(sortKey(col("age"), row)).toBe(5);
    expect(sortKey(col("when"), row)).toBe(Date.parse("2024-03-05"));
    expect(sortKey(col("agree"), row)).toBe(1);
    expect(sortKey(col("docs"), row)).toBe(1);
    expect(sortKey(col("plan"), row)).toBe("Pro");
    expect(sortKey(col("notes"), row)).toBeNull();
    const bad = rowOf(record({ when: "soon", agree: false, docs: "x" as unknown as string[] }));
    expect(sortKey(col("when"), bad)).toBe("soon");
    expect(sortKey(col("agree"), bad)).toBe(0);
    expect(sortKey(col("docs"), bad)).toBeNull();
    const typed = rowOf(record({ age: 8 }));
    expect(sortKey(col("age"), typed)).toBe(8);
  });

  it("keys meta and extra columns", () => {
    const meta = (key: string) => META_COLUMNS.find((column) => column.key === key) as DataColumn;
    expect(sortKey(meta("$submittedAt"), row)).toBe(Date.parse(rec.createdAt));
    expect(sortKey(meta("$score"), row)).toBe(3);
    expect(sortKey(meta("$starred"), row)).toBe(1);
    expect(sortKey(meta("$city"), row)).toBe("Malang");
    expect(sortKey(meta("$tags"), row)).toBeNull();
    expect(sortKey(meta("$ip"), row)).toBeNull();
    const tagged = rowOf(record({}, { admin: { tags: ["a", "b"] } }));
    expect(sortKey(meta("$tags"), tagged)).toBe("a, b");
    expect(sortKey(extraDataColumn("n", "n"), row)).toBe(3);
    expect(sortKey(extraDataColumn("b", "b"), row)).toBe(1);
    expect(sortKey(extraDataColumn("s", "s"), row)).toBe("text");
    expect(sortKey(extraDataColumn("e", "e"), row)).toBeNull();
    expect(sortKey(extraDataColumn("zz", "zz"), row)).toBeNull();
  });

  it("detects empty cells, counting zero files as empty", () => {
    expect(cellIsEmpty(col("name"), row)).toBe(false);
    expect(cellIsEmpty(col("notes"), row)).toBe(true);
    expect(cellIsEmpty(col("docs"), row)).toBe(false);
    const none = rowOf(record({ docs: [] }));
    expect(cellIsEmpty(col("docs"), none)).toBe(true);
  });
});

describe("cellIds and cellFiles", () => {
  const rec = record(
    {
      plan: "pro",
      tools: ["a", "b"],
      docs: [{ key: "k", name: "n", size: 1, type: "t" }],
      grid: { r1: ["c1", "c2"] },
    },
    { meta: { country: "ID" }, admin: { tags: ["t1", "t2"] } },
  );
  const row = rowOf(rec, { v: 7, e: "" });
  const rowColumn: DataColumn = {
    ...col("grid"),
    answer: {
      key: "grid.r1",
      fieldId: "grid",
      label: "x",
      field: fields[10],
      part: { kind: "row", rowId: "r1" },
    },
  };

  it("lists ids of every column group", () => {
    expect(cellIds(col("plan"), row)).toEqual(["pro"]);
    expect(cellIds(col("tools"), row)).toEqual(["a", "b"]);
    expect(cellIds(col("docs"), row)).toEqual([]);
    expect(cellIds(col("notes"), row)).toEqual([]);
    expect(cellIds(rowColumn, row)).toEqual(["c1", "c2"]);
    expect(cellIds(rowColumn, rowOf(record({ grid: { r1: "c1" } })))).toEqual(["c1"]);
    expect(cellIds(rowColumn, rowOf(record({ grid: {} })))).toEqual([]);
    const meta = (key: string) => META_COLUMNS.find((column) => column.key === key) as DataColumn;
    expect(cellIds(meta("$country"), row)).toEqual(["ID"]);
    expect(cellIds(meta("$tags"), row)).toEqual(["t1", "t2"]);
    expect(cellIds(meta("$city"), row)).toEqual([]);
    expect(cellIds(extraDataColumn("v", "v"), row)).toEqual(["7"]);
    expect(cellIds(extraDataColumn("e", "e"), row)).toEqual([]);
    expect(cellIds(extraDataColumn("missing", "m"), row)).toEqual([]);
  });

  it("returns files only for file columns", () => {
    expect(cellFiles(col("docs"), row)).toHaveLength(1);
    expect(cellFiles(col("plan"), row)).toEqual([]);
    expect(cellFiles(col("docs"), rowOf(record({ docs: "x" as unknown as string[] })))).toEqual([]);
  });
});

describe("exprValue", () => {
  const rec = record(
    {
      name: "Ada",
      age: 4,
      agree: true,
      when: "2024-03-05",
      docs: [{ key: "k", name: "n", size: 1, type: "t" }],
      plan: "pro",
    },
    { score: 5, admin: { tags: ["a", "b"] } },
  );
  const row = rowOf(rec, { v: 2 });

  it("gives formulas typed values", () => {
    expect(exprValue(col("age"), row)).toBe(4);
    expect(exprValue(col("agree"), row)).toBe(true);
    expect(exprValue(col("when"), row)).toBe("2024-03-05");
    expect(exprValue(col("docs"), row)).toBe(1);
    expect(exprValue(col("plan"), row)).toBe("Pro");
    expect(exprValue(col("notes"), row)).toBeNull();
    expect(exprValue(col("name"), row)).toBe("Ada");
    expect(exprValue(extraDataColumn("v", "v"), row)).toBe(2);
    expect(exprValue(extraDataColumn("none", "n"), row)).toBeNull();
    const meta = (key: string) => META_COLUMNS.find((column) => column.key === key) as DataColumn;
    expect(exprValue(meta("$tags"), row)).toBe("a, b");
    expect(exprValue(meta("$score"), row)).toBe(5);
    expect(exprValue(meta("$city"), row)).toBeNull();
  });

  it("handles wrong shaped stored values", () => {
    const odd = rowOf(
      record({
        age: "4" as unknown as number,
        docs: "x" as unknown as string[],
        agree: "yes" as unknown as boolean,
      }),
    );
    expect(exprValue(col("age"), odd)).toBeNull();
    expect(exprValue(col("docs"), odd)).toBe(0);
    expect(exprValue(col("agree"), odd)).toBe(false);
  });
});

describe("columnResolver", () => {
  const resolve = columnResolver([...columns, ...META_COLUMNS]);

  it("finds a column by key, label or field id, ignoring case", () => {
    expect(resolve("age")?.key).toBe("age");
    expect(resolve("  AGE ")?.key).toBe("age");
    expect(resolve("Submitted at")?.key).toBe("$submittedAt");
    expect(resolve("$country")?.key).toBe("$country");
    expect(resolve("utm source")?.key).toBe("$utmSource");
    expect(resolve("plan (Something else)")?.key).toBe("plan:other");
    expect(resolve("nope")).toBeNull();
  });

  it("lets an id win over a label that collides with it", () => {
    const first = formAnswerDataColumns({
      fields: [field("a", "short_text", { label: "b" }), field("b", "short_text", { label: "a" })],
    });
    const lookup = columnResolver(first);
    expect(lookup("a")?.key).toBe("a");
    expect(lookup("b")?.key).toBe("b");
  });
});
