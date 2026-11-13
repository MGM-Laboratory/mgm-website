import "server-only";

import { cache } from "react";

import { publishedArticles, type CmsArticleRecord } from "@/lib/article-cms";
import { fetchArticleFeed, fetchArticleRecord } from "@/lib/article-cms-server";
import { cmsApi } from "@/lib/cms-api";
import { membersFromRecords, type CmsMemberRecord } from "@/lib/member-cms";

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

/**
 * The member directory, for the bylines. A plain read of the CMS records,
 * because an article page never writes. Without records no author is named.
 */
export const readMembers = cache(
  async (): Promise<{ members: CmsMemberRecord["member"][]; records: CmsMemberRecord[] }> => {
    try {
      const response = await cmsApi("/cms/members");
      if (!response.ok) throw new Error("CMS member records could not be read");
      const data = (await response.json()) as { records?: CmsMemberRecord[] };
      const records = data.records ?? [];
      return { members: membersFromRecords(records), records };
    } catch {
      return { members: [], records: [] };
    }
  },
);
