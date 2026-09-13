import "server-only";

import { SEED_ARTICLES } from "@/data/articles";
import { cmsApi } from "@/lib/cms-api";
import type { CmsArticleRecord } from "@/lib/article-cms";

let bootstrapPromise: Promise<void> | undefined;

async function requestRecords() {
  const response = await cmsApi("/cms/articles");
  if (!response.ok) throw new Error("CMS article records could not be read");
  const data = (await response.json()) as { records?: CmsArticleRecord[] };
  return data.records ?? [];
}

export async function ensureArticleCmsSeeded() {
  const existing = await requestRecords();
  if (existing.length) return existing;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const response = await cmsApi("/cms/articles/bootstrap", {
        body: JSON.stringify({ records: SEED_ARTICLES }),
        method: "POST",
      });
      if (!response.ok) throw new Error("CMS article records could not be imported");
    })().catch((error) => {
      bootstrapPromise = undefined;
      throw error;
    });
  }

  await bootstrapPromise;
  return requestRecords();
}

/** The public feed without BlockNote documents, small enough for every render. */
export async function fetchArticleFeed() {
  const response = await cmsApi("/cms/articles/feed");
  if (!response.ok) throw new Error("CMS article feed could not be read");
  const data = (await response.json()) as { records?: CmsArticleRecord[] };
  return data.records ?? [];
}

/** A published feed that seeds the starter set first when the store is empty. */
export async function ensureArticleFeed() {
  const feed = await fetchArticleFeed();
  if (feed.length) return feed;
  await ensureArticleCmsSeeded();
  return fetchArticleFeed();
}

/** One published article with its document, or undefined when absent. */
export async function fetchArticleRecord(slug: string) {
  const response = await cmsApi(`/cms/articles/${encodeURIComponent(slug)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("CMS article record could not be read");
  const data = (await response.json()) as { record?: CmsArticleRecord };
  return data.record;
}
