import type { FormConditionGroup, FormDocument, FormField } from "@repo/shared";
import { describe, expect, it } from "vitest";

import {
  blankDocument,
  checkDocument,
  isoToLocalInput,
  localInputToIso,
  randomSlug,
  referenceProblems,
  relativeTime,
  slugify,
} from "./builder-document";

const field = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, type: "short_text", label: id, required: false, width: "full", ...extra }) as FormField;

const group = (...rules: { subject: string; operator?: string; value?: unknown }[]) =>
  ({
    match: "all",
    rules: rules.map((rule) => ({ operator: "equals", ...rule })),
  }) as FormConditionGroup;

function documentOf(fields: FormField[], patch: Partial<FormDocument> = {}): FormDocument {
  return { ...blankDocument("Form"), fields, ...patch };
}

const messages = (document: FormDocument) =>
  referenceProblems(document).map((problem) => problem.message);

describe("blankDocument", () => {
  it("builds a valid form with a welcome screen and one ending", () => {
    const document = blankDocument();
    expect(document.title).toBe("Untitled form");
    expect(document.welcome).toMatchObject({ enabled: true, title: "Untitled form" });
    expect(document.endings).toHaveLength(1);
    expect(document.fields).toEqual([]);
    expect(blankDocument("Survey").title).toBe("Survey");
  });
});

describe("referenceProblems", () => {
  it("is quiet for a sound form", () => {
    const document = documentOf([
      field("a"),
      field("b", { label: "Hello {{a}}", visibleIf: group({ subject: "a", value: "x" }) }),
    ]);
    expect(referenceProblems(document)).toEqual([]);
  });

  it("flags rules about deleted questions, content blocks and later questions", () => {
    const document = documentOf([
      field("a", { visibleIf: group({ subject: "gone" }) }),
      field("blk", { type: "heading" }),
      field("b", { visibleIf: group({ subject: "blk" }) }),
      field("c", { visibleIf: group({ subject: "d" }) }),
      field("d"),
      field("e", { visibleIf: group({ subject: "$score" }) }),
    ]);
    const found = messages(document);
    expect(found).toContainEqual(expect.stringContaining("refers to a question that was deleted"));
    expect(found).toContainEqual(expect.stringContaining("refers to a content block"));
    expect(found).toContainEqual(expect.stringContaining("comes later"));
    expect(found).toHaveLength(3);
  });

  it("flags a rule naming an option that is gone, but accepts Other", () => {
    const choice = field("pick", {
      type: "multiple_choice",
      options: [{ id: "o1", label: "One" }],
    });
    const bad = documentOf([
      choice,
      field("x", { visibleIf: group({ subject: "pick", value: "o9" }) }),
    ]);
    expect(messages(bad)).toEqual([expect.stringContaining("option that no longer exists")]);
    const many = documentOf([
      choice,
      field("x", { visibleIf: group({ subject: "pick", value: ["o1", "o2"] }) }),
    ]);
    expect(messages(many)).toHaveLength(1);
    const ok = documentOf([
      choice,
      field("x", { visibleIf: group({ subject: "pick", value: ["o1", "__other__"] }) }),
      field("y", { visibleIf: group({ subject: "pick" }) }),
      field("z", { visibleIf: group({ subject: "pick", value: 5 }) }),
    ]);
    expect(messages(ok)).toEqual([expect.stringContaining("option that no longer exists")]);
  });

  it("checks the jumps of a page break", () => {
    const document = documentOf([
      field("p1", {
        type: "page_break",
        jumps: [
          { id: "j1", to: "end", when: group({ subject: "q" }) },
          { id: "j2", to: "ending:default", when: group() },
          { id: "j3", to: "ending:missing", when: group() },
          { id: "j4", to: "nowhere", when: group() },
          { id: "j5", to: "q", when: group() },
          { id: "j6", to: "p1", when: group() },
          { id: "j7", to: "p2", when: group() },
        ],
      }),
      field("q"),
      field("p2", { type: "page_break" }),
    ]);
    const found = messages(document);
    expect(found.filter((message) => message.includes("ending that was deleted"))).toHaveLength(1);
    expect(found.filter((message) => message.includes("page that was deleted"))).toHaveLength(2);
    expect(found.filter((message) => message.includes("points back"))).toHaveLength(1);
    expect(found.filter((message) => message.includes("comes later"))).toHaveLength(1);
    expect(found).toHaveLength(5);
  });

  it("checks pipes, hidden fields and the range of a field", () => {
    const document = documentOf([
      field("a", { label: "Hi {{later}} and {{ a }} and {{ghost}}" }),
      field("later"),
      field("h", { type: "hidden" }),
      field("n", { type: "number", min: 10, max: 1 }),
      field("r", { type: "rating", min: 10, max: 1 }),
      field("ok", { type: "number", min: 1, max: 10 }),
    ]);
    const found = referenceProblems(document);
    expect(
      found.filter((problem) => problem.message.includes("isn't an earlier question")),
    ).toHaveLength(3);
    expect(found.find((problem) => problem.message.includes("hidden field needs"))?.target).toBe(
      "h",
    );
    const range = found.filter((problem) => problem.severity === "error");
    expect(range).toHaveLength(1);
    expect(range[0].target).toBe("n");
  });

  it("checks the rules of an ending and the receipt email question", () => {
    const base = documentOf([field("a")]);
    const document = {
      ...base,
      endings: [{ ...base.endings[0], when: group({ subject: "gone" }) }],
    } as FormDocument;
    expect(messages(document)).toEqual([
      expect.stringContaining("Ending 1: a rule refers to a question"),
    ]);
    const receipt = (emailFieldId?: string, type = "email") =>
      ({
        ...documentOf([field("mail", { type }), field("a")]),
        settings: {
          ...base.settings,
          receipt: { ...base.settings.receipt, enabled: true, emailFieldId },
        },
      }) as FormDocument;
    expect(messages(receipt())).toEqual([expect.stringContaining("choose the email question")]);
    expect(messages(receipt("a"))).toHaveLength(1);
    expect(messages(receipt("mail", "short_text"))).toHaveLength(1);
    expect(messages(receipt("mail"))).toEqual([]);
  });

  it("names long, blank and untitled fields in messages", () => {
    const document = documentOf([
      field("a", { label: "x".repeat(60), visibleIf: group({ subject: "gone" }) }),
      field("b", { label: " ", pageTitle: "Page two", visibleIf: group({ subject: "gone" }) }),
      field("c", { label: "", visibleIf: group({ subject: "gone" }) }),
    ]);
    const found = messages(document);
    expect(found[0]).toContain(`1. ${"x".repeat(40)}…`);
    expect(found[1]).toContain("2. Page two");
    expect(found[2]).toMatch(/^3\. \S/);
  });
});

