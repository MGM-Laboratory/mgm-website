import type { FormAnswers, FormField, FormFieldType, FormResponseRecord } from "@repo/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { META_COLUMNS, extraDataColumn, formAnswerDataColumns, type WorkingRow } from "./columns";
import {
  downloadBlob,
  exportFileName,
  exportTable,
  quoteField,
  toCsvBytes,
  toDelimited,
  toFlatJson,
  toMarkdown,
  toRawJson,
  toXlsxBytes,
} from "./export";

function field(id: string, type: FormFieldType, extra: Partial<FormField> = {}): FormField {
  return { id, type, label: id.toUpperCase(), ...extra } as FormField;
}

const fields: FormField[] = [
  field("name", "short_text", { label: "Name" }),
  field("age", "number", { label: "Age" }),
  field("agree", "yes_no", { label: "Agree" }),
  field("when", "date", { label: "When" }),
  field("plan", "multiple_choice", {
    label: "Plan",
    options: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ],
  }),
  field("docs", "file_upload", { label: "Docs" }),
];
const answerColumns = formAnswerDataColumns({ fields });
const meta = (key: string) => META_COLUMNS.find((column) => column.key === key) ?? META_COLUMNS[0];

function record(
  id: string,
  answers: FormAnswers,
  durationMs: number | null = null,
): FormResponseRecord {
  return {
    id,
    formId: "f",
    answers,
    score: 2,
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
      durationMs,
    },
    admin: {
      starred: false,
      flagged: false,
      reviewed: false,
      tags: [],
      note: null,
      editedAt: null,
    },
    createdAt: "2024-03-05T10:30:00.000Z",
  };
}

function row(rec: FormResponseRecord, extra: WorkingRow["extra"] = {}): WorkingRow {
  return { id: rec.id, index: 0, record: rec, answers: rec.answers, extra };
}

const rows = [
  row(
    record(
      "r1",
      {
        name: 'Ada, "the" first',
        age: 36,
        agree: true,
        when: "2024-03-05",
        plan: "a",
        docs: [{ key: "k/1.pdf", name: "one.pdf", size: 1, type: "application/pdf" }],
      },
      12300,
    ),
  ),
  row(
    record("r2", { name: "=SUM(A1)", age: 5, agree: false, when: "2024-03-05T09:30", plan: "b" }),
  ),
  row(record("r3", { name: "+1-1", age: 7 }), { calc: 2.5 }),
  row(record("r4", { name: "-12.5", dummy: "x" })),
  row(record("r5", { name: "line\nbreak\tTab @x" })),
];

const table = exportTable(rows, answerColumns, { raw: false });

describe("exportTable", () => {
  it("builds the header from the labels", () => {
    expect(table.header).toEqual(["Response ID", "Name", "Age", "Agree", "When", "Plan", "Docs"]);
  });
});

describe("quoteField", () => {
  it("quotes only when needed", () => {
    expect(quoteField("plain", ",")).toBe("plain");
    expect(quoteField("a,b", ",")).toBe('"a,b"');
    expect(quoteField('say "hi"', ",")).toBe('"say ""hi"""');
    expect(quoteField("a\nb", ",")).toBe('"a\nb"');
    expect(quoteField("a\rb", ",")).toBe('"a\rb"');
    expect(quoteField("a,b", "\t")).toBe("a,b");
    expect(quoteField("a\tb", "\t")).toBe('"a\tb"');
  });
});

