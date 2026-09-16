import "server-only";

import { cmsApi } from "@/lib/cms-api";
import type { CmsContactInquiryRecord } from "@/lib/contact-inquiries-cms";

/** Returns the admin inquiry list, treating a non-success API response as empty. */
export async function fetchContactInquiries(): Promise<CmsContactInquiryRecord[]> {
  const response = await cmsApi("/cms/contact-inquiries");
  if (!response.ok) return [];
  const data = (await response.json()) as { records?: CmsContactInquiryRecord[] };
  return data.records ?? [];
}
