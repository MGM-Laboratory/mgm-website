import type { FormAnswerValue, FormField, PublicFormDocument } from "@repo/shared";
import { describe, expect, it } from "vitest";

import {
  conversationalSteps,
  forcedEnding,
  formProgress,
  initialAnswers,
  isDone,
  isFieldShown,
  pageFields,
  questionNumbers,
  routePages,
  sanitizeDraft,
} from "./public-runtime";

const field = (id: string, type: string, extra: Record<string, unknown> = {}) =>
  ({ id, type, label: id, required: false, width: "full", ...extra }) as FormField;

const options = (...ids: string[]) => ids.map((id) => ({ id, label: id.toUpperCase() }));

function documentOf(
  fields: FormField[],
): Pick<PublicFormDocument, "fields" | "endings" | "settings"> {
  return {
    fields,
    endings: [
      { id: "end1", title: "Done" },
      { id: "end2", title: "Other" },
    ],
    settings: {},
  } as unknown as Pick<PublicFormDocument, "fields" | "endings" | "settings">;
}

const params = (query: string) => new URLSearchParams(query);

describe("initialAnswers", () => {
  const document = documentOf([
    field("n", "number", { prefillParam: "age" }),
    field("rate", "rating", { prefillParam: "rate" }),
    field("yn", "yes_no", { prefillParam: "yn" }),
    field("agree", "consent", { prefillParam: "agree" }),
    field("plan", "multiple_choice", { prefillParam: "plan", options: options("a", "b") }),
    field("tools", "checkboxes", { prefillParam: "tools", options: options("x", "y") }),
    field("pic1", "picture_choice", { prefillParam: "pic1", options: options("p", "q") }),
    field("pics", "picture_choice", {
      prefillParam: "pics",
      options: options("p", "q"),
      maxSelections: 2,
    }),
    field("country", "country", { prefillParam: "country" }),
    field("color", "color", { prefillParam: "color" }),
    field("who", "name", { prefillParam: "who" }),
    field("grid", "matrix", { prefillParam: "grid" }),
    field("note", "short_text", { prefillParam: "note" }),
    field("src", "hidden"),
    field("ref", "hidden", { prefillParam: "r" }),
    field("head", "heading", { prefillParam: "head" }),
  ]);

  it("returns nothing without defaults or parameters", () => {
    expect(initialAnswers(document)).toEqual({});
    expect(initialAnswers(document, null)).toEqual({});
    expect(initialAnswers(document, params(""))).toEqual({});
  });

  it("coerces each type from a URL parameter", () => {
    const answers = initialAnswers(
      document,
      params(
        "age=36&rate=4&yn=ya&agree=true&plan=B&tools=X,%20Y,%20zzz&pic1=Q&pics=p,q,nope&country=id&color=ABCDEF&who=Ada&grid=1&note=hello&src=%20utm%20&r=ref-value&head=ignored",
      ),
    );
    expect(answers).toEqual({
      n: 36,
      rate: 4,
      yn: true,
      agree: true,
      plan: "b",
      tools: ["x", "y"],
      pic1: "q",
      pics: ["p", "q"],
      country: "ID",
      color: "#abcdef",
      who: { first: "Ada" },
      note: "hello",
      src: "utm",
      ref: "ref-value",
    });
  });

  it("falls back to the field id for a hidden field without a parameter name", () => {
    expect(initialAnswers(documentOf([field("src", "hidden")]), params("src=a"))).toEqual({
      src: "a",
    });
  });

  it("drops values that do not fit the type", () => {
    const answers = initialAnswers(
      document,
      params(
        "age=abc&rate=&yn=maybe&agree=no&plan=zzz&tools=zzz&pic1=zzz&country=Indonesia&color=red&who=&note=%20&src=%20",
      ),
    );
    expect(answers).toEqual({});
  });

  it("reads no and false for yes or no but never for consent", () => {
    expect(initialAnswers(document, params("yn=no")).yn).toBe(false);
    expect(initialAnswers(document, params("yn=0")).yn).toBe(false);
    expect(initialAnswers(document, params("agree=no")).agree).toBeUndefined();
  });

  it("limits long text to 2000 characters and a name to 200", () => {
    const answers = initialAnswers(
      document,
      params(`note=${"x".repeat(3000)}&who=${"y".repeat(500)}&src=${"z".repeat(3000)}`),
    );
    expect(String(answers.note)).toHaveLength(2000);
    expect((answers.who as { first: string }).first).toHaveLength(200);
    expect(String(answers.src)).toHaveLength(2000);
  });

  it("applies defaults, coercing text defaults and keeping typed ones", () => {
    const withDefaults = documentOf([
      field("n", "number", { defaultValue: "7" }),
      field("t", "short_text", { defaultValue: "hi" }),
      field("c", "checkboxes", { defaultValue: "a, b", options: options("a", "b") }),
      field("b", "yes_no", { defaultValue: true }),
      field("num", "number", { defaultValue: 3 }),
      field("bad", "number", { defaultValue: "abc" }),
      field("blk", "heading", { defaultValue: "x" }),
    ]);
    expect(initialAnswers(withDefaults)).toEqual({ n: 7, t: "hi", c: ["a", "b"], b: true, num: 3 });
    // A URL parameter overrides the default
    expect(initialAnswers(withDefaults, params("t=url"))).toMatchObject({ t: "hi" });
    const prefill = documentOf([
      field("t", "short_text", { defaultValue: "hi", prefillParam: "t" }),
    ]);
    expect(initialAnswers(prefill, params("t=url")).t).toBe("url");
    expect(initialAnswers(prefill, params("other=1")).t).toBe("hi");
  });
});

