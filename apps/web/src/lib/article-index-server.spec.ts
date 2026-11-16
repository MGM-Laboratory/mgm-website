// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CmsArticleRecord } from "@/lib/article-cms";

const { fetchArticleFeed, fetchArticleRecords, fetchMemberRecords } = vi.hoisted(() => ({
  fetchArticleFeed: vi.fn<() => Promise<CmsArticleRecord[]>>(),
  fetchArticleRecords: vi.fn<() => Promise<CmsArticleRecord[]>>(),
  fetchMemberRecords: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock("@/lib/article-cms-server", () => ({ fetchArticleFeed, fetchArticleRecords }));
vi.mock("@/lib/member-cms-server", () => ({ fetchMemberRecords }));

type Overrides = {
  title?: string;
  categories?: string[];
  authorSlugs?: string[];
  date?: string;
  draft?: boolean;
  updatedAt?: string | null;
  body?: string;
};

function record(slug: string, overrides: Overrides = {}): CmsArticleRecord {
  return {
    slug,
    updatedAt: overrides.updatedAt === null ? undefined : (overrides.updatedAt ?? "v1"),
    content: overrides.body
      ? [{ id: slug, type: "paragraph", content: [{ type: "text", text: overrides.body }] }]
      : [],
    article: {
      slug,
      title: overrides.title ?? `Title ${slug}`,
      subtitle: "",
      date: overrides.date ?? "2025-01-01",
      categories: overrides.categories ?? [],
      authorSlugs: overrides.authorSlugs ?? [],
      draft: overrides.draft ?? false,
    },
  };
}

function memberRecord(slug: string, name: string) {
  return { slug, profile: {}, member: { slug, name } };
}

async function load() {
  vi.resetModules();
  return import("./article-index-server");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));
  fetchArticleFeed.mockReset();
  fetchArticleRecords.mockReset();
  fetchMemberRecords.mockReset();
  fetchMemberRecords.mockResolvedValue([]);
  fetchArticleRecords.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("readArticleIndex without a search", () => {
  it("pages the published feed and reports the totals and categories", async () => {
    fetchArticleFeed.mockResolvedValue([
      record("a", { date: "2025-01-01", categories: ["Web"] }),
      record("draft", { draft: true }),
      record("b", { date: "2025-03-01", categories: ["Web", "Game"] }),
      record("c", { date: "2025-02-01" }),
    ]);
    const { readArticleIndex } = await load();

    const first = await readArticleIndex({}, { limit: 2 });

    expect(first.items.map((item) => item.slug)).toEqual(["b", "c"]);
    expect(first).toMatchObject({ total: 3, offset: 0, nextOffset: 2, all: 3 });
    expect(first.categories.map((entry) => [entry.slug, entry.count])).toEqual([
      ["web", 2],
      ["game", 1],
    ]);

    const second = await readArticleIndex({}, { limit: 2, offset: 2 });

    expect(second.items.map((item) => item.slug)).toEqual(["a"]);
    expect(second.nextOffset).toBeNull();
  });

  it("clamps an offset past the end and a negative limit", async () => {
    fetchArticleFeed.mockResolvedValue([record("a")]);
    const { readArticleIndex } = await load();

    const result = await readArticleIndex({}, { limit: -5, offset: 99 });

    expect(result).toMatchObject({ items: [], total: 1, offset: 1, nextOffset: null });
  });

  it("filters by category", async () => {
    fetchArticleFeed.mockResolvedValue([
      record("a", { categories: ["Web"] }),
      record("b", { categories: ["Game"] }),
    ]);
    const { readArticleIndex } = await load();

    const result = await readArticleIndex({ category: "game" }, { limit: 10 });

    expect(result.items.map((item) => item.slug)).toEqual(["b"]);
    expect(result.all).toBe(2);
  });

  it("resolves the authors of a card from the member records", async () => {
    fetchArticleFeed.mockResolvedValue([record("a", { authorSlugs: ["ada"] })]);
    fetchMemberRecords.mockResolvedValue([memberRecord("ada", "Ada")]);
    const { readArticleIndex } = await load();

    const result = await readArticleIndex({}, { limit: 10 });

    expect(result.items[0].authors).toEqual([{ slug: "ada", name: "Ada" }]);
  });
});

describe("caching of the feed", () => {
  it("rereads on every call unless reuse is asked for", async () => {
    fetchArticleFeed.mockResolvedValue([record("a")]);
    const { readArticleIndex } = await load();

    await readArticleIndex({}, { limit: 1 });
    await readArticleIndex({}, { limit: 1 });

    expect(fetchArticleFeed).toHaveBeenCalledTimes(2);
  });

  it("reuses a young copy and rereads an old one", async () => {
    fetchArticleFeed.mockResolvedValue([record("a")]);
    const { readArticleIndex } = await load();

    await readArticleIndex({}, { limit: 1 });
    await readArticleIndex({}, { limit: 1, reuse: true });
    expect(fetchArticleFeed).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2025-06-01T00:00:11.000Z"));
    await readArticleIndex({}, { limit: 1, reuse: true });
    expect(fetchArticleFeed).toHaveBeenCalledTimes(2);
  });

  it("shares one read between calls that arrive together", async () => {
    let release: (value: CmsArticleRecord[]) => void = () => {};
    fetchArticleFeed.mockReturnValue(
      new Promise<CmsArticleRecord[]>((resolve) => {
        release = resolve;
      }),
    );
    const { readArticleIndex } = await load();

    const calls = [readArticleIndex({}, { limit: 1 }), readArticleIndex({}, { limit: 1 })];
    await vi.waitFor(() => expect(fetchArticleFeed).toHaveBeenCalledTimes(1));
    release([record("a")]);
    const results = await Promise.all(calls);

    expect(fetchArticleFeed).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.total)).toEqual([1, 1]);
  });

  it("keeps the last good feed during an outage and falls back to an empty list", async () => {
    fetchArticleFeed.mockResolvedValueOnce([record("a")]);
    const { readArticleIndex } = await load();
    await readArticleIndex({}, { limit: 1 });

    fetchArticleFeed.mockRejectedValue(new Error("down"));
    const kept = await readArticleIndex({}, { limit: 1 });
    expect(kept.items.map((item) => item.slug)).toEqual(["a"]);

    const fresh = await load();
    const empty = await fresh.readArticleIndex({}, { limit: 1 });
    expect(empty).toMatchObject({ items: [], total: 0, all: 0 });
  });

  it("reuses the members for a minute and keeps the old ones during an outage", async () => {
    fetchArticleFeed.mockResolvedValue([record("a", { authorSlugs: ["ada"] })]);
    fetchMemberRecords.mockResolvedValueOnce([memberRecord("ada", "Ada")]);
    const { readArticleIndex } = await load();

    await readArticleIndex({}, { limit: 1 });
    await readArticleIndex({}, { limit: 1 });
    expect(fetchMemberRecords).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2025-06-01T00:01:01.000Z"));
    fetchMemberRecords.mockRejectedValue(new Error("down"));
    const result = await readArticleIndex({}, { limit: 1 });

    expect(fetchMemberRecords).toHaveBeenCalledTimes(2);
    expect(result.items[0].authors).toEqual([{ slug: "ada", name: "Ada" }]);
  });

  it("serves no authors when the members are down from the start", async () => {
    fetchArticleFeed.mockResolvedValue([record("a", { authorSlugs: ["ada"] })]);
    fetchMemberRecords.mockRejectedValue(new Error("down"));
    const { readArticleIndex } = await load();

    expect((await readArticleIndex({}, { limit: 1 })).items[0].authors).toEqual([]);
  });
});

