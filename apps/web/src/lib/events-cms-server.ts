import "server-only";

import { cmsApi } from "@/lib/cms-api";
import type { CmsEventRecord } from "@/lib/events-cms";

/** The public feed: published events only, drafts filtered server-side. */
export async function fetchEventsFeed(): Promise<CmsEventRecord[]> {
  const response = await cmsApi("/cms/events");
  if (!response.ok) throw new Error("CMS event records could not be read");
  const data = (await response.json()) as { records?: CmsEventRecord[] };
  return data.records ?? [];
}
