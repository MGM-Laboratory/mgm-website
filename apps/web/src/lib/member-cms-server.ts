import "server-only";

import { cmsApi } from "@/lib/cms-api";
import type { CmsMemberRecord } from "@/lib/member-cms";

export async function fetchMemberRecords() {
  const response = await cmsApi("/cms/members");
  if (!response.ok) throw new Error("CMS member records could not be read");
  const data = (await response.json()) as { records?: CmsMemberRecord[] };
  return data.records ?? [];
}
