"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ArticleCard, ArticleCardPlaceholder } from "@/components/articles/list/article-card";
import { ArticlesEmpty } from "@/components/articles/list/articles-empty";
import { ArticlesEnd } from "@/components/articles/list/articles-end";
import { ArticlesHero } from "@/components/articles/list/articles-hero";
import { BackToTop } from "@/components/articles/list/back-to-top";
import { startDomReveal } from "@/components/articles/list/dom-reveal";
import { requestArticleBatch } from "@/components/articles/list/index-request";
import { forgetList, recallList, rememberList } from "@/components/articles/list/list-cache";
import {
  entranceKind,
  startListEntrance,
  whenWorldDecided,
} from "@/components/articles/list/list-entrance";
import { restoreReturnScroll } from "@/components/articles/list/return-scroll";
import { queryKey, useListQuery } from "@/components/articles/list/use-list-query";
import { getArticlesWorld } from "@/components/articles/world/world-registry";
import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";
import {
  ARTICLE_BATCH_MAX,
  ARTICLE_BATCH_SIZE,
  type ArticleCardData,
  type ArticleCategory,
  type ArticleIndexQuery,
} from "@/lib/article-index";
import {
  ARTICLES_LIST_PATH,
  clearArticleArrival,
  clearArticleReturn,
  markArticlePageReady,
  noteArticleArrival,
  peekArticleArrival,
  peekArticleReturn,
  setArticleReturn,
  type ArticleReturn,
} from "@/lib/article-transition";
import { skipScrollReset } from "@/lib/project-transition";
import { scrollPageTo } from "@/lib/page-scroll";
import { motionAllowed } from "@/lib/reduced-motion";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Dev probe: stage the notes a transition would leave, to exercise the
// list's return mode and entrance without the transitions.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  Object.assign(window, {
    __articlesList: {
      setReturn: setArticleReturn,
      noteArrival: noteArticleArrival,
      skipScrollReset,
      forget: forgetList,
    },
  });
}

