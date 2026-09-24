"use client";

import { debounce, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useState } from "react";

import type { ArticleIndexQuery } from "@/lib/article-index";

/** How long typing must pause before the list asks for results. */
const SEARCH_SETTLE_MS = 320;

export function queryKey(query: ArticleIndexQuery) {
  return `${query.category ?? ""}\u0000${query.q ?? ""}`;
}

function sameQuery(a: ArticleIndexQuery, b: ArticleIndexQuery) {
  return (a.category ?? "") === (b.category ?? "") && (a.q ?? "") === (b.q ?? "");
}

/**
 * The list's query, which is the URL: `?category=` and `?q=` through nuqs
 * (shallow, history "replace", so the filters survive a reload, a shared
 * link, and going into an article and back). nuqs updates its state at
 * once and only debounces the URL, so the search field binds straight to
 * it; the list itself follows `settled`, a debounced copy, so it asks for
 * results once typing pauses rather than on every key.
 *
 * Category changes and clearing the search settle at once, as does any
 * change that comes from the URL itself (browser back and forward between
 * entries with different filters): the list re-syncs without remounting.
 */
export function useListQuery() {
  const [params, setParams] = useQueryStates(
    { category: parseAsString, q: parseAsString },
    { history: "replace", scroll: false },
  );
  const live: ArticleIndexQuery = {
    category: params.category ?? undefined,
    q: params.q?.trim() || undefined,
  };
  const [settled, setSettled] = useState<ArticleIndexQuery>(live);
  const [typing, setTyping] = useState(false);

  // Adjust during render (not in an effect) when the change should apply at
  // once: a category, a cleared search, or a URL change nobody typed.
  if (!sameQuery(live, settled)) {
    const immediate = (live.category ?? "") !== (settled.category ?? "") || !live.q || !typing;
    if (immediate) setSettled(live);
  }

  useEffect(() => {
    if (!typing) return;
    const timer = window.setTimeout(() => {
      setTyping(false);
    }, SEARCH_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [typing, params.q]);

  return {
    /** The search field's text (instant). */
    text: params.q ?? "",
    live,
    settled,
    setText(value: string) {
      setTyping(Boolean(value.trim()));
      void setParams(
        { q: value.trim() ? value : null },
        { limitUrlUpdates: value.trim() ? debounce(SEARCH_SETTLE_MS) : undefined },
      );
    },
    /** Enter: stop waiting for the pause. */
    submit() {
      setTyping(false);
    },
    setCategory(slug: string | null) {
      setTyping(false);
      void setParams({ category: slug });
    },
    /** Clears every filter (the empty state's way back). */
    clear() {
      setTyping(false);
      void setParams({ category: null, q: null });
    },
  };
}
