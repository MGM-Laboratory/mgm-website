// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { FORM_FIELD_TYPES, formFieldSchema, type FormDocument, type FormField } from "@repo/shared";
import { describe, expect, it } from "vitest";

import {
  FIELD_FAMILIES,
  FIELD_TYPES,
  FIELD_TYPE_INFO,
  cloneField,
  createField,
  documentIds,
  fieldIdPrefix,
  fieldTypeLabel,
  hasOptions,
  isQuestion,
  mintId,
} from "./builder-fields";

describe("the field catalog", () => {
  it("lists every field type once, in a known family", () => {
    const types = FIELD_TYPES.map((info) => info.type);
    expect(new Set(types).size).toBe(types.length);
    expect([...types].sort()).toEqual([...FORM_FIELD_TYPES].sort());
    const families = new Set(FIELD_FAMILIES.map((family) => family.id));
    for (const info of FIELD_TYPES) expect(families.has(info.family)).toBe(true);
    expect(FIELD_TYPE_INFO.short_text.type).toBe("short_text");
  });

  it("labels a type and falls back to its name", () => {
    expect(fieldTypeLabel("short_text")).toBe(FIELD_TYPE_INFO.short_text.label);
    expect(fieldTypeLabel("not_a_type" as never)).toBe("not_a_type");
  });
});

describe("ids", () => {
  it("mints an id with the prefix that is not taken", () => {
    const taken = new Set<string>();
    const first = mintId("q", taken);
    expect(first).toMatch(/^q_[a-z2-9]{8}$/);
    expect(taken.has(first)).toBe(true);
    const many = new Set(Array.from({ length: 200 }, () => mintId("q", taken)));
    expect(many.size).toBe(200);
  });

  it("never reuses a taken id", () => {
    const taken = new Set<string>();
    // Fill every id the random source could first produce by faking the random bytes
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    let calls = 0;
    globalThis.crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
      calls += 1;
      const bytes = array as unknown as Uint8Array;
      bytes.fill(calls <= 1 ? 0 : 1);
      return array;
    }) as typeof globalThis.crypto.getRandomValues;
    try {
      taken.add("q_aaaaaaaa");
      const id = mintId("q", taken);
      expect(id).toBe("q_bbbbbbbb");
    } finally {
      globalThis.crypto.getRandomValues = original;
    }
  });

  it("picks a prefix by type", () => {
    expect(fieldIdPrefix("page_break")).toBe("page");
    expect(fieldIdPrefix("heading")).toBe("blk");
    expect(fieldIdPrefix("hidden")).toBe("hid");
    expect(fieldIdPrefix("short_text")).toBe("q");
  });

  it("collects every id of a document", () => {
    const document = {
      fields: [
        {
          id: "f1",
          type: "matrix",
          label: "",
          options: [{ id: "o1", label: "" }],
          rowsList: [{ id: "r1", label: "" }],
          columnsList: [{ id: "c1", label: "" }],
          jumps: [{ id: "j1", when: { match: "all", rules: [] }, to: "end" }],
        },
        { id: "f2", type: "short_text", label: "" },
      ],
      endings: [{ id: "e1" }],
    } as unknown as Pick<FormDocument, "fields" | "endings">;
    expect([...documentIds(document)].sort()).toEqual(["c1", "e1", "f1", "f2", "j1", "o1", "r1"]);
  });
});

