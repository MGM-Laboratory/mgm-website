import { describe, expect, it } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import { cleanAdminAnswers } from "./forms-responses.service.js";
import { applySchema, bulkSchema, responsePatchSchema } from "./forms.schemas.js";

const document = formDocumentSchema.parse({
  title: "Edits",
  fields: [
    { id: "name", type: "short_text", required: true },
    {
      id: "pick",
      type: "multiple_choice",
      allowOther: true,
      options: [{ id: "a", label: "A" }],
    },
    { id: "n", type: "number", min: 0, max: 10 },
    { id: "doc", type: "file_upload", maxFiles: 3 },
    { id: "src", type: "hidden" },
  ],
});

const file = {
  key: "formfile-f1-00000000-0000-0000-0000-000000000001.pdf",
  name: "a.pdf",
  size: 3,
  type: "application/pdf",
};

describe("admin answer edits", () => {
  it("merges edits, trims text, clears blanks and ignores required", () => {
    const { answers, errors } = cleanAdminAnswers(
      document,
      { name: "", pick: "__other__", "pick:other": "  Mango ", n: 4 },
      { name: "Ana", pick: "a", doc: [file] },
      "merge",
    );
    expect(errors).toEqual({});
    expect(answers).toEqual({ pick: "__other__", "pick:other": "Mango", n: 4, doc: [file] });
  });

  it("reports invalid values per field", () => {
    const { errors } = cleanAdminAnswers(document, { pick: "zzz", n: 99, src: 3 }, {}, "merge");
    expect(errors.pick?.code).toBe("unknownOption");
    expect(errors.n?.code).toBe("max");
    expect(errors.src?.code).toBe("invalid");
  });

  it("replaces answers wholesale and drops unknown keys", () => {
    const { answers } = cleanAdminAnswers(
      document,
      { name: "Bo", mystery: "x" },
      { name: "Ana", n: 1 },
      "replace",
    );
    expect(answers).toEqual({ name: "Bo" });
  });

  it("lets file answers only keep or drop the response's own files, with stored metadata", () => {
    const kept = cleanAdminAnswers(
      document,
      { doc: [{ ...file, name: "renamed.exe" }] },
      { doc: [file] },
      "merge",
    );
    expect(kept.answers.doc).toEqual([file]);
    const foreign = cleanAdminAnswers(
      document,
      { doc: [{ ...file, key: file.key.replace("01.pdf", "02.pdf") }] },
      { doc: [file] },
      "merge",
    );
    expect(foreign.errors.doc?.code).toBe("files");
  });
});

describe("bulk, apply and patch bodies", () => {
  it("requires ids, a known action and a tag name for tag actions", () => {
    expect(bulkSchema.safeParse({ ids: ["a"], action: "star" }).success).toBe(true);
    expect(bulkSchema.safeParse({ ids: [], action: "star" }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: ["a"], action: "nuke" }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: ["a"], action: "tag" }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: ["a"], action: "untag", tag: " " }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: ["a"], action: "tag", tag: "vip" }).success).toBe(true);
  });

  it("caps apply at 2000 distinct responses", () => {
    const updates = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: `r${i}`, answers: {} }));
    expect(applySchema.safeParse({ updates: updates(2000) }).success).toBe(true);
    expect(applySchema.safeParse({ updates: updates(2001) }).success).toBe(false);
    expect(applySchema.safeParse({ updates: [] }).success).toBe(false);
    expect(applySchema.safeParse({ updates: [...updates(1), ...updates(1)] }).success).toBe(false);
  });

  it("refuses unknown patch keys", () => {
    expect(responsePatchSchema.safeParse({ starred: true, note: null }).success).toBe(true);
    expect(responsePatchSchema.safeParse({ formId: "x" }).success).toBe(false);
  });
});
