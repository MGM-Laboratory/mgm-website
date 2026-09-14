import type { ArticleBlock, CmsArticleRecord } from "@/lib/article-cms";

export type ArticleSearchResult = {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  categories: string[];
  coverKey?: string;
  snippet: string;
  score: number;
};

/** Ranked fields: a title hit outweighs a body hit. */
const FIELD_WEIGHTS = { title: 4, subtitle: 3, categories: 2.5, text: 1 } as const;

/** Metadata keys that carry no prose and must not feed the word index. */
const SKIPPED_KEYS = new Set(["type", "href", "url", "id", "styles", "level"]);

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Bounded edit distance; anything past the cap is reported as cap + 1. */
function levenshtein(left: string, right: string, cap: number) {
  if (Math.abs(left.length - right.length) > cap) return cap + 1;
  let prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= right.length; j += 1) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[right.length];
}

/**
 * A term matches a word when it is exact, contained, or a small typo away.
 * Short terms forgive one keystroke, longer ones forgive two.
 */
function termHits(term: string, words: readonly string[]) {
  const cap = term.length <= 4 ? 1 : 2;
  for (const word of words) {
    if (word === term || word.includes(term)) return true;
  }
  for (const word of words) {
    if (levenshtein(term, word, cap) <= cap) return true;
  }
  return false;
}

function collectInlineWords(node: unknown, words: string[]) {
  if (typeof node === "string") {
    words.push(...tokenize(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectInlineWords(item, words);
    return;
  }
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") {
      words.push(...tokenize(record.text));
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      if (!SKIPPED_KEYS.has(key)) collectInlineWords(value, words);
    }
  }
}

function blockWords(blocks: ArticleBlock[]) {
  const words: string[] = [];
  for (const block of blocks) {
    if (block.type === "image") {
      const caption = (block.props as { caption?: unknown } | undefined)?.caption;
      if (typeof caption === "string") words.push(...tokenize(caption));
      continue;
    }
    collectInlineWords(block.content, words);
  }
  return words;
}

/** Every prose chunk of an article, joined for snippet extraction. */
function bodyText(record: CmsArticleRecord) {
  const parts: string[] = [];
  for (const block of record.content) {
    const collect = (node: unknown): string => {
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(collect).join(" ");
      if (node && typeof node === "object") {
        const recordNode = node as Record<string, unknown>;
        if (typeof recordNode.text === "string") return recordNode.text;
        return Object.entries(recordNode)
          .filter(([key]) => !SKIPPED_KEYS.has(key))
          .map(([, value]) => collect(value))
          .join(" ");
      }
      return "";
    };
    const text = collect(block.content);
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join(" ");
}

/** A short context window around the first term the query matches. */
function buildSnippet(record: CmsArticleRecord, terms: string[]) {
  const full = bodyText(record);
  const lowered = full.toLowerCase();
  let index = -1;
  for (const term of terms) {
    index = lowered.indexOf(term);
    if (index >= 0) break;
  }
  const cap = 90;
  if (index < 0) {
    const fallback = record.article.subtitle || full;
    return fallback.length > cap * 2 ? `${fallback.slice(0, cap * 2).trim()}...` : fallback;
  }
  const start = Math.max(0, index - cap);
  const end = Math.min(full.length, index + cap);
  return `${start > 0 ? "..." : ""}${full.slice(start, end).trim()}${end < full.length ? "..." : ""}`;
}

/**
 * Fuzzy search over the full corpus: titles, subtitles, categories, captions
 * and every block of body text. Results rank by weighted term hits with a
 * bonus for the whole phrase appearing in the title or subtitle.
 */
export function searchArticles(
  records: readonly CmsArticleRecord[],
  query: string,
  limit = 20,
): ArticleSearchResult[] {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const normalizedQuery = query.toLowerCase().trim();
  const results: ArticleSearchResult[] = [];

  for (const record of records) {
    const { article } = record;
    if (article.draft) continue;

    const titleWords = tokenize(article.title);
    const subtitleWords = tokenize(article.subtitle ?? "");
    const categoryWords = tokenize(article.categories.join(" "));
    const bodyWords = blockWords(record.content);

    let score = 0;
    for (const term of terms) {
      if (termHits(term, titleWords)) score += FIELD_WEIGHTS.title;
      if (termHits(term, subtitleWords)) score += FIELD_WEIGHTS.subtitle;
      if (termHits(term, categoryWords)) score += FIELD_WEIGHTS.categories;
      if (termHits(term, bodyWords)) score += FIELD_WEIGHTS.text;
    }
    if (article.title.toLowerCase().includes(normalizedQuery)) score += 5;
    else if ((article.subtitle ?? "").toLowerCase().includes(normalizedQuery)) score += 2;
    if (score <= 0) continue;

    results.push({
      slug: record.slug,
      title: article.title,
      subtitle: article.subtitle ?? "",
      date: article.date,
      categories: [...article.categories],
      coverKey: article.coverKey,
      snippet: buildSnippet(record, terms),
      score,
    });
  }

  return results
    .sort((left, right) => right.score - left.score || right.date.localeCompare(left.date))
    .slice(0, limit);
}

export type SnippetSegment = { text: string; hit: boolean };

/** Splits a snippet into highlighted and plain segments for the search grid. */
export function highlightSnippet(snippet: string, query: string): SnippetSegment[] {
  const terms = tokenize(query);
  if (!terms.length) return [{ text: snippet, hit: false }];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return snippet
    .split(pattern)
    .map((text) => ({ text, hit: terms.some((term) => text.toLowerCase() === term) }));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
