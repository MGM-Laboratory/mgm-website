// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./article-transition");
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));
  vi.stubGlobal("window", {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: number) => clearTimeout(id),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("paths", () => {
  it("reads the slug of an article detail path", async () => {
    const { articleDetailSlug } = await load();

    expect(articleDetailSlug("/articles/my-post")).toBe("my-post");
    expect(articleDetailSlug("/articles/my-post/")).toBe("my-post");
    expect(articleDetailSlug("/articles/a%20b")).toBe("a b");
  });

  it("returns null for the list, deeper paths and a malformed escape", async () => {
    const { articleDetailSlug } = await load();

    expect(articleDetailSlug("/articles")).toBeNull();
    expect(articleDetailSlug("/articles/a/b")).toBeNull();
    expect(articleDetailSlug("/projects/a")).toBeNull();
    expect(articleDetailSlug("/articles/%E0")).toBeNull();
  });

  it("covers the list and the details", async () => {
    const { isArticlesPath } = await load();

    expect(isArticlesPath("/articles")).toBe(true);
    expect(isArticlesPath("/articles/x")).toBe(true);
    expect(isArticlesPath("/about")).toBe(false);
    expect(isArticlesPath("/articles/%E0")).toBe(false);
  });
});

describe("articleTransitionKind", () => {
  it.each([
    ["/articles", "/articles/a", "open"],
    ["/articles/a", "/articles", "close"],
    ["/articles/a", "/articles/b", "swap"],
    ["/about", "/articles", "portal-in"],
    ["/about", "/articles/a", "portal-in"],
    ["/articles", "/about", "portal-out"],
    ["/articles/a", "/", "portal-out"],
  ])("%s to %s is %s", async (from, to, kind) => {
    const { articleTransitionKind } = await load();

    expect(articleTransitionKind(from, to)).toBe(kind);
  });

  it.each([
    ["/articles", "/articles"],
    ["/articles/a", "/articles/a"],
    ["/about", "/contact"],
    ["/admin", "/articles"],
    ["/articles/a", "/admin/articles"],
  ])("%s to %s is none", async (from, to) => {
    const { articleTransitionKind } = await load();

    expect(articleTransitionKind(from, to)).toBeNull();
  });
});

describe("hosts and popstate", () => {
  it("counts mounted layers and ignores a second unregister", async () => {
    const { registerArticleWorldLayer, isArticleWorldMounted } = await load();

    expect(isArticleWorldMounted()).toBe(false);
    const off = registerArticleWorldLayer();
    const offAgain = registerArticleWorldLayer();
    expect(isArticleWorldMounted()).toBe(true);

    off();
    off();
    expect(isArticleWorldMounted()).toBe(true);
    offAgain();
    expect(isArticleWorldMounted()).toBe(false);
  });

  it("claims in world kinds only with the world mounted", async () => {
    const { claimsArticlePopstate, registerArticleWorldLayer } = await load();

    expect(claimsArticlePopstate("/articles", "/articles/a")).toBe(false);
    registerArticleWorldLayer();
    expect(claimsArticlePopstate("/articles", "/articles/a")).toBe(true);
    expect(claimsArticlePopstate("/articles/a", "/articles/b")).toBe(true);
  });

  it("claims portal kinds only with the portal mounted", async () => {
    const { claimsArticlePopstate, registerArticlePortalLayer, registerArticleWorldLayer } =
      await load();
    registerArticleWorldLayer();

    expect(claimsArticlePopstate("/about", "/articles")).toBe(false);
    const off = registerArticlePortalLayer();
    off();
    off();
    expect(claimsArticlePopstate("/about", "/articles")).toBe(false);

    registerArticlePortalLayer();
    expect(claimsArticlePopstate("/about", "/articles")).toBe(true);
    expect(claimsArticlePopstate("/articles/a", "/about")).toBe(true);
  });

  it("claims nothing for a change that is no articles transition", async () => {
    const { claimsArticlePopstate, registerArticleWorldLayer } = await load();
    registerArticleWorldLayer();

    expect(claimsArticlePopstate("/about", "/contact")).toBe(false);
  });
});

describe("cover", () => {
  it("resolves at once without a cover", async () => {
    const { waitForArticleReveal, isArticleCoverActive } = await load();

    expect(isArticleCoverActive()).toBe(false);
    await expect(waitForArticleReveal()).resolves.toBeUndefined();
  });

  it("holds waiters until the reveal starts and ignores a reveal without a cover", async () => {
    const {
      markArticleCoverStarted,
      markArticleRevealStarted,
      waitForArticleReveal,
      isArticleCoverActive,
    } = await load();
    markArticleRevealStarted();
    markArticleCoverStarted();
    const done = vi.fn();
    void waitForArticleReveal().then(done);
    await Promise.resolve();

    expect(isArticleCoverActive()).toBe(true);
    expect(done).not.toHaveBeenCalled();

    markArticleRevealStarted();
    await Promise.resolve();

    expect(isArticleCoverActive()).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("page readiness", () => {
  it("is ready when no page is expected", async () => {
    const { isArticlePageReady, waitForArticlePage } = await load();

    expect(isArticlePageReady()).toBe(true);
    await expect(waitForArticlePage(1000)).resolves.toBeUndefined();
  });

  it("waits for the expected page and ignores any other", async () => {
    const { expectArticlePage, markArticlePageReady, waitForArticlePage, isArticlePageReady } =
      await load();
    expectArticlePage("/articles/a");
    const done = vi.fn();
    void waitForArticlePage(5000).then(done);

    markArticlePageReady("/articles/other");
    await Promise.resolve();
    expect(isArticlePageReady()).toBe(false);
    expect(done).not.toHaveBeenCalled();

    markArticlePageReady("/articles/a");
    await Promise.resolve();
    expect(isArticlePageReady()).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);

    markArticlePageReady("/articles/a");
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("gives up after the timeout", async () => {
    const { expectArticlePage, waitForArticlePage } = await load();
    expectArticlePage("/articles/a");
    const done = vi.fn();
    void waitForArticlePage(500).then(done);

    await vi.advanceTimersByTimeAsync(499);
    expect(done).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("arrival notes", () => {
  it("is read only by the page it names", async () => {
    const { noteArticleArrival, peekArticleArrival } = await load();
    noteArticleArrival({ kind: "open", pathname: "/articles/a", slug: "a" });

    expect(peekArticleArrival("/articles/a")).toMatchObject({ kind: "open", slug: "a" });
    expect(peekArticleArrival("/articles/b")).toBeUndefined();
    expect(peekArticleArrival("/articles/a")).toBeDefined();
  });

  it("goes stale after ten seconds", async () => {
    const { noteArticleArrival, peekArticleArrival } = await load();
    noteArticleArrival({ kind: "close", pathname: "/articles" });

    vi.advanceTimersByTime(10_000);
    expect(peekArticleArrival("/articles")).toBeDefined();

    vi.advanceTimersByTime(1);
    expect(peekArticleArrival("/articles")).toBeUndefined();
  });

  it("has nothing before a note was made", async () => {
    const { peekArticleArrival } = await load();

    expect(peekArticleArrival("/articles")).toBeUndefined();
  });

  it("clears one path or everything", async () => {
    const { noteArticleArrival, peekArticleArrival, clearArticleArrival } = await load();
    noteArticleArrival({ kind: "swap", pathname: "/articles/a" });

    clearArticleArrival("/articles/other");
    expect(peekArticleArrival("/articles/a")).toBeDefined();

    clearArticleArrival("/articles/a");
    expect(peekArticleArrival("/articles/a")).toBeUndefined();

    noteArticleArrival({ kind: "swap", pathname: "/articles/a" });
    clearArticleArrival();
    expect(peekArticleArrival("/articles/a")).toBeUndefined();
  });
});

describe("return note and list address", () => {
  it("keeps the return note until it is cleared", async () => {
    const { setArticleReturn, peekArticleReturn, clearArticleReturn } = await load();

    expect(peekArticleReturn()).toBeUndefined();
    setArticleReturn({ slug: "a", scrollY: 120 });
    expect(peekArticleReturn()).toEqual({ slug: "a", scrollY: 120 });

    clearArticleReturn();
    expect(peekArticleReturn()).toBeUndefined();

    setArticleReturn({ slug: "b" });
    setArticleReturn(undefined);
    expect(peekArticleReturn()).toBeUndefined();
  });

  it("remembers the filtered list and refuses an address outside the list", async () => {
    const { rememberArticleListHref, articleListHref, ARTICLES_LIST_PATH } = await load();

    expect(articleListHref()).toBe(ARTICLES_LIST_PATH);
    rememberArticleListHref("/articles?category=web&q=x");
    expect(articleListHref()).toBe("/articles?category=web&q=x");

    rememberArticleListHref("https://evil.test/articles");
    expect(articleListHref()).toBe(ARTICLES_LIST_PATH);
  });
});

describe("busy", () => {
  it("tells listeners only on a change and stops after unsubscribe", async () => {
    const { setArticleTransitionBusy, isArticleTransitionBusy, onArticleTransitionChange } =
      await load();
    const listener = vi.fn();
    const off = onArticleTransitionChange(listener);

    setArticleTransitionBusy(false);
    expect(listener).not.toHaveBeenCalled();

    setArticleTransitionBusy(true);
    setArticleTransitionBusy(true);
    expect(isArticleTransitionBusy()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setArticleTransitionBusy(false);
    expect(listener).toHaveBeenCalledTimes(2);

    off();
    setArticleTransitionBusy(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