describe("sanitizeDraft", () => {
  const document = documentOf([
    field("t", "short_text"),
    field("who", "name"),
    field("where", "address"),
    field("plan", "multiple_choice", { options: options("a"), allowOther: true }),
    field("h", "hidden"),
    field("head", "heading"),
  ]);

  it("keeps answers of known questions and other texts", () => {
    expect(sanitizeDraft(document, { t: "x", plan: "a", "plan:other": "custom" })).toEqual({
      t: "x",
      plan: "a",
      "plan:other": "custom",
    });
  });

  it("drops unknown, hidden and content fields", () => {
    expect(sanitizeDraft(document, { ghost: "x", h: "x", head: "x", "ghost:other": "x" })).toEqual(
      {},
    );
  });

  it("drops an other text that is not text", () => {
    expect(sanitizeDraft(document, { "plan:other": 5 as unknown as string })).toEqual({});
  });

  it("keeps only the string parts of a name or an address", () => {
    expect(
      sanitizeDraft(document, {
        who: { first: "Ada", last: 5, extra: "x" } as unknown as FormAnswerValue,
        where: {
          line1: "Street",
          city: "Malang",
          postal: ["x"],
          hacked: "y",
        } as unknown as FormAnswerValue,
      }),
    ).toEqual({ who: { first: "Ada" }, where: { line1: "Street", city: "Malang" } });
  });

  it("drops a name that is not an object", () => {
    expect(sanitizeDraft(document, { who: "Ada", where: ["x"] } as unknown as FormAnswers)).toEqual(
      {},
    );
    expect(sanitizeDraft(document, { who: null } as unknown as FormAnswers)).toEqual({});
  });
});

type FormAnswers = Parameters<typeof sanitizeDraft>[1];

describe("routes and pages", () => {
  const document = documentOf([
    field("a", "short_text"),
    field("p1", "page_break", {
      pageTitle: "Second",
      jumps: [
        {
          id: "j1",
          when: { match: "all", rules: [{ subject: "a", operator: "equals", value: "skip" }] },
          to: "p3",
        },
        {
          id: "j2",
          when: { match: "all", rules: [{ subject: "a", operator: "equals", value: "stop" }] },
          to: "ending:end2",
        },
      ],
    }),
    field("b", "short_text"),
    field("p2", "page_break"),
    field("c", "short_text"),
    field("p3", "page_break", { pageTitle: "Third" }),
    field("d", "short_text"),
  ]);

  it("follows the pages in order by default", () => {
    expect(routePages(document, {}).map((page) => page.id)).toEqual(["start", "p1", "p2", "p3"]);
    expect(forcedEnding(document, {})).toBeUndefined();
  });

  it("skips pages on a jump and forces an ending", () => {
    expect(routePages(document, { a: "skip" }).map((page) => page.id)).toEqual(["start", "p3"]);
    expect(routePages(document, { a: "stop" }).map((page) => page.id)).toEqual(["start"]);
    expect(forcedEnding(document, { a: "stop" })).toBe("end2");
  });
});

