import "server-only";

import { SEED_RESEARCH } from "@/data/research";
import { cmsApi } from "@/lib/cms-api";
import type { CmsResearchRecord } from "@/lib/research-cms";

let bootstrapPromise: Promise<void> | undefined;

/** The admin list, including unpublished drafts. */
export async function fetchResearchAdminList(): Promise<CmsResearchRecord[]> {
  const response = await cmsApi("/cms/research/admin");
  if (!response.ok) throw new Error("CMS research records could not be read");
  const data = (await response.json()) as { records?: CmsResearchRecord[] };
  return data.records ?? [];
}

/**
 * Seeds the internal draft example when the store is empty. Uses the admin
 * list so a store holding only draft records counts as seeded and never
 * re-bootstraps. Called from the admin workspace only.
 */
export async function ensureResearchCmsSeeded() {
  const existing = await fetchResearchAdminList();
  if (existing.length) return existing;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const response = await cmsApi("/cms/research/bootstrap", {
        body: JSON.stringify({ records: SEED_RESEARCH }),
        method: "POST",
      });
      if (!response.ok) throw new Error("CMS research records could not be imported");
    })().catch((error) => {
      bootstrapPromise = undefined;
      throw error;
    });
  }

  await bootstrapPromise;
  return fetchResearchAdminList();
}

/** The public feed without BlockNote documents, small enough for every render. */
export async function fetchResearchFeed(): Promise<CmsResearchRecord[]> {
  const response = await cmsApi("/cms/research/feed");
  if (!response.ok) throw new Error("CMS research feed could not be read");
  const data = (await response.json()) as { records?: CmsResearchRecord[] };
  return data.records ?? [];
}

/** One published initiative with its document, or undefined when absent. */
export async function fetchResearchRecord(slug: string): Promise<CmsResearchRecord | undefined> {
  const response = await cmsApi(`/cms/research/${encodeURIComponent(slug)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("CMS research record could not be read");
  const data = (await response.json()) as { record?: CmsResearchRecord };
  return data.record;
}
