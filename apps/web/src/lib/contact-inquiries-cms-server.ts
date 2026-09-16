import "server-only";

import { cmsApi } from "@/lib/cms-api";
import type { CmsContactInquiryRecord } from "@/lib/contact-inquiries-cms";

export async function fetchContactInquiries(): Promise<CmsContactInquiryRecord[]> {
  const response = await cmsApi("/cms/contact-inquiries");
  if (!response.ok) return [];
  const data = (await response.json()) as { records?: CmsContactInquiryRecord[] };
  return data.records ?? [];
}
