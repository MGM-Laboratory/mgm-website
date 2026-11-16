// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import type {
  FormAnswers,
  FormDocument,
  FormField,
  FormFieldType,
  FormResponseRecord,
} from "@repo/shared";
import { describe, expect, it } from "vitest";

import { formAnswerDataColumns, type DataColumn, META_COLUMNS } from "./columns";
import {
  STEP_LABELS,
  answerChanges,
  describeStep,
  levenshtein,
  newStep,
  normalizeKey,
  replacer,
  runPipeline,
  suggestStandardize,
  toSentenceCase,
  toTitleCase,
  type CleanStep,
} from "./pipeline";

function field(id: string, type: FormFieldType, extra: Partial<FormField> = {}): FormField {
  return { id, type, label: id.toUpperCase(), ...extra } as FormField;
}

const fields: FormField[] = [
  field("name", "short_text", { required: true }),
  field("city", "short_text"),
  field("age", "number"),
  field("when", "date"),
  field("plan", "multiple_choice", {
    options: [{ id: "a", label: "A" }],
    allowOther: true,
  }),
  field("who", "name"),
  field("where", "address"),
];
const document = { fields, endings: [{ id: "end" }] } as unknown as FormDocument;
const baseColumns: DataColumn[] = [...formAnswerDataColumns(document), ...META_COLUMNS];

function record(
  id: string,
  answers: FormAnswers,
  patch: { spam?: boolean; flagged?: boolean } = {},
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
    },
    admin: {
      starred: false,
      flagged: patch.flagged ?? false,
      reviewed: false,
      tags: [],
      note: null,
      editedAt: null,
    },
    createdAt: "2024-03-05T10:30:00.000Z",
  };
}

let counter = 0;
function step<T extends CleanStep["kind"]>(
  kind: T,
  patch: Partial<Extract<CleanStep, { kind: T }>>,
): CleanStep {
  counter += 1;
  return { ...newStep(kind, `t${counter}`), ...patch } as CleanStep;
}

function run(responses: FormResponseRecord[], steps: CleanStep[]) {
  return runPipeline(document, responses, baseColumns, steps);
}

