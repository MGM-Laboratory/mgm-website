import type { ProjectThemeId } from "@repo/shared";

import type { Member, MemberAccent } from "@/data/members";
import { categorySlug } from "@/lib/article-index";
import {
  articleAuthors,
  articleCoverUrl,
  articleThemeId,
  formatArticleDate,
  type CmsArticleRecord,
} from "@/lib/article-cms";
import type { CmsMemberRecord } from "@/lib/member-cms";

import { buildStory, readingMinutes, type Story } from "./story-model";

/**
 * The article page's view model: everything the hero, the story and the
 * next-article threshold need, shaped once on the server. Client-safe (the
 * server page builds it; the client components only read it).
 */

export type DetailAuthor = {
  slug: string;
  name: string;
  role: string;
  initials: string;
  accent: MemberAccent;
  photoUrl?: string;
  /** Focal point and zoom the member's editor chose for the portrait. */
  photoPosition?: { x: number; y: number; zoom: number };
};

export type DetailCategory = { name: string; slug: string };

export type DetailNext = {
  slug: string;
  title: string;
  subtitle: string;
  themeId: ProjectThemeId;
  coverUrl?: string;
};

export type ArticleDetailData = {
  slug: string;
  title: string;
  subtitle: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  dateLabel: string;
  minutes: number;
  categories: DetailCategory[];
  coverUrl?: string;
  themeId: ProjectThemeId;
  authors: DetailAuthor[];
  next?: DetailNext;
};

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function roleOf(member: Member) {
  if (member.role === "Professor") return "Professor";
  const place = member.unit ?? member.division;
  return place ? `${place} · ${member.role}` : member.role;
}

function authorOf(member: Member, records: readonly CmsMemberRecord[]): DetailAuthor {
  const profile = records.find((record) => record.slug === member.slug)?.profile;
  const photoKey = profile?.photoKey;
  return {
    slug: member.slug,
    name: member.name,
    role: roleOf(member),
    initials: initialsOf(member.name),
    accent: member.accent,
    photoUrl: photoKey ? `/api/member-cms/media/${encodeURIComponent(photoKey)}` : undefined,
    photoPosition: profile?.photoPosition,
  };
}

/** The published article after `slug` in list order (newest first), wrapping around. */
function nextOf(feed: readonly CmsArticleRecord[], slug: string): DetailNext | undefined {
  if (feed.length < 2) return undefined;
  const index = feed.findIndex((record) => record.slug === slug);
  const record = index < 0 ? feed[0] : feed[(index + 1) % feed.length];
  if (!record || record.slug === slug) return undefined;
  const { article } = record;
  return {
    slug: record.slug,
    title: article.title,
    subtitle: article.subtitle ?? "",
    themeId: articleThemeId(article),
    coverUrl: articleCoverUrl(article.coverKey),
  };
}

export function articleDetailData(
  record: CmsArticleRecord,
  feed: readonly CmsArticleRecord[],
  members: readonly Member[],
  memberRecords: readonly CmsMemberRecord[],
): { data: ArticleDetailData; story: Story } {
  const { article } = record;
  const story = buildStory(record.slug, record.content);
  const seen = new Set<string>();
  const categories: DetailCategory[] = [];
  for (const name of article.categories) {
    const slug = categorySlug(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    categories.push({ name: name.trim(), slug });
  }
  return {
    story,
    data: {
      slug: record.slug,
      title: article.title,
      subtitle: article.subtitle ?? "",
      date: article.date,
      dateLabel: formatArticleDate(article.date).replace(/^[A-Za-z]+,\s*/, ""),
      minutes: readingMinutes(story),
      categories,
      coverUrl: articleCoverUrl(article.coverKey),
      themeId: articleThemeId(article),
      authors: articleAuthors(record, members).map((member) => authorOf(member, memberRecords)),
      next: nextOf(feed, record.slug),
    },
  };
}
