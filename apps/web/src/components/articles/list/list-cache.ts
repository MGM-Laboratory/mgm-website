import type { ArticleCardData } from "@/lib/article-index";

/**
 * What the list had loaded when it was last on screen, kept for the rest of
 * the visit (module state survives client-side navigation, a hard load
 * starts empty). Coming back from an article, the list renders every batch
 * it had at once, so the card the visitor opened is in the DOM for the
 * layout-effect scroll restore, instead of waiting for batches to load.
 */

export type ListSnapshot = {
  /** The query these items answer (use-list-query.ts `queryKey`). */
  key: string;
  items: ArticleCardData[];
  total: number;
  nextOffset: number | null;
};

let snapshot: ListSnapshot | null = null;

export function rememberList(list: ListSnapshot) {
  snapshot = list;
}

/**
 * The remembered list for `key`, if it still agrees with what the server
 * just rendered (the same first cards, so nothing was published or
 * reordered since); otherwise nothing, and the list starts from the server.
 */
export function recallList(key: string, fresh: readonly ArticleCardData[]) {
  if (!snapshot || snapshot.key !== key) return null;
  if (snapshot.items.length <= fresh.length) return null;
  for (let i = 0; i < fresh.length; i += 1) {
    if (snapshot.items[i]?.slug !== fresh[i].slug) return null;
  }
  return snapshot;
}

/** Drops the remembered list (dev probe: exercise the return mode's batch loading). */
export function forgetList() {
  snapshot = null;
}