describe("createField", () => {
  it("builds a valid block for every type with ids that do not collide", () => {
    const taken = new Set<string>();
    const all = FORM_FIELD_TYPES.map((type) => createField(type, taken));
    const ids = documentIds({ fields: all, endings: [] });
    expect(ids.size).toBeGreaterThanOrEqual(all.length);
    for (const field of all) {
      const parsed = formFieldSchema.safeParse(field);
      expect(parsed.success, `${field.type} should parse`).toBe(true);
      expect(field.id.startsWith(`${fieldIdPrefix(field.type)}_`)).toBe(true);
    }
  });

  it("gives choice types three options and matrices rows and columns", () => {
    const taken = new Set<string>();
    expect(createField("dropdown", taken).options).toHaveLength(3);
    expect(createField("ranking", taken).options).toHaveLength(3);
    const picture = createField("picture_choice", taken);
    expect(picture).toMatchObject({ optionLayout: "grid", maxSelections: 1 });
    const matrix = createField("matrix", taken);
    expect(matrix.rowsList).toHaveLength(3);
    expect(matrix.columnsList).toHaveLength(4);
  });

  it("sets the defaults of scales, uploads and special blocks", () => {
    const taken = new Set<string>();
    expect(createField("long_text", taken).rows).toBe(4);
    expect(createField("number", taken).min).toBe(0);
    expect(createField("rating", taken)).toMatchObject({ max: 5, ratingIcon: "star" });
    expect(createField("opinion_scale", taken)).toMatchObject({ min: 1, max: 5 });
    expect(createField("nps", taken)).toMatchObject({ min: 0, max: 10 });
    expect(createField("slider", taken)).toMatchObject({ min: 0, max: 100, step: 1 });
    expect(createField("file_upload", taken)).toMatchObject({ maxFiles: 1, maxFileMb: 10 });
    expect(createField("image_upload", taken).accept).toEqual(["image"]);
    expect(createField("signature", taken).maxFiles).toBe(1);
    expect(createField("phone", taken).defaultCountry).toBe("ID");
    expect(createField("consent", taken).required).toBe(true);
    expect(createField("hidden", taken).prefillParam).toBe("source");
    expect(createField("heading", taken).headingLevel).toBe(2);
    expect(createField("paragraph", taken).content).toBeDefined();
    expect(createField("callout", taken).calloutTone).toBe("info");
    expect(createField("quote", taken).label).toBe("");
    expect(createField("spacer", taken).spacerSize).toBe("md");
    expect(createField("email", taken)).toMatchObject({ required: false, width: "full" });
    expect(createField("divider", taken).label).toBe("");
  });
});

describe("cloneField", () => {
  it("copies a block with fresh ids and leaves the original alone", () => {
    const taken = new Set<string>();
    const source = createField("matrix", taken);
    source.jumps = [
      { id: "jump_old", to: "end", when: { match: "all", rules: [] } },
    ] as FormField["jumps"];
    const copy = cloneField(source, taken);
    expect(copy.id).not.toBe(source.id);
    expect(copy.rowsList?.map((row) => row.label)).toEqual(
      source.rowsList?.map((row) => row.label),
    );
    expect(copy.rowsList?.[0].id).not.toBe(source.rowsList?.[0].id);
    expect(copy.columnsList?.[0].id).not.toBe(source.columnsList?.[0].id);
    expect(copy.jumps?.[0].id).not.toBe("jump_old");
    expect(source.jumps?.[0].id).toBe("jump_old");
    const choice = createField("dropdown", taken);
    expect(cloneField(choice, taken).options?.[0].id).not.toBe(choice.options?.[0].id);
  });

  it("renames the URL parameter of a hidden field", () => {
    const taken = new Set<string>();
    const hidden = createField("hidden", taken);
    expect(cloneField(hidden, taken).prefillParam).toBe("source_copy");
    const bare = { ...hidden, prefillParam: undefined };
    expect(cloneField(bare, taken).prefillParam).toBeUndefined();
    const text = createField("short_text", taken);
    expect(cloneField(text, taken).options).toBeUndefined();
  });
});

describe("isQuestion and hasOptions", () => {
  it("counts answered inputs but not hidden fields or content", () => {
    expect(isQuestion({ type: "short_text" })).toBe(true);
    expect(isQuestion({ type: "hidden" })).toBe(false);
    expect(isQuestion({ type: "heading" })).toBe(false);
    expect(hasOptions({ type: "dropdown" })).toBe(true);
    expect(hasOptions({ type: "short_text" })).toBe(false);
  });
});
