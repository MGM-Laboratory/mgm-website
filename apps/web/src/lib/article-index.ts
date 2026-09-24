import type { ProjectThemeId } from "@repo/shared";

import type { Member } from "@/data/members";
import {
  articleAuthors,
  articleCoverUrl,
  articleThemeId,
  slugify,
  type CmsArticleRecord,
} from "@/lib/article-cms";

/**
 * The /articles index's data model, shared by the server page, the batch
 * route and the client list. Everything the list needs for a card (and for
 * the world to open it: the theme) travels in one small object; BlockNote
 * documents never reach the index.
 */

/** Cards per request: the first screenful plus the next row or two. */
export const ARTICLE_BATCH_SIZE = 12;
/** The most a single batch request may ask for. */
export const ARTICLE_BATCH_MAX = 36;
/** A search query longer than this is cut (it only ever feeds a ranking). */
export const ARTICLE_QUERY_MAX = 120;

export type ArticleCardData = {
  slug: string;
  title: string;
  /** The short description under the title (the article's subtitle). */
  subtitle: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  categories: string[];
  coverUrl?: string;
  themeId: ProjectThemeId;
  authors: { slug: string; name: string }[];
};

export type ArticleCategory = {
  /** URL value (`?category=`), the slugified name. */
  slug: string;
  name: string;
  count: number;
};

export type ArticleIndexQuery = {
  /** A category slug, or undefined for every article. */
  category?: string;
  /** Free text; empty or undefined means no search. */
  q?: string;
};

export type ArticleBatch = {
  items: ArticleCardData[];
  /** Matches for the query in total (not just this batch). */
  total: number;
  offset: number;
  /** Where the next batch starts, or null once the list has run out. */
  nextOffset: number | null;
};

export function categorySlug(name: string) {
  return slugify(name);
}

/** Every category with its article count, most used first (ties by name). */
export function articleCategories(records: readonly CmsArticleRecord[]): ArticleCategory[] {
  const byslug = new Map<string, ArticleCategory>();
  for (const record of records) {
    // A category listed twice on one article still counts that article once.
    const seen = new Set<string>();
    for (const name of record.article.categories) {
      const slug = categorySlug(name);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const entry = byslug.get(slug);
      if (entry) entry.count += 1;
      else byslug.set(slug, { slug, name: name.trim(), count: 1 });
    }
  }
  return [...byslug.values()].sort(
    (left, right) => right.count - left.count || left.name.localeCompare(right.name),
  );
}

export function hasCategory(record: CmsArticleRecord, slug: string) {
  return record.article.categories.some((name) => categorySlug(name) === slug);
}

export function toArticleCard(
  record: CmsArticleRecord,
  members: readonly Member[],
): ArticleCardData {
  const { article } = record;
  return {
    slug: record.slug,
    title: article.title,
    subtitle: article.subtitle ?? "",
    date: article.date,
    categories: [...article.categories],
    coverUrl: articleCoverUrl(article.coverKey),
    themeId: articleThemeId(article),
    authors: articleAuthors(record, members).map((member) => ({
      slug: member.slug,
      name: member.name,
    })),
  };
}

/** Reads `?category=` and `?q=` the way every reader of the index does. */
export function readArticleIndexQuery(params: {
  category?: string | string[] | null;
  q?: string | string[] | null;
}): ArticleIndexQuery {
  const first = (value: string | string[] | null | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? undefined;
  const category = first(params.category)?.trim().toLowerCase();
  const q = first(params.q)?.trim().slice(0, ARTICLE_QUERY_MAX);
  return {
    category: category && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category) ? category : undefined,
    q: q || undefined,
  };
}

/** The /articles URL for a query (no params for the unfiltered list). */
export function articleIndexHref(query: ArticleIndexQuery) {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.q) params.set("q", query.q);
  const search = params.toString();
  return search ? `/articles?${search}` : "/articles";
}

/** The published article after `slug` in list order, wrapping around. */
export function nextArticleSlug(records: readonly CmsArticleRecord[], slug: string) {
  if (records.length < 2) return undefined;
  const index = records.findIndex((record) => record.slug === slug);
  if (index < 0) return records[0]?.slug;
  return records[(index + 1) % records.length].slug;
}