describe("readArticleIndex with a search", () => {
  it("requires every term, ranks by relevance and matches body and authors", async () => {
    const feed = [
      record("title", { title: "Robots arm", date: "2025-01-01" }),
      record("body", { title: "Other", body: "an arm for robots", date: "2025-02-01" }),
      record("author", { title: "Third", authorSlugs: ["rob"], body: "arm", date: "2025-03-01" }),
      record("miss", { title: "Robots only", date: "2025-04-01" }),
    ];
    fetchArticleFeed.mockResolvedValue(feed);
    fetchArticleRecords.mockResolvedValue(feed);
    fetchMemberRecords.mockResolvedValue([memberRecord("rob", "Robby")]);
    const { readArticleIndex } = await load();

    const result = await readArticleIndex({ q: "robots arm" }, { limit: 10 });

    expect(result.items.map((item) => item.slug)).toEqual(["title", "body"]);

    const byAuthor = await readArticleIndex({ q: "robby" }, { limit: 10 });
    expect(byAuthor.items.map((item) => item.slug)).toEqual(["author"]);
  });

  it("appends a match that ranks at zero after the ranked ones, newest first", async () => {
    const feed = [
      record("ranked", { title: "Robby notes" }),
      record("older", { authorSlugs: ["rob"], date: "2024-01-01" }),
      record("newer", { authorSlugs: ["rob"], date: "2025-05-01" }),
    ];
    fetchArticleFeed.mockResolvedValue(feed);
    fetchArticleRecords.mockResolvedValue(feed);
    fetchMemberRecords.mockResolvedValue([memberRecord("rob", "Robby")]);
    const { readArticleIndex } = await load();

    const result = await readArticleIndex({ q: "robby" }, { limit: 10 });

    expect(result.items.map((item) => item.slug)).toEqual(["ranked", "newer", "older"]);
  });

  it("matches nothing for a query without letters or digits", async () => {
    const feed = [record("a")];
    fetchArticleFeed.mockResolvedValue(feed);
    fetchArticleRecords.mockResolvedValue(feed);
    const { readArticleIndex } = await load();

    const result = await readArticleIndex({ q: "!!!" }, { limit: 10 });

    expect(result).toMatchObject({ items: [], total: 0, all: 1 });
  });

  it("combines a search with a category", async () => {
    const feed = [
      record("a", { title: "Robots", categories: ["Web"] }),
      record("b", { title: "Robots", categories: ["Game"] }),
    ];
    fetchArticleFeed.mockResolvedValue(feed);
    fetchArticleRecords.mockResolvedValue(feed);
    const { readArticleIndex } = await load();

    const result = await readArticleIndex({ q: "robots", category: "game" }, { limit: 10 });

    expect(result.items.map((item) => item.slug)).toEqual(["b"]);
  });

  it("drops a full record that has left the feed", async () => {
    fetchArticleFeed.mockResolvedValue([record("a", { title: "Robots" })]);
    fetchArticleRecords.mockResolvedValue([
      record("a", { title: "Robots" }),
      record("gone", { title: "Robots" }),
    ]);
    const { readArticleIndex } = await load();

    const result = await readArticleIndex({ q: "robots" }, { limit: 10 });

    expect(result.items.map((item) => item.slug)).toEqual(["a"]);
  });

  it("reuses the full records only while they still cover the feed as saved", async () => {
    const feed = [record("a", { title: "Robots", updatedAt: "v1" })];
    fetchArticleFeed.mockResolvedValue(feed);
    fetchArticleRecords.mockResolvedValue(feed);
    const { readArticleIndex } = await load();

    await readArticleIndex({ q: "robots" }, { limit: 10 });
    await readArticleIndex({ q: "robots" }, { limit: 10 });
    expect(fetchArticleRecords).toHaveBeenCalledTimes(1);

    fetchArticleFeed.mockResolvedValue([record("a", { title: "Robots", updatedAt: "v2" })]);
    await readArticleIndex({ q: "robots" }, { limit: 10 });
    expect(fetchArticleRecords).toHaveBeenCalledTimes(2);
  });

  it("never trusts a feed record without a revision", async () => {
    const feed = [record("a", { title: "Robots", updatedAt: null })];
    fetchArticleFeed.mockResolvedValue(feed);
    fetchArticleRecords.mockResolvedValue(feed);
    const { readArticleIndex } = await load();

    await readArticleIndex({ q: "robots" }, { limit: 10 });
    await readArticleIndex({ q: "robots" }, { limit: 10 });

    expect(fetchArticleRecords).toHaveBeenCalledTimes(2);
  });

  it("expires the full records after thirty seconds", async () => {
    const feed = [record("a", { title: "Robots" })];
    fetchArticleFeed.mockResolvedValue(feed);
    fetchArticleRecords.mockResolvedValue(feed);
    const { readArticleIndex } = await load();

    await readArticleIndex({ q: "robots" }, { limit: 10 });
    vi.setSystemTime(new Date("2025-06-01T00:00:31.000Z"));
    await readArticleIndex({ q: "robots" }, { limit: 10 });

    expect(fetchArticleRecords).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good full records during an outage and falls back to nothing", async () => {
    const feed = [record("a", { title: "Robots" })];
    fetchArticleFeed.mockResolvedValue(feed);
    fetchArticleRecords.mockResolvedValueOnce(feed);
    const { readArticleIndex } = await load();
    await readArticleIndex({ q: "robots" }, { limit: 10 });

    vi.setSystemTime(new Date("2025-06-01T00:00:31.000Z"));
    fetchArticleRecords.mockRejectedValue(new Error("down"));
    const kept = await readArticleIndex({ q: "robots" }, { limit: 10 });
    expect(kept.items.map((item) => item.slug)).toEqual(["a"]);

    const fresh = await load();
    const none = await fresh.readArticleIndex({ q: "robots" }, { limit: 10 });
    expect(none.items).toEqual([]);
  });
});
