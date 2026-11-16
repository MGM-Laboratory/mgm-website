// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import { FORM_COPY, formCopy, formatBytes, unavailableTitle } from "./public-copy";

type Entries = [string, unknown][];

describe("FORM_COPY", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(FORM_COPY.id).sort()).toEqual(Object.keys(FORM_COPY.en).sort());
    expect(Object.keys(FORM_COPY.id.addressParts).sort()).toEqual(
      Object.keys(FORM_COPY.en.addressParts).sort(),
    );
  });

  it("gives every text a non-empty string, and every function a string for any count", () => {
    for (const [language, copy] of Object.entries(FORM_COPY)) {
      for (const [key, value] of Object.entries(copy) as Entries) {
        if (typeof value === "string") {
          expect(value.length, `${language}.${key}`).toBeGreaterThan(0);
        } else if (typeof value === "function") {
          for (const count of [1, 2]) {
            const text = (value as (...args: unknown[]) => unknown)(count, 5, 3);
            expect(typeof text, `${language}.${key}`).toBe("string");
            expect((text as string).length, `${language}.${key}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("pluralizes the English counts", () => {
    const { en } = FORM_COPY;
    expect(en.minutes(1)).toBe("Takes about 1 minute");
    expect(en.minutes(3)).toBe("Takes about 3 minutes");
    expect(en.questions(1)).toBe("1 question");
    expect(en.questions(2)).toBe("2 questions");
    expect(en.tooManyFiles(1)).toMatch(/^Only 1 file /);
    expect(en.tooManyFiles(3)).toBe("Only 3 files fit here");
    expect(en.pageOf(2, 5)).toBe("Page 2 of 5");
    expect(en.pickBetween(2, 4)).toBe("Choose 2 to 4");
  });

  it("writes the Indonesian sentences", () => {
    const { id } = FORM_COPY;
    expect(id.minutes(3)).toBe("Sekitar 3 menit");
    expect(id.questions(2)).toBe("2 pertanyaan");
    expect(id.pageOf(2, 5)).toBe("Halaman 2 dari 5");
    expect(id.pickBetween(2, 4)).toBe("Pilih 2 sampai 4");
    expect(id.tooManyFiles(2)).toBe("Hanya muat 2 berkas");
  });
});

describe("formCopy", () => {
  it("picks Indonesian only for id", () => {
    expect(formCopy("id")).toBe(FORM_COPY.id);
    expect(formCopy("en")).toBe(FORM_COPY.en);
    expect(formCopy(undefined)).toBe(FORM_COPY.en);
  });
});

describe("unavailableTitle", () => {
  const copy = FORM_COPY.en;

  it("prefers the closed title the admin wrote", () => {
    expect(unavailableTitle("closed", copy, "Back soon")).toBe("Back soon");
    expect(unavailableTitle("not_open_yet", copy, "Back soon")).toBe("Back soon");
  });

  it("falls back by reason", () => {
    expect(unavailableTitle("not_open_yet", copy)).toBe(copy.notOpenTitle);
    expect(unavailableTitle("limit_reached", copy)).toBe(copy.fullTitle);
    expect(unavailableTitle("closed", copy, undefined, "Closed label")).toBe("Closed label");
    expect(unavailableTitle("closed", copy)).toBe(copy.closedBody);
    expect(unavailableTitle("closed", copy, "", "Label")).toBe("Label");
  });
});

describe("formatBytes", () => {
  it("formats kilobytes and megabytes", () => {
    expect(formatBytes(0)).toBe("1 KB");
    expect(formatBytes(1)).toBe("1 KB");
    expect(formatBytes(800 * 1024)).toBe("800 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024 KB");
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(formatBytes(10.4 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });
});
