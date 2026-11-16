// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { PROJECT_THEME_IDS } from "@repo/shared";
import { describe, expect, it } from "vitest";

import { hashSlug, isThemeId, themeIdFor } from "./theme-pick";

describe("hashSlug", () => {
  it("is the 32 bit FNV-1a of the slug", () => {
    expect(hashSlug("")).toBe(2166136261);
    expect(hashSlug("a")).toBe(0xe40c292c);
    expect(hashSlug("foobar")).toBe(0xbf9cf968);
  });
});

describe("isThemeId", () => {
  it("accepts every known theme and nothing else", () => {
    for (const id of PROJECT_THEME_IDS) expect(isThemeId(id)).toBe(true);
    expect(isThemeId("nope")).toBe(false);
    expect(isThemeId(3)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });
});

describe("themeIdFor", () => {
  it("keeps a known picked theme", () => {
    const picked = PROJECT_THEME_IDS[PROJECT_THEME_IDS.length - 1];
    expect(themeIdFor({ slug: "anything", theme: picked })).toBe(picked);
  });

  it("picks from the slug hash when the theme is missing or unknown", () => {
    const expected = PROJECT_THEME_IDS[hashSlug("my-slug") % PROJECT_THEME_IDS.length];
    expect(themeIdFor({ slug: "my-slug" })).toBe(expected);
    expect(themeIdFor({ slug: "my-slug", theme: "retired" })).toBe(expected);
  });
});
