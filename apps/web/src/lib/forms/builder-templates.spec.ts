// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import type { FormDocument, FormDocumentInput } from "@repo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { blankDocument } from "./builder-document";
import {
  documentStats,
  exportJson,
  parseImportedJson,
  parseTemplateDocument,
  readSavedTemplates,
  removeSavedTemplate,
  saveTemplate,
} from "./builder-templates";

const KEY = "mgm-forms-my-templates";

let store: Map<string, string>;
let failWrites = false;

beforeEach(() => {
  store = new Map();
  failWrites = false;
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("quota");
        store.set(key, value);
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const withFields = (fields: unknown[]): FormDocument =>
  ({ ...blankDocument("Survey"), fields }) as FormDocument;
const field = (id: string, type: string) => ({
  id,
  type,
  label: id,
  required: false,
  width: "full",
});

describe("parseTemplateDocument", () => {
  it("parses a template with the shared schema and caches the result", () => {
    const input = {
      title: "T",
      fields: [{ id: "a", type: "short_text", label: "A" }],
    } as FormDocumentInput;
    const parsed = parseTemplateDocument(input);
    expect(parsed?.title).toBe("T");
    expect(parsed?.endings.length).toBeGreaterThan(0);
    expect(parseTemplateDocument(input)).toBe(parsed);
    // The input is cloned, so a later change does not leak in
    (input as { title: string }).title = "Changed";
    expect(parseTemplateDocument(input)?.title).toBe("T");
  });

  it("returns null for a template that does not parse, also cached", () => {
    const broken = { title: "" } as FormDocumentInput;
    expect(parseTemplateDocument(broken)).toBeNull();
    expect(parseTemplateDocument(broken)).toBeNull();
  });
});

describe("documentStats", () => {
  it("counts questions, pages and minutes", () => {
    const stats = documentStats(
      withFields([
        field("a", "short_text"),
        field("h", "hidden"),
        field("t", "heading"),
        field("p", "page_break"),
        field("b", "long_text"),
      ]),
    );
    expect(stats.questions).toBe(2);
    expect(stats.pages).toBe(2);
    expect(stats.minutes).toBeGreaterThanOrEqual(1);
    expect(documentStats(withFields([]))).toMatchObject({ questions: 0, pages: 1 });
  });
});

describe("saved templates", () => {
  it("starts empty", () => {
    expect(readSavedTemplates()).toEqual([]);
  });

  it("saves a template with a clone of the document, newest first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-05T10:30:00Z"));
    const document = blankDocument("Survey");
    const first = saveTemplate("  Mine  ", "  A note ", document);
    expect(first).toMatchObject({
      name: "Mine",
      description: "A note",
      savedAt: "2024-03-05T10:30:00.000Z",
    });
    expect(first.id).toMatch(/^mine_[0-9a-z]+$/);
    expect(first.document).toEqual(document);
    expect(first.document).not.toBe(document);
    vi.setSystemTime(new Date("2024-03-06T10:30:00Z"));
    const second = saveTemplate("", "", document);
    expect(second.name).toBe("Survey");
    expect(readSavedTemplates().map((item) => item.id)).toEqual([second.id, first.id]);
  });

  it("keeps at most 40 templates", () => {
    const document = blankDocument("Survey");
    vi.useFakeTimers();
    for (let index = 0; index < 45; index += 1) {
      vi.setSystemTime(new Date(2024, 2, 5, 10, 30, index));
      saveTemplate(`T${index}`, "", document);
    }
    const saved = readSavedTemplates();
    expect(saved).toHaveLength(40);
    expect(saved[0].name).toBe("T44");
  });

  it("throws when storage refuses the write", () => {
    failWrites = true;
    expect(() => saveTemplate("x", "", blankDocument())).toThrow("quota");
  });

  it("removes a template and survives a storage that refuses", () => {
    const document = blankDocument("Survey");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-05T10:30:00Z"));
    const keep = saveTemplate("Keep", "", document);
    vi.setSystemTime(new Date("2024-03-05T10:30:01Z"));
    const drop = saveTemplate("Drop", "", document);
    removeSavedTemplate(drop.id);
    expect(readSavedTemplates().map((item) => item.id)).toEqual([keep.id]);
    failWrites = true;
    expect(() => removeSavedTemplate(keep.id)).not.toThrow();
  });

  it("drops entries of the wrong shape and ignores broken storage", () => {
    store.set(
      KEY,
      JSON.stringify([
        { id: "ok", name: "Fine", document: {} },
        { id: 5, name: "bad id", document: {} },
        { id: "x", name: 5, document: {} },
        { id: "y", name: "no document" },
        null,
        "text",
      ]),
    );
    expect(readSavedTemplates().map((item) => item.id)).toEqual(["ok"]);
    store.set(KEY, "{broken");
    expect(readSavedTemplates()).toEqual([]);
    store.set(KEY, '{"not":"a list"}');
    expect(readSavedTemplates()).toEqual([]);
  });

  it("reads an empty list when there is no window", () => {
    vi.unstubAllGlobals();
    expect(readSavedTemplates()).toEqual([]);
  });
});

describe("parseImportedJson", () => {
  it("accepts a bare document and an exported wrapper", () => {
    const document = blankDocument("Survey");
    const bare = parseImportedJson(JSON.stringify(document));
    expect(bare).toMatchObject({ ok: true });
    const wrapped = parseImportedJson(exportJson(document));
    expect(wrapped.ok && wrapped.document.title).toBe("Survey");
  });

  it("reports invalid JSON", () => {
    const result = parseImportedJson("{nope");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatch(/^That isn't valid JSON: /);
  });

  it("lists up to twelve schema problems with their paths", () => {
    const result = parseImportedJson(
      JSON.stringify({
        title: "",
        fields: Array.from({ length: 20 }, (_, index) => ({ id: `f${index}`, type: "nope" })),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(12);
    expect(result.errors[0]).toMatch(/^[a-z.0-9]+: /);
    const primitive = parseImportedJson("5");
    expect(!primitive.ok && primitive.errors[0]).toMatch(/^document: /);
    const nullValue = parseImportedJson("null");
    expect(nullValue.ok).toBe(false);
  });
});

describe("exportJson", () => {
  it("wraps the document with a kind and a version", () => {
    const document = blankDocument("Survey");
    const parsed = JSON.parse(exportJson(document)) as {
      kind: string;
      version: number;
      document: FormDocument;
    };
    expect(parsed).toMatchObject({ kind: "mgm-form", version: 1 });
    expect(parsed.document.title).toBe("Survey");
    expect(exportJson(document)).toContain("\n  ");
  });
});
