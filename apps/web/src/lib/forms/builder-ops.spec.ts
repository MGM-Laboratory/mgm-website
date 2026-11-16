// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import type { FormDocument, FormField } from "@repo/shared";
import { describe, expect, it } from "vitest";

import {
  addEnding,
  duplicateFields,
  insertFields,
  insertFieldsAt,
  moveEnding,
  moveField,
  patchEnding,
  patchField,
  referencesTo,
  removeEnding,
  removeFields,
  reorderFields,
} from "./builder-ops";

const field = (id: string, extra: Partial<FormField> = {}) =>
  ({ id, type: "short_text", label: id, ...extra }) as FormField;

function documentOf(fields: FormField[], endings = ["e1", "e2"]): FormDocument {
  return {
    title: "T",
    fields,
    endings: endings.map((id) => ({ id, title: id })),
  } as unknown as FormDocument;
}

const ids = (document: FormDocument) => document.fields.map((item) => item.id);

describe("patchField", () => {
  const document = documentOf([field("a"), field("b")]);

  it("merges an object or applies a function and keeps other fields as they are", () => {
    const merged = patchField(document, "a", { label: "A!" });
    expect(merged.fields[0].label).toBe("A!");
    expect(merged.fields[1]).toBe(document.fields[1]);
    const mapped = patchField(document, "b", (item) => ({ ...item, required: true }));
    expect(mapped.fields[1].required).toBe(true);
    expect(document.fields[0].label).toBe("a");
  });

  it("returns the same document for an unknown id", () => {
    expect(patchField(document, "zzz", { label: "x" })).toBe(document);
  });
});

describe("inserting and removing", () => {
  const document = documentOf([field("a"), field("b"), field("c")]);

  it("inserts after a block, or at the end when missing or null", () => {
    expect(ids(insertFields(document, [field("x")], "a"))).toEqual(["a", "x", "b", "c"]);
    expect(ids(insertFields(document, [field("x")], "c"))).toEqual(["a", "b", "c", "x"]);
    expect(ids(insertFields(document, [field("x")], null))).toEqual(["a", "b", "c", "x"]);
    expect(ids(insertFields(document, [field("x")], "nope"))).toEqual(["a", "b", "c", "x"]);
  });

  it("inserts at a clamped position", () => {
    expect(ids(insertFieldsAt(document, [field("x")], 1))).toEqual(["a", "x", "b", "c"]);
    expect(ids(insertFieldsAt(document, [field("x")], -5))).toEqual(["x", "a", "b", "c"]);
    expect(ids(insertFieldsAt(document, [field("x")], 99))).toEqual(["a", "b", "c", "x"]);
  });

  it("removes the listed ids", () => {
    expect(ids(removeFields(document, ["a", "c", "nope"]))).toEqual(["b"]);
    expect(ids(removeFields(document, new Set(["b"])))).toEqual(["a", "c"]);
  });
});

describe("moving and reordering", () => {
  const document = documentOf([field("a"), field("b"), field("c")]);

  it("moves one block up or down and stops at the edges", () => {
    expect(ids(moveField(document, "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(moveField(document, "b", 1))).toEqual(["a", "c", "b"]);
    expect(moveField(document, "a", -1)).toBe(document);
    expect(moveField(document, "c", 1)).toBe(document);
    expect(moveField(document, "zzz", 1)).toBe(document);
  });

  it("applies an order, skipping unknown ids and keeping unlisted ones at the end", () => {
    expect(ids(reorderFields(document, ["c", "ghost", "a"]))).toEqual(["c", "a", "b"]);
    expect(reorderFields(document, ["a", "b", "c"])).toBe(document);
  });
});

describe("duplicateFields", () => {
  it("copies the chosen blocks after the last one with new ids", () => {
    const document = documentOf([field("a"), field("b"), field("c")]);
    const result = duplicateFields(document, ["a", "b"]);
    expect(result.newIds).toHaveLength(2);
    expect(ids(result.document)).toEqual(["a", "b", ...result.newIds, "c"]);
    expect(result.document.fields[2].label).toBe("a");
  });

  it("does nothing when no id matches", () => {
    const document = documentOf([field("a")]);
    const result = duplicateFields(document, ["x"]);
    expect(result.document).toBe(document);
    expect(result.newIds).toEqual([]);
  });
});

describe("endings", () => {
  const document = documentOf([field("a")], ["e1", "e2", "e3"]);

  it("patches one ending", () => {
    const next = patchEnding(document, "e2", { title: "Done" });
    expect(next.endings.map((ending) => ending.title)).toEqual(["e1", "Done", "e3"]);
    expect(next.endings[0]).toBe(document.endings[0]);
  });

  it("adds an ending with a fresh id and an empty rule group", () => {
    const { document: next, id } = addEnding(document);
    expect(next.endings).toHaveLength(4);
    expect(id).toMatch(/^ending_/);
    expect(next.endings[3]).toMatchObject({
      id,
      title: "Thank you",
      when: { match: "all", rules: [] },
    });
  });

  it("removes an ending but keeps at least one", () => {
    expect(removeEnding(document, "e2").endings.map((ending) => ending.id)).toEqual(["e1", "e3"]);
    const single = documentOf([], ["only"]);
    expect(removeEnding(single, "only")).toBe(single);
  });

  it("moves an ending and stops at the edges", () => {
    expect(moveEnding(document, "e2", -1).endings.map((ending) => ending.id)).toEqual([
      "e2",
      "e1",
      "e3",
    ]);
    expect(moveEnding(document, "e2", 1).endings.map((ending) => ending.id)).toEqual([
      "e1",
      "e3",
      "e2",
    ]);
    expect(moveEnding(document, "e1", -1)).toBe(document);
    expect(moveEnding(document, "e3", 1)).toBe(document);
    expect(moveEnding(document, "zzz", 1)).toBe(document);
  });
});

describe("referencesTo", () => {
  it("finds rules, jumps, pipes and ending rules that name a field", () => {
    const rule = (subject: string) => ({ subject, operator: "equals" as const, value: "x" });
    const document = {
      title: "T",
      fields: [
        field("target"),
        field("viaRule", {
          visibleIf: { match: "all", rules: [rule("target")] },
        } as Partial<FormField>),
        field("viaJump", {
          type: "page_break",
          jumps: [{ id: "j", to: "target", when: { match: "all", rules: [] } }],
        } as Partial<FormField>),
        field("viaJumpRule", {
          type: "page_break",
          jumps: [{ id: "j", to: "end", when: { match: "all", rules: [rule("target")] } }],
        } as Partial<FormField>),
        field("viaPipe", { label: "Hi {{target}}" }),
        field("unrelated", {
          visibleIf: { match: "all", rules: [rule("other")] },
        } as Partial<FormField>),
      ],
      endings: [
        { id: "e1", when: { match: "all", rules: [rule("target")] } },
        { id: "e2", when: { match: "all", rules: [] } },
        { id: "e3" },
      ],
    } as unknown as FormDocument;
    expect(referencesTo(document, "target")).toEqual([
      "viaRule",
      "viaJump",
      "viaJumpRule",
      "viaPipe",
      "ending:e1",
    ]);
    expect(referencesTo(document, "nobody")).toEqual([]);
  });
});
