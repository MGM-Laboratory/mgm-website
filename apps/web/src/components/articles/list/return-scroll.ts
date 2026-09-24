import type { ArticleReturn } from "@/lib/article-transition";

/** Where the fold starts under the head, as the cards layer puts it (share of the viewport). */
const FOLD_GAP = 0.085;
/** Without a usable remembered position, the card's top lands here (share of the viewport). */
const RETURN_CARD_TOP = 0.3;

/**
 * Scrolls the list back to where a return note wants it: the remembered
 * position when the card still shows there (the list may have changed
 * since: a new article, a resize), else the returned-to card's top at
 * about 30 % of the viewport, never above the fold line so it rests flat.
 * A jump, never a glide. Returns false when the card isn't in the DOM.
 */
export function restoreReturnScroll(note: ArticleReturn) {
  const card = document.querySelector<HTMLElement>(
    `a[data-article-card][data-article-slug="${CSS.escape(note.slug)}"]`,
  );
  if (!card) return false;
  const viewport = window.innerHeight;
  const cover = card.querySelector<HTMLElement>("[data-card-cover]") ?? card;
  const rect = cover.getBoundingClientRect();
  const documentTop = rect.top + window.scrollY;
  const head =
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--articles-head"),
    ) || viewport * 0.27;
  const fold = head + viewport * FOLD_GAP;
  const fallback = documentTop - Math.max(viewport * RETURN_CARD_TOP, fold + 8);
  let top = note.scrollY ?? fallback;
  if (note.scrollY !== undefined) {
    const at = documentTop - note.scrollY;
    if (at < fold - rect.height * 0.15 || at + rect.height > viewport) top = fallback;
  }
  const max = document.documentElement.scrollHeight - viewport;
  window.scrollTo({ top: Math.round(Math.max(0, Math.min(top, max))), behavior: "instant" });
  return true;
}
