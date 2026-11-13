import "server-only";

import { cmsApi } from "@/lib/cms-api";
import type { CmsArticleRecord } from "@/lib/article-cms";

export async function fetchArticleRecords() {
  const response = await cmsApi("/cms/articles");
  if (!response.ok) throw new Error("CMS article records could not be read");
  const data = (await response.json()) as { records?: CmsArticleRecord[] };
  return data.records ?? [];
}

/** The public feed without BlockNote documents, small enough for every render. */
export async function fetchArticleFeed() {
  const response = await cmsApi("/cms/articles/feed");
  if (!response.ok) throw new Error("CMS article feed could not be read");
  const data = (await response.json()) as { records?: CmsArticleRecord[] };
  return data.records ?? [];
}

/** One published article with its document, or undefined when absent. */
export async function fetchArticleRecord(slug: string) {
  const response = await cmsApi(`/cms/articles/${encodeURIComponent(slug)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("CMS article record could not be read");
  const data = (await response.json()) as { record?: CmsArticleRecord };
  return data.record;
}
