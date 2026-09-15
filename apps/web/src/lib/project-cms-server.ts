import "server-only";

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
