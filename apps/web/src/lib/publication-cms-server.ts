import "server-only";

import { cmsApi } from "@/lib/cms-api";
import type { CmsPublicationRecord } from "@/lib/publication-cms";

export async function fetchPublicationRecords() {
  const response = await cmsApi("/cms/publications");
  if (!response.ok) throw new Error("CMS publication records could not be read");
  const data = (await response.json()) as { records?: CmsPublicationRecord[] };
  return data.records ?? [];
}

/** The public feed — publication records are light by design. */
export async function fetchPublicationFeed() {
  const response = await cmsApi("/cms/publications/feed");
  if (!response.ok) throw new Error("CMS publication feed could not be read");
  const data = (await response.json()) as { records?: CmsPublicationRecord[] };
  return data.records ?? [];
}

/** One published publication, or undefined when absent. */
export async function fetchPublicationRecord(slug: string) {
  const response = await cmsApi(`/cms/publications/${encodeURIComponent(slug)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("CMS publication record could not be read");
  const data = (await response.json()) as { record?: CmsPublicationRecord };
  return data.record;
}
