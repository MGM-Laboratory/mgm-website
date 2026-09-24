"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ArticleCard } from "@/components/articles/list/article-card";
import { ArticlesEmpty } from "@/components/articles/list/articles-empty";
import { ArticlesHero } from "@/components/articles/list/articles-hero";
import { requestArticleBatch } from "@/components/articles/list/index-request";
import { queryKey, useListQuery } from "@/components/articles/list/use-list-query";
import { getArticlesWorld } from "@/components/articles/world/world-registry";
import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";
import { LEGAL_LINKS } from "@/data/nav";
import {
  ARTICLE_BATCH_SIZE,
  type ArticleCardData,
  type ArticleCategory,
  type ArticleIndexQuery,
} from "@/lib/article-index";
import { scrollPageTo } from "@/lib/page-scroll";
import { motionAllowed } from "@/lib/reduced-motion";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type ArticlesIndexInitial = {
  items: ArticleCardData[];
  total: number;
  nextOffset: number | null;
  categories: ArticleCategory[];
  all: number;
};

type ListState = {
  items: ArticleCardData[];
  total: number;
  nextOffset: number | null;
  /** The query these items answer. */
  key: string;
  /** The last request for this query failed (the list shows a retry). */
  failed: boolean;
};

function mergeItems(known: ArticleCardData[], more: ArticleCardData[]) {
  const seen = new Set(known.map((item) => item.slug));
  return [...known, ...more.filter((item) => !seen.has(item.slug))];
}

/**
 * The /articles list: the fixed head (title, search, categories), the two
 * column river of cards and the end of the archive.
 *
 * The first batch comes from the server page (so the list works without
 * JavaScript and paints at once); further batches load from
 * /api/articles-cms/index while the visitor nears the end of what is
 * loaded, until the list runs out. The library world draws only the cards
 * near the screen (cards-layer.ts).
 *
 * A new query (the URL: category, search) swaps the list: the cards on
 * screen sink into the fog one after another, the scroll resets while
 * nothing shows, and the new cards rise from nearer. A newer query
 * supersedes one in flight.
 */
export function ArticlesIndex({
  initial,
  initialQuery,
}: {
  initial: ArticlesIndexInitial;
  initialQuery: ArticleIndexQuery;
}) {
  const query = useListQuery();
  const currentKey = queryKey(query.settled);
  const [list, setList] = useState<ListState>(() => ({
    items: initial.items,
    total: initial.total,
    nextOffset: initial.nextOffset,
    key: queryKey(initialQuery),
    failed: false,
  }));
  const [retry, setRetry] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const swapRef = useRef(0);
  const loadingRef = useRef(false);

  // Smooth wheel scrolling (fine pointers, motion allowed): unseen's list
  // glides with a slow ease and moves about 2 px per wheel px.
  useIsomorphicLayoutEffect(() => {
    if (!motionAllowed() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void startSmoothScroll({ lerp: 0.06, wheelMultiplier: 1.6 }).then((stopper) => {
      if (cancelled) stopper();
      else stop = stopper;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  // A new query replaces the list: the cards on screen sink into the fog,
  // the scroll resets while nothing shows, the new first batch rises.
  useEffect(() => {
    if (list.key === currentKey && retry === 0) return;
    const token = ++swapRef.current;
    const controller = new AbortController();
    const world = getArticlesWorld();
    const leaving: Promise<unknown> = world ? world.cards.playFilterOut() : Promise.resolve();
    const settledQuery = query.settled;
    void Promise.all([
      requestArticleBatch(settledQuery, 0, ARTICLE_BATCH_SIZE, controller.signal),
      leaving,
    ]).then(([batch]) => {
      if (controller.signal.aborted || token !== swapRef.current) return;
      scrollPageTo(0, { duration: 0 });
      window.scrollTo({ top: 0, behavior: "instant" });
      setRetry(0);
      setList({
        items: batch?.items ?? [],
        total: batch?.total ?? 0,
        nextOffset: batch ? batch.nextOffset : null,
        key: currentKey,
        failed: !batch,
      });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (token !== swapRef.current) return;
          getArticlesWorld()?.cards.playFilterIn();
        }),
      );
    });
    return () => controller.abort();
    // The query parts are what currentKey encodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, retry]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || list.nextOffset === null || list.key !== currentKey) return;
    loadingRef.current = true;
    const key = list.key;
    const batch = await requestArticleBatch(query.settled, list.nextOffset, ARTICLE_BATCH_SIZE);
    loadingRef.current = false;
    if (!batch) return;
    setList((current) =>
      current.key !== key
        ? current
        : {
            ...current,
            items: mergeItems(current.items, batch.items),
            total: batch.total,
            nextOffset: batch.nextOffset,
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.nextOffset, list.key, currentKey]);

  // Pre-load the next batch while the visitor is still well above the end.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || list.nextOffset === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "0px 0px 180% 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [list.nextOffset, loadMore]);

  const showing = list.key === currentKey;
  const searching = !showing || retry > 0 || queryKey(query.live) !== currentKey;
  const filtered = Boolean(query.settled.category || query.settled.q);
  const categoryName = initial.categories.find(
    (category) => category.slug === query.settled.category,
  )?.name;
  const announcement = !showing
    ? ""
    : list.failed
      ? "The archive didn't answer."
      : list.total === 0
        ? filtered
          ? `No articles match${query.settled.q ? ` “${query.settled.q}”` : ""}${categoryName ? ` in ${categoryName}` : ""}.`
          : "No articles yet."
        : `${list.total} ${list.total === 1 ? "article" : "articles"}${categoryName ? ` in ${categoryName}` : ""}${query.settled.q ? ` matching “${query.settled.q}”` : ""}.`;

  return (
    <div className="articles-page" data-articles-page="">
      <ArticlesHero
        activeCategory={query.live.category}
        all={initial.all}
        categories={initial.categories}
        onCategory={query.setCategory}
        onQuery={query.setText}
        onSubmit={query.submit}
        query={query.text}
        searching={searching}
      />
      <div aria-hidden="true" className="articles-veil" />

      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>

      <section
        aria-busy={searching}
        aria-label="Articles"
        className="articles-grid"
        data-articles-grid=""
      >
        {list.items.map((article, index) => (
          <ArticleCard article={article} index={index} key={article.slug} />
        ))}
      </section>

      {showing && list.items.length === 0 ? (
        <ArticlesEmpty
          category={categoryName}
          failed={list.failed}
          filtered={filtered}
          onClear={query.clear}
          onRetry={() => setRetry((value) => value + 1)}
          q={query.settled.q}
        />
      ) : null}

      <div aria-hidden="true" className="articles-sentinel" ref={sentinelRef} />

      {showing && list.nextOffset === null && !list.failed ? (
        <footer className="articles-end" data-articles-end="">
          <Link className="articles-home" data-articles-home="" href="/">
            Home
          </Link>
          <nav aria-label="Legal" className="articles-legal">
            {LEGAL_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      ) : null}
    </div>
  );
}
