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
