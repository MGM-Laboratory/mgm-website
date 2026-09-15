import "server-only";

import type { CmsAdminRecord } from "@/lib/admin-permissions";
import { cmsApi } from "@/lib/cms-api";

/** The managed admin accounts, for the Admin Management workspace. */
export async function fetchAdminAccounts() {
  const response = await cmsApi("/cms/admins");
  if (!response.ok) throw new Error("Admin accounts could not be read");
  const data = (await response.json()) as { records?: CmsAdminRecord[] };
  return data.records ?? [];
}
