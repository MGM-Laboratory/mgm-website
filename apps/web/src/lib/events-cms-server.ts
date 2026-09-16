import "server-only";

import { cmsApi } from "@/lib/cms-api";
import type { CmsEventRecord, CmsEventRegistrationRecord } from "@/lib/events-cms";

/** The public feed: published events only, drafts filtered server-side. */
export async function fetchEventsFeed(): Promise<CmsEventRecord[]> {
  const response = await cmsApi("/cms/events");
  if (!response.ok) throw new Error("CMS event records could not be read");
  const data = (await response.json()) as { records?: CmsEventRecord[] };
  return data.records ?? [];
}

/** A single published event, or `undefined` if missing/unpublished. */
export async function fetchEventBySlug(slug: string): Promise<CmsEventRecord | undefined> {
  const response = await cmsApi(`/cms/events/${encodeURIComponent(slug)}`);
  if (!response.ok) return undefined;
  const data = (await response.json()) as { record?: CmsEventRecord };
  return data.record;
}

/** The admin list: every event, including unpublished drafts. */
export async function fetchEventAdminList(): Promise<CmsEventRecord[]> {
  const response = await cmsApi("/cms/events/admin");
  if (!response.ok) return [];
  const data = (await response.json()) as { records?: CmsEventRecord[] };
  return data.records ?? [];
}

export async function fetchEventRegistrations(): Promise<CmsEventRegistrationRecord[]> {
  const response = await cmsApi("/cms/events/registrations");
  if (!response.ok) return [];
  const data = (await response.json()) as { records?: CmsEventRegistrationRecord[] };
  return data.records ?? [];
}