describe("toDelimited", () => {
  it("writes CSV with quoting and defused formulas", () => {
    const lines = toDelimited(table, ",").split("\r\n");
    expect(lines[0]).toBe("Response ID,Name,Age,Agree,When,Plan,Docs");
    expect(lines[1]).toBe('r1,"Ada, ""the"" first",36,Yes,2024-03-05,Alpha,one.pdf');
    expect(lines[2]).toBe("r2,'=SUM(A1),5,No,2024-03-05T09:30,Beta,");
    // A plain number keeps its sign, arithmetic does not
    expect(lines[3]).toBe("r3,'+1-1,7,,,,");
    expect(lines[4]).toBe("r4,-12.5,,,,,");
    expect(lines[5]).toBe('r5,"line\nbreak\tTab @x",,,,,');
    expect(lines.at(-1)).toBe("");
  });

  it("defuses a header and replaces tabs in TSV", () => {
    const evil = exportTable(rows.slice(4), [{ ...answerColumns[0], label: "=HYPERLINK()" }], {
      raw: false,
    });
    expect(toDelimited(evil, ",").split("\r\n")[0]).toBe("Response ID,'=HYPERLINK()");
    const tsv = toDelimited(table, "\t").split("\r\n");
    expect(tsv[0]).toBe("Response ID\tName\tAge\tAgree\tWhen\tPlan\tDocs");
    expect(tsv[1]).toBe('r1\t"Ada, ""the"" first"\t36\tYes\t2024-03-05\tAlpha\tone.pdf');
    // The tab inside a cell would break the column, so it becomes a space
    expect(tsv[5]).toBe('r5\t"line\nbreak Tab @x"\t\t\t\t\t');
  });

  it("exports raw ids, ISO dates and the duration meta column", () => {
    const withMeta = exportTable(
      rows.slice(0, 2),
      [answerColumns[4], meta("$submittedAt"), meta("$duration")],
      {
        raw: true,
      },
    );
    const lines = toDelimited(withMeta, ",").split("\r\n");
    expect(lines[1]).toBe("r1,a,2024-03-05T10:30:00.000Z,12.3");
    expect(lines[2]).toBe("r2,b,2024-03-05T10:30:00.000Z,");
  });

  it("uses ending titles unless raw", () => {
    const withEnding = row({ ...record("r9", {}), endingId: "end1" });
    const titles = new Map([["end1", "Thanks"]]);
    const pretty = exportTable([withEnding], [meta("$ending")], {
      raw: false,
      endingTitles: titles,
    });
    expect(toDelimited(pretty, ",")).toContain("r9,Thanks");
    const raw = exportTable([withEnding], [meta("$ending")], { raw: true, endingTitles: titles });
    expect(toDelimited(raw, ",")).toContain("r9,end1");
  });
});

describe("toCsvBytes", () => {
  it("starts with a UTF-8 byte order mark", () => {
    const bytes = toCsvBytes(table);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3, 20))).toBe("Response ID,Name,");
  });
});

describe("toMarkdown", () => {
  it("escapes pipes, backslashes and line breaks", () => {
    const md = toMarkdown(
      exportTable([row(record("a|b", { name: "x | y \\ z\r\nnext\nline" }))], [answerColumns[0]], {
        raw: false,
      }),
    );
    expect(md).toBe(
      "| Response ID | Name |\n| --- | --- |\n| a\\|b | x \\| y \\\\ z<br>next<br>line |\n",
    );
  });
});

describe("toFlatJson", () => {
  it("keys rows by label and types the values", () => {
    const parsed = JSON.parse(toFlatJson(table)) as Record<string, unknown>[];
    expect(parsed[0]).toEqual({
      id: "r1",
      Name: 'Ada, "the" first',
      Age: 36,
      Agree: true,
      When: "2024-03-05",
      Plan: "Alpha",
      Docs: "one.pdf",
    });
    expect(parsed[1].Agree).toBe(false);
    expect(parsed[2].Name).toBe("+1-1");
    expect(parsed[2].Age).toBe(7);
    expect(parsed[2].Plan).toBeNull();
    expect(parsed[3].Age).toBeNull();
  });

  it("keeps duplicated labels apart and uses raw file keys", () => {
    const dupes = [
      { ...answerColumns[0], key: "n1", label: "id" },
      { ...answerColumns[0], key: "n2", label: "id" },
      answerColumns[5],
    ];
    const parsed = JSON.parse(
      toFlatJson(exportTable(rows.slice(0, 1), dupes, { raw: true })),
    ) as Record<string, unknown>[];
    expect(Object.keys(parsed[0])).toEqual(["id", "id [n1]", "id [n2]", "Docs"]);
    expect(parsed[0].Docs).toBe("k/1.pdf");
  });

  it("types extra and meta columns", () => {
    const calc = extraDataColumn("calc", "Calc", "number");
    const flag = extraDataColumn("flag", "Flag", "boolean");
    const text = extraDataColumn("text", "Text");
    const items = [
      row(record("x", {}), { calc: 4, flag: true, text: "hello" }),
      row(record("y", {}), { calc: null, flag: false }),
    ];
    const parsed = JSON.parse(
      toFlatJson(
        exportTable(items, [calc, flag, text, meta("$submittedAt"), meta("$score")], {
          raw: false,
        }),
      ),
    ) as Record<string, unknown>[];
    expect(parsed[0]).toMatchObject({
      Calc: 4,
      Flag: true,
      Text: "hello",
      "Submitted at": "2024-03-05T10:30:00.000Z",
      Score: 2,
    });
    expect(parsed[1]).toMatchObject({ Calc: null, Flag: false, Text: null });
    const numericText = extraDataColumn("calc", "Calc");
    const odd = JSON.parse(toFlatJson(exportTable(items, [numericText], { raw: false }))) as Record<
      string,
      unknown
    >[];
    expect(odd[0].Calc).toBe(4);
  });
});

