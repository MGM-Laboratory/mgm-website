import "server-only";

import { cache } from "react";

import { MEMBERS } from "@/data/members";
import { publishedArticles, type CmsArticleRecord } from "@/lib/article-cms";
import { fetchArticleFeed, fetchArticleRecord } from "@/lib/article-cms-seed";
import { mergeMemberRecords, type CmsMemberRecord } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";

/**
 * The article page's reads, memoised per request with React's cache():
 * generateMetadata, generateViewport and the page itself all ask for the
 * same record, and it should cost one CMS round-trip, not three.
 *
 * Everything here only reads. The feed comes straight from the public feed
 * endpoint (no seeding fallback): the page needs it for the next article,
 * and an empty store simply has no next one.
 */

export const readArticle = cache(async (slug: string): Promise<CmsArticleRecord | undefined> => {
  try {
    return await fetchArticleRecord(slug);
  } catch {
    return undefined;
  }
});

export const readPublishedFeed = cache(async (): Promise<CmsArticleRecord[]> => {
  try {
    return publishedArticles(await fetchArticleFeed());
  } catch {
    return [];
  }
});

export const readMembers = cache(
  async (): Promise<{ members: CmsMemberRecord["member"][]; records: CmsMemberRecord[] }> => {
    try {
      const records = await ensureMemberCmsSeeded();
      return { members: mergeMemberRecords(MEMBERS, records), records };
    } catch {
      return { members: [...MEMBERS], records: [] };
    }
  },
);
