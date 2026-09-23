import "server-only";

import { cache } from "react";

import { cmsApi } from "@/lib/cms-api";
import type { CmsProjectRecord } from "@/lib/project-cms";

/** The admin list, including unpublished drafts. */
export async function fetchProjectAdminList(): Promise<CmsProjectRecord[]> {
  const response = await cmsApi("/cms/projects/admin");
  if (!response.ok) throw new Error("CMS project records could not be read");
  const data = (await response.json()) as { records?: CmsProjectRecord[] };
  return data.records ?? [];
}

/** The public feed without BlockNote documents, small enough for every render. */
export async function fetchProjectFeed(): Promise<CmsProjectRecord[]> {
  const response = await cmsApi("/cms/projects/feed");
  if (!response.ok) throw new Error("CMS project feed could not be read");
  const data = (await response.json()) as { records?: CmsProjectRecord[] };
  return data.records ?? [];
}

/** One published project with its document, or undefined when absent. */
export async function fetchProjectRecord(slug: string): Promise<CmsProjectRecord | undefined> {
  const response = await cmsApi(`/cms/projects/${encodeURIComponent(slug)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("CMS project record could not be read");
  const data = (await response.json()) as { record?: CmsProjectRecord };
  return data.record;
}

/**
 * Everything a project detail page renders from: the record (with the
 * measured sizes of media stored without one) and the published feed, which
 * decides the next project. Read once per request: the metadata, the
 * viewport and the page itself all ask for it. A failed read counts as a
 * missing record (the page then 404s) or an empty feed (no next project).
 */
export const readProjectDetail = cache(async (slug: string) => {
  const [record, feed] = await Promise.all([
    fetchProjectRecord(slug).catch(() => undefined),
    fetchProjectFeed().catch(() => [] as CmsProjectRecord[]),
  ]);
  return { record, feed };
});
