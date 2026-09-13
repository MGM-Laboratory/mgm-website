import type { Member } from "@/data/members";

/** A single BlockNote block as persisted in the CMS document. */
export type ArticleBlock = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: ArticleBlock[];
};

export type ArticleDraft = {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  categories: string[];
  authorSlugs: string[];
  draft: boolean;
  /** S3 media key, or a `static/<public-path>` key for bundled seed art. */
  coverKey?: string;
};

export type CmsArticleRecord = {
  article: ArticleDraft;
  content: ArticleBlock[];
  slug: string;
  updatedAt?: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isArticleSlug(value: string) {
  return SLUG_PATTERN.test(value);
}

export function emptyArticleDraft(): ArticleDraft {
  return {
    slug: "",
    title: "",
    subtitle: "",
    date: new Date().toISOString().slice(0, 10),
    categories: [],
    authorSlugs: [],
    draft: true,
  };
}

export function draftToArticle(draft: ArticleDraft): ArticleDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim(),
    categories: [...new Set(draft.categories.map((category) => category.trim()).filter(Boolean))],
    authorSlugs: [...new Set(draft.authorSlugs)],
  };
}

export function articleToDraft(article: ArticleDraft): ArticleDraft {
  return {
    ...article,
    subtitle: article.subtitle ?? "",
    categories: [...article.categories],
    authorSlugs: [...article.authorSlugs],
  };
}

export function articleAuthors(record: CmsArticleRecord, members: readonly Member[]) {
  return record.article.authorSlugs
    .map((slug) => members.find((member) => member.slug === slug))
    .filter((member): member is Member => Boolean(member));
}

export function publishedArticles(records: readonly CmsArticleRecord[]) {
  return records
    .filter((record) => !record.article.draft)
    .sort((left, right) => right.article.date.localeCompare(left.article.date));
}

/** Resolves a cover key to a loadable URL — bundled seed art or CMS media. */
export function articleCoverUrl(coverKey?: string) {
  if (!coverKey) return undefined;
  if (coverKey.startsWith("static/")) return `/${coverKey.slice("static/".length)}`;
  return `/api/articles-cms/media/${encodeURIComponent(coverKey)}`;
}

/** Formats an ISO date the way the article template does: "Sabtu, 31 Agustus 2024". */
export function formatArticleDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