describe("checkDocument", () => {
  it("returns the parsed document when nothing blocks", () => {
    const result = checkDocument(blankDocument("Fine"));
    expect(result.problems).toEqual([]);
    expect(result.parsed?.title).toBe("Fine");
  });

  it("keeps a warning from blocking the parse", () => {
    const result = checkDocument(
      documentOf([field("a", { visibleIf: group({ subject: "gone" }) })]),
    );
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].severity).toBe("warning");
    expect(result.parsed).toBeDefined();
  });

  it("blocks on a range error even when the schema passes", () => {
    const result = checkDocument(documentOf([field("n", { type: "number", min: 5, max: 1 })]));
    expect(result.parsed).toBeUndefined();
    expect(result.problems.some((problem) => problem.severity === "error")).toBe(true);
  });

  it("turns schema issues into problems that point at the right target", () => {
    const base = blankDocument("T");
    const broken = {
      ...base,
      title: "",
      fields: [field("a"), field("b", { type: "not_a_type" })],
      endings: [{ ...base.endings[0], title: "x".repeat(500) }],
      welcome: { ...base.welcome, buttonLabel: "y".repeat(200) },
      settings: { ...base.settings, notifyEmails: ["not an email"] },
      design: { ...base.design, layout: "weird" },
    } as unknown as FormDocument;
    const result = checkDocument(broken);
    expect(result.parsed).toBeUndefined();
    const byTarget = (target: string) =>
      result.problems.filter((problem) => problem.target === target);
    expect(byTarget("form").length).toBeGreaterThan(0);
    expect(byTarget("b")[0]).toMatchObject({ severity: "error", path: "fields.1.type" });
    expect(byTarget("b")[0].message).toMatch(/^2\. b · type: /);
    expect(byTarget("ending:default")[0].message).toMatch(/^Ending 1 · title: /);
    expect(byTarget("welcome").length).toBeGreaterThan(0);
    expect(byTarget("settings").length).toBeGreaterThan(0);
    expect(byTarget("design").length).toBeGreaterThan(0);
    expect(result.problems.every((problem) => problem.key.length > 0)).toBe(true);
  });

  it("falls back to the form for a path that points at nothing", () => {
    const base = blankDocument("T");
    const broken = { ...base, fields: [field("a")], endings: [] } as unknown as FormDocument;
    const result = checkDocument(broken);
    expect(result.problems.some((problem) => problem.target === "form")).toBe(true);
    const missingField = {
      ...base,
      fields: [{ ...field("a"), type: undefined }, field("b")],
    } as unknown as FormDocument;
    expect(checkDocument(missingField).problems[0].target).toBe("a");
  });
});

describe("local time conversions", () => {
  it("round trips an instant through a datetime-local value", () => {
    const iso = "2024-03-05T10:30:00.000Z";
    const local = isoToLocalInput(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localInputToIso(local)).toBe(iso);
  });

  it("handles empty and invalid values", () => {
    expect(isoToLocalInput(undefined)).toBe("");
    expect(isoToLocalInput("")).toBe("");
    expect(isoToLocalInput("nope")).toBe("");
    expect(localInputToIso("")).toBeUndefined();
    expect(localInputToIso("nope")).toBeUndefined();
  });
});

describe("slugs", () => {
  it("makes a readable random slug that passes the slug pattern", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(randomSlug()).toMatch(/^[a-z]+-[a-z]+-[0-9a-z]{3,4}$/);
    }
    expect(new Set(Array.from({ length: 30 }, randomSlug)).size).toBeGreaterThan(20);
  });

  it("slugifies text", () => {
    expect(slugify("Café  Survey: 2024!")).toBe("cafe-survey-2024");
    expect(slugify("--A--B--")).toBe("a-b");
    expect(slugify("!!!")).toBe("");
    expect(slugify("ab-".repeat(40))).toHaveLength(80);
    expect(slugify("a".repeat(79) + "-b")).toBe("a".repeat(79));
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2024-03-15T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("describes recent and older times", () => {
    expect(relativeTime(null)).toBe("never");
    expect(relativeTime(undefined)).toBe("never");
    expect(relativeTime("garbage")).toBe("never");
    expect(relativeTime(ago(10_000), now)).toBe("just now");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(relativeTime(ago(30 * 3_600_000), now)).toBe("yesterday");
    expect(relativeTime(ago(4 * 86_400_000), now)).toBe("4 days ago");
    expect(relativeTime(ago(30 * 86_400_000), now)).toBe("14 Feb 2024");
  });

  it("reads the clock by default", () => {
    expect(relativeTime(new Date().toISOString())).toBe("just now");
  });
});