describe("progress", () => {
  const document = documentOf([
    field("name", "short_text", { required: true }),
    field("age", "number", { min: 18 }),
    field("show", "short_text", {
      visibleIf: { match: "all", rules: [{ subject: "name", operator: "equals", value: "Ada" }] },
    }),
    field("head", "heading"),
  ]);

  it("counts only valid answers among the visible questions", () => {
    const empty = formProgress(document, {});
    expect(empty).toMatchObject({ done: 0, total: 2, fraction: 0 });
    expect(empty.questions.map((item) => item.id)).toEqual(["name", "age"]);
    const partial = formProgress(document, { name: "Bob", age: 5 });
    expect(partial).toMatchObject({ done: 1, total: 2, fraction: 0.5 });
    const shown = formProgress(document, { name: "Ada", age: 20 });
    expect(shown).toMatchObject({ done: 2, total: 3 });
  });

  it("is zero for a form without questions", () => {
    expect(formProgress(documentOf([field("head", "heading")]), {})).toMatchObject({
      done: 0,
      total: 0,
      fraction: 0,
    });
  });

  it("checks one question", () => {
    const age = document.fields[1];
    expect(isDone(age, { age: 20 })).toBe(true);
    expect(isDone(age, { age: 5 })).toBe(false);
    expect(isDone(age, {})).toBe(false);
  });

  it("numbers the visible questions", () => {
    expect([...questionNumbers(document, {})]).toEqual([
      ["name", 1],
      ["age", 2],
    ]);
    expect([...questionNumbers(document, { name: "Ada" })]).toEqual([
      ["name", 1],
      ["age", 2],
      ["show", 3],
    ]);
  });
});

describe("visibility and steps", () => {
  const document = documentOf([
    field("head", "heading"),
    field("q1", "short_text"),
    field("hid", "hidden"),
    field("gap", "spacer"),
    field("line", "divider"),
    field("note", "callout"),
    field("p1", "page_break", { pageTitle: "Part two" }),
    field("q2", "short_text", {
      visibleIf: { match: "all", rules: [{ subject: "q1", operator: "equals", value: "yes" }] },
    }),
    field("q3", "short_text"),
  ]);

  it("tests one field against the answers", () => {
    const q2 = document.fields.find((item) => item.id === "q2") as FormField;
    expect(isFieldShown(document, q2, {})).toBe(false);
    expect(isFieldShown(document, q2, { q1: "yes" })).toBe(true);
    expect(isFieldShown(document, document.fields[2], {})).toBe(false);
  });

  it("makes one screen per question and per statement, with a page opener", () => {
    const steps = conversationalSteps(document, {});
    expect(steps.map((step) => `${step.kind}:${step.id}`)).toEqual([
      "statement:head",
      "question:q1",
      "statement:note",
      "statement:page:p1",
      "question:q3",
    ]);
    const withQ2 = conversationalSteps(document, { q1: "yes" });
    expect(withQ2.map((step) => step.id)).toContain("q2");
  });

  it("lists the fields a classic page shows", () => {
    const [first, second] = routePages(document, {});
    expect(pageFields(document, first, {}).map((item) => item.id)).toEqual([
      "head",
      "q1",
      "gap",
      "line",
      "note",
    ]);
    expect(pageFields(document, second, {}).map((item) => item.id)).toEqual(["q3"]);
    expect(pageFields(document, second, { q1: "yes" }).map((item) => item.id)).toEqual([
      "q2",
      "q3",
    ]);
  });

  it("opens a page with a description screen", () => {
    const described = documentOf([
      field("q1", "short_text"),
      field("p1", "page_break", { pageDescription: { type: "doc", content: [] } }),
      field("q2", "short_text"),
    ]);
    expect(conversationalSteps(described, {}).map((step) => step.id)).toEqual([
      "q1",
      "page:p1",
      "q2",
    ]);
    const plain = documentOf([
      field("q1", "short_text"),
      field("p1", "page_break"),
      field("q2", "short_text"),
    ]);
    expect(conversationalSteps(plain, {}).map((step) => step.id)).toEqual(["q1", "q2"]);
  });
});