describe("string helpers", () => {
  it("title cases after separators", () => {
    expect(toTitleCase("jOHN o'neil-smith (jr) / x")).toBe("John O'Neil-Smith (Jr) / X");
  });

  it("sentence cases after punctuation", () => {
    expect(toSentenceCase("  HELLO there. how ARE you? fine!ok")).toBe(
      "  Hello there. How are you? Fine!ok",
    );
  });

  it("builds a plain replacer", () => {
    const base = newStep("replace", "x");
    if (base.kind !== "replace") throw new Error("kind");
    expect(replacer({ ...base, find: "" })("abc")).toBe("abc");
    expect(replacer({ ...base, find: "a.c", replace: "-" })("A.C xa.c")).toBe("- x-");
    expect(replacer({ ...base, find: "a", replace: "-", caseSensitive: true })("aAa")).toBe("-A-");
    expect(replacer({ ...base, find: "zzz", replace: "-" })("abc")).toBe("abc");
    expect(replacer({ ...base, find: "ABC", replace: "-", wholeCell: true })("abc")).toBe("-");
    expect(replacer({ ...base, find: "ab", replace: "-", wholeCell: true })("abc")).toBe("abc");
  });

  it("normalizes keys", () => {
    expect(normalizeKey("  Café -- Déjà  Vu! ")).toBe("cafe deja vu");
    expect(normalizeKey("!!!")).toBe("");
  });

  it("measures edit distance within a limit", () => {
    expect(levenshtein("kitten", "kitten")).toBe(0);
    expect(levenshtein("kitten", "sitten")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abcdefgh")).toBe(4);
    expect(levenshtein("abcdef", "uvwxyz", 2)).toBe(3);
    expect(levenshtein("", "ab")).toBe(2);
  });
});

describe("newStep and describeStep", () => {
  it("builds a default step for every kind", () => {
    for (const kind of Object.keys(STEP_LABELS) as CleanStep["kind"][]) {
      const made = newStep(kind, "id1");
      expect(made).toMatchObject({ id: "id1", enabled: true, kind });
    }
    expect(newStep("trim").id).toMatch(/^s[0-9a-z]+$/);
    expect(newStep("trim").id).not.toBe(newStep("trim").id);
  });

  const label = (key: string) => key.toUpperCase();

  it("describes steps in a line", () => {
    expect(describeStep(newStep("trim"), label)).toBe("all text columns");
    expect(describeStep(newStep("case"), label)).toBe("title case · no columns yet");
    expect(describeStep({ ...newStep("case"), columns: ["a", "b"] } as CleanStep, label)).toBe(
      "title case · A, B",
    );
    expect(describeStep(newStep("replace"), label)).toBe("Nothing to find yet");
    expect(
      describeStep({ ...newStep("replace"), find: "a", replace: "b" } as CleanStep, label),
    ).toBe('"a" → "b" · all text columns');
    expect(describeStep(newStep("fill"), label)).toBe("No fill value yet");
    expect(describeStep({ ...newStep("fill"), value: "n/a" } as CleanStep, label)).toBe(
      '"n/a" · no columns yet',
    );
    expect(describeStep(newStep("standardize"), label)).toBe("Pick a column");
    const mapped = {
      ...newStep("standardize"),
      column: "c",
      mappings: [{ from: ["x"], to: "y" }],
    } as CleanStep;
    expect(describeStep(mapped, label)).toBe("C · 1 mapping");
    expect(
      describeStep(
        {
          ...mapped,
          mappings: [
            { from: [], to: "" },
            { from: [], to: "" },
          ],
        } as CleanStep,
        label,
      ),
    ).toBe("C · 2 mappings");
    expect(describeStep(newStep("dedupe"), label)).toMatch(/Pick the columns/);
    expect(describeStep({ ...newStep("dedupe"), columns: ["a"] } as CleanStep, label)).toBe(
      "by A · keep first",
    );
    expect(describeStep(newStep("exclude"), label)).toBe("spam");
    expect(describeStep({ ...newStep("exclude"), what: "condition" } as CleanStep, label)).toBe(
      "Write a condition",
    );
    expect(
      describeStep(
        { ...newStep("exclude"), what: "condition", formula: "1=1" } as CleanStep,
        label,
      ),
    ).toBe("1=1");
    expect(describeStep(newStep("split"), label)).toBe("Pick a column");
    expect(describeStep({ ...newStep("split"), column: "c" } as CleanStep, label)).toBe('C by ","');
    expect(describeStep(newStep("compute"), label)).toBe("Write a formula");
    expect(describeStep({ ...newStep("compute"), formula: "1" } as CleanStep, label)).toBe(
      "Computed = 1",
    );
  });
});

describe("suggestStandardize", () => {
  it("groups spellings that normalize alike and suggests the commonest", () => {
    const result = suggestStandardize([
      "Jakarta",
      "jakarta",
      "jakarta",
      "JAKARTA ",
      "Bandung",
      "",
      "  ",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].to).toBe("jakarta");
    expect([...result[0].from].sort()).toEqual(["JAKARTA", "Jakarta"]);
    expect(result[0].count).toBe(2);
  });

  it("groups values a typo apart and leaves short and distant ones alone", () => {
    const result = suggestStandardize([
      "Surabaya",
      "Surabaja",
      "Surabaya",
      "Malang",
      "Medan",
      "cat",
      "cot",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ to: "Surabaya", from: ["Surabaja"], count: 1 });
  });

  it("allows two typos for long words and ranks groups by size", () => {
    const result = suggestStandardize([
      "international",
      "internasional",
      "internasional",
      "Yogyakarta",
      "Jogjakarta",
      "Yogyakarta",
      "Yogyakarta",
      "Jokjakarta",
    ]);
    expect(result.map((group) => group.to)).toEqual(["Yogyakarta", "internasional"]);
    expect(result[0].count).toBe(2);
  });

  it("limits the number of groups", () => {
    const words = ["Alpha", "Bravo", "Charlie", "Delta", "Foxtrot"];
    const values = words.flatMap((word) => [word, word.toUpperCase()]);
    expect(suggestStandardize(values)).toHaveLength(5);
    expect(suggestStandardize(values, 2)).toHaveLength(2);
    expect(suggestStandardize([])).toEqual([]);
  });
});

describe("runPipeline text steps", () => {
  const rows = [
    record("1", {
      name: "  Ada   Lovelace ",
      city: "  malang  ",
      age: 3,
      who: { first: " a ", last: "b" },
    }),
    record("2", { name: "Bob", city: "SURABAYA", when: "2024-01-01" }),
  ];

  it("leaves the records untouched and shares answers of untouched rows", () => {
    const result = run(rows, [step("trim", { columns: "all" })]);
    expect(result.inputCount).toBe(2);
    expect(result.rows[1].answers).toBe(rows[1].answers);
    expect(result.rows[0].answers).not.toBe(rows[0].answers);
    expect(rows[0].answers.name).toBe("  Ada   Lovelace ");
    expect(result.rows[0].answers.name).toBe("Ada   Lovelace");
    expect(result.rows[0].answers.who).toEqual({ first: "a", last: "b" });
    expect(result.steps[0].changedCells).toBe(3);
  });

  it("skips disabled steps", () => {
    const result = run(rows, [step("trim", { columns: "all", enabled: false })]);
    expect(result.steps[0]).toMatchObject({ changedCells: 0 });
    expect(result.rows[0].answers).toBe(rows[0].answers);
  });

  it("collapses spaces and blank lines but keeps single newlines", () => {
    const result = run(
      [record("1", { name: "a   b\n\n\n\nc\nd" })],
      [step("collapse", { columns: ["name"] })],
    );
    expect(result.rows[0].answers.name).toBe("a b\n\nc\nd");
  });

  it("changes case in every mode", () => {
    const of = (mode: "lower" | "upper" | "title" | "sentence") =>
      run([record("1", { city: "mALANG kota. baru" })], [step("case", { columns: ["city"], mode })])
        .rows[0].answers.city;
    expect(of("lower")).toBe("malang kota. baru");
    expect(of("upper")).toBe("MALANG KOTA. BARU");
    expect(of("title")).toBe("Malang Kota. Baru");
    expect(of("sentence")).toBe("Malang kota. Baru");
  });

  it("does not touch columns that are not cleanable", () => {
    const result = run(rows, [
      step("case", { columns: ["age", "plan", "$city", "missing"], mode: "upper" }),
    ]);
    expect(result.steps[0].changedCells).toBe(0);
  });

  it("replaces text and ignores an empty needle", () => {
    const result = run(rows, [
      step("replace", { columns: ["city"], find: "malang", replace: "Malang" }),
    ]);
    expect(result.rows[0].answers.city).toBe("  Malang  ");
    expect(result.steps[0].changedCells).toBe(1);
    const none = run(rows, [step("replace", { columns: "all", find: "", replace: "x" })]);
    expect(none.steps[0].changedCells).toBe(0);
  });

  it("standardizes values through a mapping", () => {
    const result = run(rows, [
      step("standardize", {
        column: "city",
        mappings: [
          { from: ["SURABAYA", "malang", "same"], to: "Kota" },
          { from: ["Kota"], to: "Kota" },
        ],
      }),
    ]);
    expect(result.rows.map((row) => row.answers.city)).toEqual(["Kota", "Kota"]);
    expect(result.steps[0].changedCells).toBe(2);
    expect(
      run(rows, [step("standardize", { column: "nope", mappings: [{ from: ["a"], to: "b" }] })])
        .steps[0].changedCells,
    ).toBe(0);
    expect(
      run(rows, [step("standardize", { column: "city", mappings: [] })]).steps[0].changedCells,
    ).toBe(0);
  });
});

describe("runPipeline fill", () => {
  const rows = [
    record("1", { name: "Ada", city: "", age: 3 }),
    record("2", { name: "   ", when: "" }),
    record("3", { name: "Cy", city: "X", "plan:other": "" }),
  ];

  it("fills empty text cells but not answered ones", () => {
    const result = run(rows, [step("fill", { columns: ["city", "name"], value: "n/a" })]);
    expect(result.rows[0].answers.city).toBe("n/a");
    expect(result.rows[1].answers.city).toBe("n/a");
    expect(result.rows[1].answers.name).toBe("n/a");
    expect(result.rows[2].answers.city).toBe("X");
    expect(result.rows[0].answers.name).toBe("Ada");
    expect(result.steps[0].changedCells).toBe(3);
  });

  it("fills numbers only with a numeric value, and dates with text", () => {
    const numeric = run(rows, [step("fill", { columns: ["age"], value: "0" })]);
    expect(numeric.rows[1].answers.age).toBe(0);
    expect(numeric.rows[2].answers.age).toBe(0);
    expect(numeric.rows[0].answers.age).toBe(3);
    expect(
      run(rows, [step("fill", { columns: ["age"], value: "abc" })]).steps[0].changedCells,
    ).toBe(0);
    const dated = run(rows, [step("fill", { columns: ["when"], value: "2000-01-01" })]);
    expect(dated.rows[0].answers.when).toBe("2000-01-01");
  });

  it("fills other texts, skips name and address parts, choices and unknown columns", () => {
    const other = run(rows, [step("fill", { columns: ["plan:other"], value: "none" })]);
    expect(other.rows[2].answers["plan:other"]).toBe("none");
    const parts = run(rows, [
      step("fill", { columns: ["who", "where", "plan", "ghost"], value: "x" }),
    ]);
    expect(parts.steps[0].changedCells).toBe(0);
    expect(run(rows, [step("fill", { columns: "all", value: "" })]).steps[0].changedCells).toBe(0);
  });

  it("fills every cleanable column with all and fills split columns", () => {
    const all = run([record("1", {})], [step("fill", { columns: "all", value: "-" })]);
    expect(all.rows[0].answers.name).toBe("-");
    expect(all.rows[0].answers.city).toBe("-");
    const chained = run(
      [record("1", { city: "a" }), record("2", { city: "a,b" })],
      [
        step("split", { id: "t1", column: "city", delimiter: ",", maxParts: 2 }),
        step("fill", { columns: ["t1:1", "t1:2"], value: "?" }),
      ],
    );
    expect(chained.rows[0].extra["t1:2"]).toBe("?");
    expect(chained.rows[1].extra["t1:2"]).toBe("b");
  });
});

describe("runPipeline dedupe and exclude", () => {
  const rows = [
    record("1", { name: "Ada", city: "Malang" }),
    record("2", { name: "ada!", city: "malang" }),
    record("3", { name: "Bob", city: "Malang" }),
  ];

  it("keeps the first or the last duplicate", () => {
    const first = run(rows, [step("dedupe", { columns: ["name", "city"], keep: "first" })]);
    expect(first.rows.map((row) => row.id)).toEqual(["1", "3"]);
    expect(first.steps[0].removedRows).toBe(1);
    const last = run(rows, [step("dedupe", { columns: ["name", "city"], keep: "last" })]);
    expect(last.rows.map((row) => row.id)).toEqual(["2", "3"]);
    expect(run(rows, [step("dedupe", { columns: ["nope"], keep: "first" })]).rows).toHaveLength(3);
  });

  it("excludes spam, flagged and incomplete rows", () => {
    const set = [
      record("1", { name: "A" }, { spam: true }),
      record("2", { name: "B" }, { flagged: true }),
      record("3", { name: "" }),
      record("4", { name: "D" }),
    ];
    expect(run(set, [step("exclude", { what: "spam" })]).rows.map((row) => row.id)).toEqual([
      "2",
      "3",
      "4",
    ]);
    expect(run(set, [step("exclude", { what: "flagged" })]).rows.map((row) => row.id)).toEqual([
      "1",
      "3",
      "4",
    ]);
    const incomplete = run(set, [step("exclude", { what: "incomplete" })]);
    expect(incomplete.rows.map((row) => row.id)).toEqual(["1", "2", "4"]);
    expect(incomplete.steps[0].removedRows).toBe(1);
  });

  it("treats a document it cannot walk as complete", () => {
    const broken = { fields: null, endings: [] } as unknown as FormDocument;
    const result = runPipeline(broken, [record("1", {})], baseColumns, [
      step("exclude", { what: "incomplete" }),
    ]);
    expect(result.rows).toHaveLength(1);
  });

  it("excludes rows by a formula", () => {
    const set = [record("1", { age: 5 }), record("2", { age: 1 }), record("3", { name: "x" })];
    const result = run(set, [step("exclude", { what: "condition", formula: "{age} >= 3" })]);
    expect(result.rows.map((row) => row.id)).toEqual(["2", "3"]);
    const text = run(set, [step("exclude", { what: "condition", formula: "{name}" })]);
    expect(text.rows.map((row) => row.id)).toEqual(["1", "2"]);
    const numeric = run(set, [step("exclude", { what: "condition", formula: "{age}" })]);
    expect(numeric.rows.map((row) => row.id)).toEqual(["3"]);
  });

  it("reports a bad formula without removing anything", () => {
    const bad = run(rows, [step("exclude", { what: "condition", formula: "{ghost} > 1" })]);
    expect(bad.rows).toHaveLength(3);
    expect(bad.steps[0].error).toMatch(/No column called "ghost"/);
    const missing = run(rows, [step("exclude", { what: "condition" })]);
    expect(missing.steps[0].error).toBe("Write a formula.");
  });
});

describe("runPipeline split and compute", () => {
  it("splits into parts and caps the part count", () => {
    const result = run(
      [record("1", { city: "a, b , c, d" }), record("2", { city: "x" }), record("3", { city: "" })],
      [step("split", { id: "t1", column: "city", delimiter: ",", maxParts: 3 })],
    );
    expect(result.extraColumns.map((column) => column.label)).toEqual([
      "CITY (1)",
      "CITY (2)",
      "CITY (3)",
    ]);
    expect(result.rows[0].extra).toEqual({ "t1:1": "a", "t1:2": "b", "t1:3": "c,d" });
    expect(result.rows[1].extra["t1:1"]).toBe("x");
    expect(result.rows[1].extra["t1:2"]).toBeNull();
    expect(result.steps[0]).toMatchObject({ addedColumns: 3, changedCells: 4 });
  });

  it("uses at least two parts and ignores an invalid split", () => {
    const result = run(
      [record("1", { city: "one" })],
      [step("split", { column: "city", delimiter: "/", maxParts: 99 })],
    );
    expect(result.extraColumns).toHaveLength(2);
    const clamped = run(
      [record("1", { city: "a/b/c" })],
      [step("split", { id: "t2", column: "city", delimiter: "/", maxParts: Number.NaN })],
    );
    expect(clamped.extraColumns).toHaveLength(2);
    expect(clamped.rows[0].extra["t2:2"]).toBe("b/c");
    expect(
      run([record("1", {})], [step("split", { column: "nope", delimiter: "," })]).extraColumns,
    ).toEqual([]);
    expect(
      run([record("1", {})], [step("split", { column: "city", delimiter: "" })]).extraColumns,
    ).toEqual([]);
  });

  it("computes a numeric column that later steps can use", () => {
    const result = run(
      [record("1", { age: 2 }), record("2", { age: 4 }), record("3", {})],
      [
        step("compute", { name: "  Double ", formula: "{age} * 2" }),
        step("exclude", { what: "condition", formula: "{Double} > 5" }),
      ],
    );
    expect(result.extraColumns[0]).toMatchObject({ label: "Double", valueType: "number" });
    expect(result.rows.map((row) => row.extra[result.extraColumns[0].key])).toEqual([4, null]);
    expect(result.steps[0]).toMatchObject({ addedColumns: 1, changedCells: 2 });
    expect(result.steps[1].removedRows).toBe(1);
  });

  it("types computed columns as boolean or text", () => {
    const bool = run(
      [record("1", { age: 2 })],
      [step("compute", { name: "", formula: "{age} > 1" })],
    );
    expect(bool.extraColumns[0]).toMatchObject({ label: "Computed", valueType: "boolean" });
    const text = run(
      [record("1", { name: "x" })],
      [step("compute", { name: "T", formula: "upper({name})" })],
    );
    expect(text.extraColumns[0].valueType).toBe("text");
    const empty = run([record("1", {})], [step("compute", { name: "E", formula: "{age} * 2" })]);
    expect(empty.extraColumns[0].valueType).toBe("text");
    expect(empty.steps[0].changedCells).toBe(0);
  });

  it("reports a bad compute formula", () => {
    const result = run([record("1", {})], [step("compute", { name: "X", formula: "1 +" })]);
    expect(result.steps[0].error).toMatch(/ends too early/);
    expect(result.extraColumns).toEqual([]);
  });

  it("cleans text of virtual columns", () => {
    const result = run(
      [record("1", { city: " a , b " })],
      [
        step("split", { id: "t1", column: "city", delimiter: ",", maxParts: 2 }),
        step("case", { columns: ["t1:1", "t1:2"], mode: "upper" }),
        step("trim", { columns: "all" }),
      ],
    );
    expect(result.rows[0].extra).toEqual({ "t1:1": "A", "t1:2": "B" });
  });
});

describe("answerChanges", () => {
  it("lists only rows whose answers changed, with the cell count", () => {
    const rows = [
      record("1", { name: " Ada ", city: " x " }),
      record("2", { name: "Bob" }),
      record("3", { name: "Cy" }),
    ];
    const result = run(rows, [
      step("trim", { columns: "all" }),
      step("fill", { columns: ["city"], value: "n/a" }),
    ]);
    const changes = answerChanges(result);
    expect(changes).toEqual([
      { id: "1", answers: { name: "Ada", city: "x" }, cells: 2 },
      { id: "2", answers: { name: "Bob", city: "n/a" }, cells: 1 },
      { id: "3", answers: { name: "Cy", city: "n/a" }, cells: 1 },
    ]);
  });

  it("drops a row whose answers were rewritten into the same values", () => {
    const rows = [record("1", { name: "Ada" })];
    const result = run(rows, [step("trim", { columns: "all" })]);
    expect(answerChanges(result)).toEqual([]);
    const manual = run(rows, []);
    manual.rows[0].answers = { ...manual.rows[0].answers };
    expect(answerChanges(manual)).toEqual([]);
  });
});
