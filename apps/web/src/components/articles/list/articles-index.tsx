"use client";

import Link from "next/link";
import { debounce, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ArticleCard } from "@/components/articles/list/article-card";
import { ArticlesHero } from "@/components/articles/list/articles-hero";
import { requestArticleBatch } from "@/components/articles/list/index-request";
import { getArticlesWorld } from "@/components/articles/world/world-registry";
import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";
import { LEGAL_LINKS } from "@/data/nav";
import {
  ARTICLE_BATCH_SIZE,
  type ArticleCardData,
  type ArticleCategory,
  type ArticleIndexQuery,
} from "@/lib/article-index";
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
};

function queryKey(query: ArticleIndexQuery) {
  return `${query.category ?? ""}\u0000${query.q ?? ""}`;
}

/**
 * The /articles list: the fixed head (title, search, categories), the two
 * column river of cards and the end of the archive.
 *
 * The first batch comes from the server page (so the list works without
 * JavaScript and paints at once); further batches load from
 * /api/articles-cms/index while the visitor nears the end of what is loaded,
 * until the list runs out. The library world draws the cards near the
 * screen only and lets the others go (cards-layer.ts).
 */
export function ArticlesIndex({
  initial,
  initialQuery,
}: {
  initial: ArticlesIndexInitial;
  initialQuery: ArticleIndexQuery;
}) {
  const [params, setParams] = useQueryStates(
    {
      category: parseAsString,
      q: parseAsString.withOptions({ limitUrlUpdates: debounce(350) }),
    },
    { history: "replace", scroll: false },
  );
  const query: ArticleIndexQuery = {
    category: params.category ?? undefined,
    q: params.q?.trim() || undefined,
  };
  const currentKey = queryKey(query);
  const [typed, setTyped] = useState(params.q ?? "");
  const [list, setList] = useState<ListState>(() => ({
    items: initial.items,
    total: initial.total,
    nextOffset: initial.nextOffset,
    key: queryKey(initialQuery),
  }));
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Smooth wheel scrolling (fine pointers, motion allowed): unseen's list
  // glides with a slow 0.05-per-frame ease and moves 2 px per wheel px.
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
  // the first batch for the new query rises in their place.
  useEffect(() => {
    if (list.key === currentKey) return;
    const controller = new AbortController();
    const world = getArticlesWorld();
    const leaving = world ? world.cards.playFilterOut() : Promise.resolve();
    const q = { category: query.category, q: query.q };
    void Promise.all([
      requestArticleBatch(q, 0, ARTICLE_BATCH_SIZE, controller.signal),
      leaving,
    ]).then(([batch]) => {
      if (controller.signal.aborted) return;
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      setList({
        items: batch?.items ?? [],
        total: batch?.total ?? 0,
        nextOffset: batch?.nextOffset ?? null,
        key: currentKey,
      });
      requestAnimationFrame(() => getArticlesWorld()?.cards.playFilterIn());
    });
    return () => controller.abort();
    // The query parts are what currentKey encodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, list.key]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || list.nextOffset === null || list.key !== currentKey) return;
    loadingRef.current = true;
    const batch = await requestArticleBatch(query, list.nextOffset, ARTICLE_BATCH_SIZE);
    loadingRef.current = false;
    if (!batch) return;
    setList((current) =>
      current.key !== currentKey
        ? current
        : {
            ...current,
            items: [
              ...current.items,
              ...batch.items.filter(
                (item) => !current.items.some((known) => known.slug === item.slug),
              ),
            ],
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

  const onQuery = (value: string) => {
    setTyped(value);
    void setParams({ q: value.trim() ? value : null });
  };
  const onCategory = (slug: string | null) => void setParams({ category: slug });

  const showing = list.key === currentKey ? list : null;

  return (
    <div className="articles-page" data-articles-page="">
      <ArticlesHero
        activeCategory={query.category}
        all={initial.all}
        categories={initial.categories}
        onCategory={onCategory}
        onQuery={onQuery}
        query={typed}
        total={showing?.total ?? list.total}
      />

      <section aria-label="Articles" className="articles-grid" data-articles-grid="">
        {list.items.map((article, index) => (
          <ArticleCard article={article} index={index} key={article.slug} />
        ))}
      </section>

      {list.items.length === 0 ? (
        query.category || query.q ? (
          <div className="articles-empty">
            <p className="articles-empty-title">No articles match</p>
            <p className="articles-empty-body">Try a different word, or open every category.</p>
          </div>
        ) : (
          <div className="articles-empty">
            <p className="articles-empty-title">No articles yet</p>
            <p className="articles-empty-body">
              The first write-ups from the lab are on their way.
            </p>
          </div>
        )
      ) : null}

      <div aria-hidden="true" className="articles-sentinel" ref={sentinelRef} />

      {list.nextOffset === null ? (
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
