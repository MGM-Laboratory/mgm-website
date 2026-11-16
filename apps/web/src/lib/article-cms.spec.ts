// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { PROJECT_THEME_IDS } from "@repo/shared";
import { describe, expect, it } from "vitest";

import type { Member } from "@/data/members";

import {
  articleAuthors,
  articleCoverUrl,
  articleThemeId,
  articleToDraft,
  draftToArticle,
  emptyArticleDraft,
  formatArticleDate,
  isArticleSlug,
  publishedArticles,
  slugify,
  type ArticleDraft,
  type CmsArticleRecord,
} from "./article-cms";

function article(extra: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    slug: "a",
    title: "T",
    subtitle: "S",
    date: "2024-08-31",
    categories: [],
    authorSlugs: [],
    draft: false,
    ...extra,
  };
}

describe("slugs", () => {
  it("slugifies text", () => {
    expect(slugify("  Don't Panic: It's 42!  ")).toBe("dont-panic-its-42");
    expect(slugify("a".repeat(100))).toHaveLength(80);
  });

  it("checks the slug pattern", () => {
    expect(isArticleSlug("ok-1")).toBe(true);
    expect(isArticleSlug("Not Ok")).toBe(false);
    expect(isArticleSlug("trailing-")).toBe(false);
  });
});

describe("draft conversion", () => {
  it("starts empty as a draft", () => {
    expect(emptyArticleDraft()).toMatchObject({ draft: true, categories: [], authorSlugs: [] });
    expect(emptyArticleDraft().date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("trims text and removes duplicate categories and authors", () => {
    const result = draftToArticle(
      article({
        title: " Title ",
        subtitle: " Sub ",
        categories: [" a ", "a", " ", "b"],
        authorSlugs: ["x", "x", "y"],
      }),
    );

    expect(result).toMatchObject({
      title: "Title",
      subtitle: "Sub",
      categories: ["a", "b"],
      authorSlugs: ["x", "y"],
    });
  });

  it("defaults the subtitle and copies the arrays when loading", () => {
    const source = article({
      subtitle: undefined as unknown as string,
      categories: ["c"],
      authorSlugs: ["x"],
    });
    const draft = articleToDraft(source);

    expect(draft.subtitle).toBe("");
    expect(draft.categories).not.toBe(source.categories);
    expect(draft.authorSlugs).toEqual(["x"]);
    expect(draft.authorSlugs).not.toBe(source.authorSlugs);
  });
});

describe("articleAuthors", () => {
  it("resolves members in author order and skips unknown slugs", () => {
    const members = [
      { slug: "b", name: "B" },
      { slug: "a", name: "A" },
    ] as unknown as Member[];
    const record: CmsArticleRecord = {
      slug: "x",
      content: [],
      article: article({ authorSlugs: ["a", "ghost", "b"] }),
    };

    expect(articleAuthors(record, members).map((member) => member.slug)).toEqual(["a", "b"]);
  });
});

describe("articleThemeId", () => {
  it("keeps the picked theme", () => {
    expect(articleThemeId({ slug: "x", theme: "graphite" })).toBe("graphite");
    expect(articleThemeId({ slug: "x", theme: "sunburst" })).toBe("sunburst");
  });

  it("picks the same listed theme for a slug every time", () => {
    const picked = articleThemeId({ slug: "same" });

    expect(picked).toBe(articleThemeId({ slug: "same" }));
    expect(PROJECT_THEME_IDS).toContain(picked);
  });
});

describe("publishedArticles", () => {
  it("drops drafts and sorts the newest first", () => {
    const record = (slug: string, date: string, draft: boolean): CmsArticleRecord => ({
      slug,
      content: [],
      article: article({ slug, date, draft }),
    });

    expect(
      publishedArticles([
        record("old", "2020-01-01", false),
        record("draft", "2030-01-01", true),
        record("new", "2024-01-01", false),
      ]).map((entry) => entry.slug),
    ).toEqual(["new", "old"]);
  });
});

describe("articleCoverUrl", () => {
  it("resolves cover keys", () => {
    expect(articleCoverUrl()).toBeUndefined();
    expect(articleCoverUrl("static/img/a.png")).toBe("/img/a.png");
    expect(articleCoverUrl("covers/a b.png")).toBe("/api/articles-cms/media/covers%2Fa%20b.png");
  });
});

describe("formatArticleDate", () => {
  it("formats a full date in English", () => {
    expect(formatArticleDate("2024-08-31")).toBe("Saturday, August 31, 2024");
  });

  it("returns an incomplete date unchanged", () => {
    expect(formatArticleDate("2024")).toBe("2024");
    expect(formatArticleDate("2024-08")).toBe("2024-08");
  });
});
