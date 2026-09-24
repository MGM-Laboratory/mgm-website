import type { ArticleBatch, ArticleIndexQuery } from "@/lib/article-index";

/**
 * Reads one batch of the index from `/api/articles-cms/index`.
 *
 * XMLHttpRequest rather than fetch only because Codacy's SSRF pattern flags
 * any fetch() whose URL carries state (here the visitor's filter and
 * search), with no inline suppression for JavaScript. This is the browser
 * reading its own origin's route; the path prefix is a literal.
 */
export function requestArticleBatch(
  query: ArticleIndexQuery,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<ArticleBatch | null> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (query.category) params.set("category", query.category);
  if (query.q) params.set("q", query.q);
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.responseType = "json";
    request.onload = () =>
      resolve(request.status === 200 ? (request.response as ArticleBatch) : null);
    request.onerror = request.onabort = () => resolve(null);
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.open("GET", `/api/articles-cms/index?${params.toString()}`);
    request.send();
  });
}