/** Placeholder sheets shown for a batch in flight. */
const PLACEHOLDERS = 4;
/** Batches the return mode may load looking for the card it came back to. */
const RETURN_BATCHES = 8;
/** The longest the page waits (visible or not) before telling a transition it is ready. */
const READY_CEILING_MS = 2600;

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
 * column river of cards and, once the archive runs out, its end (the Home
 * button and the legal links; there is no footer).
 *
 * The first batch comes from the server page (so the list works without
 * JavaScript and paints at once); further batches load from
 * /api/articles-cms/index well before the visitor nears the end, with
 * placeholder sheets standing in while one is in flight, until the list
 * runs out. The library world draws only the cards near the screen
 * (cards-layer.ts).
 *
 * A new query (the URL: category, search) swaps the list: the cards on
 * screen sink into the fog one after another, the scroll resets while
 * nothing shows, and the new cards rise from nearer. A newer query
 * supersedes one in flight.
 *
 * Back from an article (a return note) the list renders every batch it had
 * (list-cache.ts) and restores its scroll in a layout effect, so the card
 * the visitor opened is in view when the transition brings the list back;
 * it tells the transition it is ready (`markArticlePageReady`) only then.
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
  // Read during render: how the list is being entered (lib/article-transition.ts).
  const [arrival] = useState(() => peekArticleArrival(ARTICLES_LIST_PATH));
  const [returnNote] = useState(peekArticleReturn);
  const [list, setList] = useState<ListState>(() => {
    const key = queryKey(initialQuery);
    const recalled = returnNote ? recallList(key, initial.items) : null;
    if (recalled) return { ...recalled, failed: false };
    return {
      items: initial.items,
      total: initial.total,
      nextOffset: initial.nextOffset,
      key,
      failed: false,
    };
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const swapRef = useRef(0);
  const loadingRef = useRef(false);
  const restoreRef = useRef<{ note: ArticleReturn; done: () => void } | null>(null);
  const restoredRef = useRef<Promise<void>>(Promise.resolve());

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

  // The entrance, the DOM reveal and the return restore, before the first
  // paint (and before the root layout's scroll reset, which runs after).
  useIsomorphicLayoutEffect(() => {
    const page = pageRef.current;
    const grid = gridRef.current;
    if (!page || !grid) return;
    const returning = Boolean(returnNote && !returnNote.restoreOnly);
    const kind = entranceKind({ arrival, returning, motion: motionAllowed() });
    if (arrival) clearArticleArrival(ARTICLES_LIST_PATH);
    const entrance = startListEntrance(page, kind);
    const stopReveal = startDomReveal(grid, { instant: kind === "return" || kind === "instant" });

    let frame = 0;
    if (returnNote) {
      clearArticleReturn();
      if (restoreReturnScroll(returnNote)) {
        // A native link (reduced motion) scrolls to the top after this effect.
        if (returnNote.restoreOnly) {
          frame = requestAnimationFrame(() => restoreReturnScroll(returnNote));
        }
      } else {
        // The card isn't in what is loaded: load on until it is (bounded).
        restoredRef.current = new Promise<void>((resolve) => {
          restoreRef.current = { note: returnNote, done: resolve };
        });
      }
    }
    return () => {
      cancelAnimationFrame(frame);
      entrance.dispose();
      stopReveal();
    };
    // Mount only: the notes were read during the first render.
  }, []);

  // Return mode, card not loaded yet: fetch batches until it turns up.
  useEffect(() => {
    const pending = restoreRef.current;
    if (!pending) return;
    let cancelled = false;
    void (async () => {
      let items = list.items;
      let total = list.total;
      let nextOffset = list.nextOffset;
      for (let i = 0; i < RETURN_BATCHES && nextOffset !== null; i += 1) {
        if (items.some((item) => item.slug === pending.note.slug)) break;
        const batch = await requestArticleBatch(query.settled, nextOffset, ARTICLE_BATCH_MAX);
        if (cancelled) return;
        if (!batch) break;
        items = mergeItems(items, batch.items);
        total = batch.total;
        nextOffset = batch.nextOffset;
      }
      if (cancelled) return;
      if (items.length === list.items.length) {
        restoreRef.current = null;
        pending.done();
        return;
      }
      setList((current) => ({ ...current, items, total, nextOffset }));
    })();
    return () => {
      cancelled = true;
    };
    // Runs once for the pending restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ...and restore as soon as it is in the DOM.
  useIsomorphicLayoutEffect(() => {
    const pending = restoreRef.current;
    if (!pending) return;
    if (!list.items.some((item) => item.slug === pending.note.slug) && list.nextOffset !== null)
      return;
    restoreRef.current = null;
    restoreReturnScroll(pending.note);
    pending.done();
  }, [list]);

  // Tell a transition bringing the list in that it can show it: once the
  // world has decided, the cards have registered (their effects ran first)
  // and been measured, and any return restore is done. Bounded.
  useEffect(() => {
    const signal = { cancelled: false };
    let settled = false;
    const report = () => {
      if (settled || signal.cancelled) return;
      settled = true;
      markArticlePageReady(ARTICLES_LIST_PATH);
    };
    void (async () => {
      await whenWorldDecided(signal);
      await restoredRef.current;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (signal.cancelled) return;
      getArticlesWorld()?.cards.measure();
      report();
    })();
    const ceiling = window.setTimeout(report, READY_CEILING_MS);
    return () => {
      signal.cancelled = true;
      window.clearTimeout(ceiling);
    };
  }, []);

  // While the list scrolls, the DOM hover stands down (a card sliding under
  // a resting cursor must not light up: docs/animation-system.md gotcha #20).
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let timer = 0;
    const onScroll = () => {
      if (!("scrolling" in grid.dataset)) grid.dataset.scrolling = "";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => delete grid.dataset.scrolling, 140);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, []);

  // Keep what is loaded for a return from an article.
  useEffect(() => {
    if (list.key === currentKey && !list.failed) rememberList(list);
  }, [list, currentKey]);

  // A new query replaces the list: the cards on screen sink into the fog,
  // the scroll resets while nothing shows, the new first batch rises.
  useEffect(() => {
    if (list.key === currentKey && retry === 0) return;
    const token = ++swapRef.current;
    const controller = new AbortController();
    const world = getArticlesWorld();
    const grid = gridRef.current;
    const motion = motionAllowed();
    let leaving: Promise<unknown> = Promise.resolve();
    if (world) {
      leaving = world.cards.playFilterOut();
    } else if (grid && motion && list.items.length) {
      grid.dataset.leaving = "";
      leaving = new Promise((resolve) => window.setTimeout(resolve, 320));
    }
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
          if (grid) delete grid.dataset.leaving;
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
    setLoadingMore(true);
    const key = list.key;
    const batch = await requestArticleBatch(query.settled, list.nextOffset, ARTICLE_BATCH_SIZE);
    loadingRef.current = false;
    setLoadingMore(false);
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

  // Load the next batch while the visitor is still well above the end
  // (more than two viewports ahead), so a card is never waited for.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || list.nextOffset === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "0px 0px 260% 0px" },
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
    <div className="articles-page" data-articles-page="" data-entrance="pending" ref={pageRef}>
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
        aria-busy={searching || loadingMore}
        aria-label="Articles"
        className="articles-grid"
        data-articles-grid=""
        ref={gridRef}
      >
        {list.items.map((article, index) => (
          <ArticleCard article={article} index={index} key={article.slug} />
        ))}
        {loadingMore && showing
          ? Array.from(
              { length: Math.min(PLACEHOLDERS, Math.max(0, list.total - list.items.length)) },
              (_, i) => (
                <ArticleCardPlaceholder index={list.items.length + i} key={`placeholder-${i}`} />
              ),
            )
          : null}
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
        <ArticlesEnd
          category={categoryName}
          empty={list.items.length === 0}
          q={query.settled.q}
          total={list.total}
        />
      ) : null}

      <BackToTop />
    </div>
  );
}