describe("toRawJson", () => {
  it("includes records with cleaned answers and computed values", () => {
    const cleaned = row(record("c1", { name: "old" }), { calc: 1 });
    cleaned.answers = { name: "new" };
    const plain = row(record("c2", { name: "same" }));
    const parsed = JSON.parse(
      toRawJson(exportTable([cleaned, plain], answerColumns, { raw: true })),
    ) as Record<string, unknown>[];
    expect(parsed[0]).toMatchObject({ id: "c1", answers: { name: "new" }, computed: { calc: 1 } });
    expect(parsed[1]).toMatchObject({ id: "c2", answers: { name: "same" } });
    expect(parsed[1]).not.toHaveProperty("computed");
  });
});

describe("toXlsxBytes", () => {
  it("produces a zip with typed cells and column widths", () => {
    const bytes = toXlsxBytes(table, "Responses");
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain('<c r="C2"><v>36</v></c>');
    expect(text).toContain('<c r="D2" t="b"><v>1</v></c>');
    // A date answer becomes a date serial, a datetime keeps its time
    expect(text).toMatch(/<c r="E2" s="4"><v>45356<\/v><\/c>/);
    expect(text).toMatch(/<c r="E3" s="2"><v>45356\.3958333/);
    expect(text).toContain("one.pdf");
    expect(text).toContain('width="26"');
  });

  it("joins array values and dates the submission time", () => {
    const tags = row(record("t", {}));
    tags.record.admin.tags = ["a", "b"];
    const bytes = toXlsxBytes(
      exportTable([tags], [meta("$tags"), meta("$submittedAt")], { raw: false }),
      "T",
    );
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("a, b");
    expect(text).toMatch(/r="C2" s="[24]"/);
  });
});

describe("exportFileName", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a safe stem and appends the local date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 2, 5, 12));
    expect(exportFileName("Café Survey: Q1/2024!", "csv")).toBe(
      "cafe-survey-q1-2024-2024-03-05.csv",
    );
    expect(exportFileName("!!!", "xlsx")).toBe("responses-2024-03-05.xlsx");
    expect(exportFileName("x".repeat(100), "json")).toBe(`${"x".repeat(60)}-2024-03-05.json`);
  });
});

describe("downloadBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stubBrowser() {
    const link = { href: "", download: "", rel: "", click: vi.fn(), remove: vi.fn() };
    const appended: unknown[] = [];
    const created: Blob[] = [];
    const revoked: string[] = [];
    vi.stubGlobal("document", {
      createElement: vi.fn(() => link),
      body: { appendChild: (node: unknown) => appended.push(node) },
    });
    vi.stubGlobal("window", {
      setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    });
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return "blob:fake";
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    });
    return { link, appended, created, revoked };
  }

  it("clicks a hidden link and revokes the url later", () => {
    vi.useFakeTimers();
    const { link, appended, created, revoked } = stubBrowser();
    downloadBlob(["a,b"], "out.csv", "text/csv");
    expect(created[0]).toBeInstanceOf(Blob);
    expect(created[0].type).toBe("text/csv");
    expect(link).toMatchObject({ href: "blob:fake", download: "out.csv", rel: "noopener" });
    expect(appended).toEqual([link]);
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(link.remove).toHaveBeenCalledTimes(1);
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(30_000);
    expect(revoked).toEqual(["blob:fake"]);
  });

  it("reuses a blob it is given", () => {
    vi.useFakeTimers();
    const { created } = stubBrowser();
    const blob = new Blob(["x"], { type: "text/plain" });
    downloadBlob(blob, "x.txt", "ignored");
    expect(created[0]).toBe(blob);
  });
});
