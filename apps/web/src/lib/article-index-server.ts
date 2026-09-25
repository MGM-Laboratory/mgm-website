import "server-only";

import { MEMBERS, type Member } from "@/data/members";
import { publishedArticles, type CmsArticleRecord } from "@/lib/article-cms";
import { ensureArticleCmsSeeded, ensureArticleFeed } from "@/lib/article-cms-seed";
import {
  articleCategories,
  hasCategory,
  toArticleCard,
  type ArticleBatch,
  type ArticleCategory,
  type ArticleIndexQuery,
} from "@/lib/article-index";
import { bodyText, searchArticles, tokenize } from "@/lib/article-search";
import { mergeMemberRecords } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";

/**
 * Server reads behind the /articles index: the page renders the first batch
 * with them and `/api/articles/index` serves the batches after it while the
 * visitor scrolls.
 *
 * The page always reads fresh (an editor's publish shows on the next load),
 * and every read primes a short-lived copy the batch route reuses, so a
 * visitor scrolling through a dozen batches doesn't refetch the whole feed
 * from the CMS a dozen times. Full records (with their documents) are only
 * read for a text search, and cached the same way.
 */

const FEED_TTL_MS = 10_000;
const FULL_TTL_MS = 30_000;
const MEMBERS_TTL_MS = 60_000;

type Cached<T> = { value: T; at: number } | undefined;

let feedCache: Cached<CmsArticleRecord[]>;
let fullCache: Cached<CmsArticleRecord[]>;
let membersCache: Cached<readonly Member[]>;

/** The cached value while it is younger than `ttl`, else undefined. */
function freshValue<T>(entry: Cached<T>, ttl: number): T | undefined {
  return entry && Date.now() - entry.at < ttl ? entry.value : undefined;
}

/**
 * One CMS read in flight per copy: requests arriving while it runs share
 * it, so a burst (the first visitors, or a copy expiring under load) costs
 * one round trip instead of one each.
 */
function coalesced<T>(read: () => Promise<T>) {
  let flight: Promise<T> | null = null;
  return () => {
    flight ??= read().finally(() => {
      flight = null;
    });
    return flight;
  };
}

const fetchFeed = coalesced(async () => {
  const value = publishedArticles(await ensureArticleFeed());
  feedCache = { value, at: Date.now() };
  return value;
});

const fetchFullRecords = coalesced(async () => {
  const value = publishedArticles(await ensureArticleCmsSeeded());
  fullCache = { value, at: Date.now() };
  return value;
});

const fetchMembers = coalesced(async () => {
  const value = mergeMemberRecords(MEMBERS, await ensureMemberCmsSeeded());
  membersCache = { value, at: Date.now() };
  return value;
});

async function readFeed(reuse: boolean) {
  const cached = reuse ? freshValue(feedCache, FEED_TTL_MS) : undefined;
  if (cached) return cached;
  try {
    return await fetchFeed();
  } catch {
    // A CMS outage keeps the last good copy rather than emptying the list.
    return feedCache?.value ?? [];
  }
}

/**
 * Whether the full records hold every article in the feed, as saved now. A
 * record without a revision can't be proven current, so it never counts.
 */
function coversFeed(full: readonly CmsArticleRecord[], feed: readonly CmsArticleRecord[]) {
  const saved = new Map(full.map((record) => [record.slug, record.updatedAt]));
  return feed.every(
    (record) => record.updatedAt !== undefined && saved.get(record.slug) === record.updatedAt,
  );
}

/**
 * Full records for a search. The copy is reused only while it still holds
 * every article the (fresher) feed lists, as saved: a publish or an edit
 * shows up in search at once instead of after the copy expires.
 */
async function readFullRecords(feed: readonly CmsArticleRecord[]) {
  const cached = freshValue(fullCache, FULL_TTL_MS);
  if (cached && coversFeed(cached, feed)) return cached;
  try {
    return await fetchFullRecords();
  } catch {
    return fullCache?.value ?? [];
  }
}

async function readMembers() {
  const cached = freshValue(membersCache, MEMBERS_TTL_MS);
  if (cached) return cached;
  try {
    return await fetchMembers();
  } catch {
    return membersCache?.value ?? [...MEMBERS];
  }
}

/**
 * Whether every term of the query appears somewhere in the article (title,
 * subtitle, categories, authors or body). The ranking search forgives typos
 * and partial words, which is right for ordering but far too loose for a
 * list that filters: "kit-build" alone matched 194 of 209 articles.
 */
function containsEveryTerm(
  record: CmsArticleRecord,
  terms: readonly string[],
  members: readonly Member[],
) {
  const { article } = record;
  const authors = article.authorSlugs
    .map((slug) => members.find((member) => member.slug === slug)?.name ?? "")
    .join(" ");
  const haystack = [
    article.title,
    article.subtitle ?? "",
    article.categories.join(" "),
    authors,
    bodyText(record),
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** The records a query selects, in the order the list shows them. */
async function selectRecords(
  feed: readonly CmsArticleRecord[],
  query: ArticleIndexQuery,
  members: readonly Member[],
) {
  let records: readonly CmsArticleRecord[] = feed;
  if (query.q) {
    // Rank over the full documents, then keep the feed's own (light) records.
    const full = await readFullRecords(feed);
    const terms = tokenize(query.q);
    // Nothing searchable in the query (punctuation only): nothing matches.
    const matching = terms.length
      ? full.filter((record) => containsEveryTerm(record, terms, members))
      : [];
    const bySlug = new Map(feed.map((record) => [record.slug, record]));
    const ranked = searchArticles(matching, query.q, Number.POSITIVE_INFINITY).map(
      (result) => result.slug,
    );
    // A match the ranking scores at zero (an author's name, say) still
    // belongs in the list: it follows the ranked ones, newest first.
    const rankedSet = new Set(ranked);
    const rest = matching
      .filter((record) => !rankedSet.has(record.slug))
      .sort((left, right) => right.article.date.localeCompare(left.article.date))
      .map((record) => record.slug);
    records = [...ranked, ...rest].flatMap((slug) => {
      const record = bySlug.get(slug);
      return record ? [record] : [];
    });
  }
  if (query.category) {
    const slug = query.category;
    records = records.filter((record) => hasCategory(record, slug));
  }
  return records;
}

export type ArticleIndexResult = ArticleBatch & {
  /** Every category across the whole published list (not only the matches). */
  categories: ArticleCategory[];
  /** Published articles in total, whatever the query. */
  all: number;
};

export async function readArticleIndex(
  query: ArticleIndexQuery,
  { offset = 0, limit, reuse = false }: { offset?: number; limit: number; reuse?: boolean },
): Promise<ArticleIndexResult> {
  const [feed, members] = await Promise.all([readFeed(reuse), readMembers()]);
  const records = await selectRecords(feed, query, members);
  const start = Math.max(0, Math.min(offset, records.length));
  const end = Math.min(records.length, start + Math.max(0, limit));
  return {
    items: records.slice(start, end).map((record) => toArticleCard(record, members)),
    total: records.length,
    offset: start,
    nextOffset: end < records.length ? end : null,
    categories: articleCategories(feed),
    all: feed.length,
  };
}
