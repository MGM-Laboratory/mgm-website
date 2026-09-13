import "server-only";

import { SEED_PUBLICATIONS } from "@/data/publications";
import { cmsApi } from "@/lib/cms-api";
import type { CmsPublicationRecord } from "@/lib/publication-cms";

let bootstrapPromise: Promise<void> | undefined;

async function requestRecords() {
  const response = await cmsApi("/cms/publications");
  if (!response.ok) throw new Error("CMS publication records could not be read");
  const data = (await response.json()) as { records?: CmsPublicationRecord[] };
  return data.records ?? [];
}

export async function ensurePublicationCmsSeeded() {
  const existing = await requestRecords();
  if (existing.length) return existing;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const response = await cmsApi("/cms/publications/bootstrap", {
        body: JSON.stringify({ records: SEED_PUBLICATIONS }),
        method: "POST",
      });
      if (!response.ok) throw new Error("CMS publication records could not be imported");
    })().catch((error) => {
      bootstrapPromise = undefined;
      throw error;
    });
  }

  await bootstrapPromise;
  return requestRecords();
}

/** The public feed — publication records are light by design. */
export async function fetchPublicationFeed() {
  const response = await cmsApi("/cms/publications/feed");
  if (!response.ok) throw new Error("CMS publication feed could not be read");
  const data = (await response.json()) as { records?: CmsPublicationRecord[] };
  return data.records ?? [];
}

/** A published feed that seeds the starter set first when the store is empty. */
export async function ensurePublicationFeed() {
  const feed = await fetchPublicationFeed();
  if (feed.length) return feed;
  await ensurePublicationCmsSeeded();
  return fetchPublicationFeed();
}

/** One published publication, or undefined when absent. */
export async function fetchPublicationRecord(slug: string) {
  const response = await cmsApi(`/cms/publications/${encodeURIComponent(slug)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("CMS publication record could not be read");
  const data = (await response.json()) as { record?: CmsPublicationRecord };
  return data.record;
}
