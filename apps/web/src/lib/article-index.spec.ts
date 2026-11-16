// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import type { CmsArticleRecord } from "@/lib/article-cms";
import type { Member } from "@/data/members";

import {
  ARTICLE_QUERY_MAX,
  articleCategories,
  articleIndexHref,
  categorySlug,
  hasCategory,
  nextArticleSlug,
  readArticleIndexQuery,
  toArticleCard,
} from "./article-index";

function record(slug: string, categories: string[] = [], extra: Record<string, unknown> = {}) {
  return {
    slug,
    content: [],
    article: {
      slug,
      title: `Title ${slug}`,
      subtitle: "Sub",
      date: "2025-01-01",
      categories,
      authorSlugs: [],
      draft: false,
      ...extra,
    },
  } as CmsArticleRecord;
}

describe("categorySlug", () => {
  it("slugifies a category name", () => {
    expect(categorySlug("Game & XR")).toBe("game-xr");
  });
});

describe("articleCategories", () => {
  it("counts each article once per category, most used first, ties by name", () => {
    const result = articleCategories([
      record("a", ["Web", "web", "Design"]),
      record("b", ["WEB", "Zeta"]),
      record("c", ["Alpha", " ", "!!!"]),
    ]);

    expect(result).toEqual([
      { slug: "web", name: "Web", count: 2 },
      { slug: "alpha", name: "Alpha", count: 1 },
      { slug: "design", name: "Design", count: 1 },
      { slug: "zeta", name: "Zeta", count: 1 },
    ]);
  });

  it("returns nothing for no articles", () => {
    expect(articleCategories([])).toEqual([]);
  });
});

describe("hasCategory", () => {
  it("matches by slug", () => {
    expect(hasCategory(record("a", ["Game & XR"]), "game-xr")).toBe(true);
    expect(hasCategory(record("a", ["Web"]), "game-xr")).toBe(false);
  });
});

describe("toArticleCard", () => {
  it("maps the record to a card with authors, cover and theme", () => {
    const members = [{ slug: "ada", name: "Ada" }] as unknown as Member[];
    const card = toArticleCard(
      record("a", ["Web"], { authorSlugs: ["ada", "ghost"], coverKey: "static/c.png" }),
      members,
    );

    expect(card).toMatchObject({
      slug: "a",
      title: "Title a",
      subtitle: "Sub",
      date: "2025-01-01",
      categories: ["Web"],
      coverUrl: "/c.png",
      authors: [{ slug: "ada", name: "Ada" }],
    });
    expect(card.themeId).toBeTruthy();
  });

  it("defaults a missing subtitle and has no cover url without a key", () => {
    const card = toArticleCard(record("a", [], { subtitle: undefined }), []);

    expect(card.subtitle).toBe("");
    expect(card.coverUrl).toBeUndefined();
  });
});

describe("readArticleIndexQuery", () => {
  it("normalizes the category and trims the search", () => {
    expect(readArticleIndexQuery({ category: " Game-XR ", q: "  hello  " })).toEqual({
      category: "game-xr",
      q: "hello",
    });
  });

  it("takes the first value of a repeated parameter", () => {
    expect(readArticleIndexQuery({ category: ["web", "x"], q: ["one", "two"] })).toEqual({
      category: "web",
      q: "one",
    });
  });

  it("drops an invalid category and blank values", () => {
    expect(readArticleIndexQuery({ category: "not valid!", q: "   " })).toEqual({
      category: undefined,
      q: undefined,
    });
    expect(readArticleIndexQuery({ category: "-x", q: null })).toEqual({
      category: undefined,
      q: undefined,
    });
    expect(readArticleIndexQuery({})).toEqual({ category: undefined, q: undefined });
  });

  it("cuts a long search", () => {
    const result = readArticleIndexQuery({ q: "a".repeat(ARTICLE_QUERY_MAX + 50) });

    expect(result.q).toHaveLength(ARTICLE_QUERY_MAX);
  });
});

describe("articleIndexHref", () => {
  it("builds the url from the query", () => {
    expect(articleIndexHref({})).toBe("/articles");
    expect(articleIndexHref({ category: "web" })).toBe("/articles?category=web");
    expect(articleIndexHref({ category: "web", q: "a b&c" })).toBe(
      "/articles?category=web&q=a+b%26c",
    );
    expect(articleIndexHref({ q: "x" })).toBe("/articles?q=x");
  });
});

describe("nextArticleSlug", () => {
  const records = [record("a"), record("b"), record("c")];

  it("returns the next slug and wraps around", () => {
    expect(nextArticleSlug(records, "a")).toBe("b");
    expect(nextArticleSlug(records, "c")).toBe("a");
  });

  it("starts at the top for an unknown slug", () => {
    expect(nextArticleSlug(records, "zz")).toBe("a");
  });

  it("has no next article when there are fewer than two", () => {
    expect(nextArticleSlug([record("a")], "a")).toBeUndefined();
    expect(nextArticleSlug([], "a")).toBeUndefined();
  });
});
