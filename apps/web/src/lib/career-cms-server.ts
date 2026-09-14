import "server-only";

import { cmsApi } from "@/lib/cms-api";
import type { CmsJobApplicationRecord, CmsJobRecord } from "@/lib/career-cms";

export async function fetchCareerFeed(): Promise<CmsJobRecord[]> {
  const response = await cmsApi("/cms/jobs");
  if (!response.ok) return [];
  const payload = (await response.json()) as { records?: CmsJobRecord[] };
  return payload.records ?? [];
}

/** One role with its full document, or undefined for missing/draft records. */
export async function fetchCareerRecord(slug: string): Promise<CmsJobRecord | undefined> {
  const response = await cmsApi(`/cms/jobs/${encodeURIComponent(slug)}`);
  if (!response.ok) return undefined;
  const payload = (await response.json()) as { record?: CmsJobRecord };
  return payload.record;
}

export async function fetchCareerAdminList(): Promise<CmsJobRecord[]> {
  const response = await cmsApi("/cms/jobs/admin");
  if (!response.ok) return [];
  const payload = (await response.json()) as { records?: CmsJobRecord[] };
  return payload.records ?? [];
}

export async function fetchCareerApplications(): Promise<CmsJobApplicationRecord[]> {
  const response = await cmsApi("/cms/jobs/applications");
  if (!response.ok) return [];
  const payload = (await response.json()) as { records?: CmsJobApplicationRecord[] };
  return payload.records ?? [];
}
