import "server-only";

import type { FormSummary } from "@repo/shared";

import { cmsApi } from "@/lib/cms-api";

/** The forms list for the studio's first paint, fetched server-side. */
export async function fetchFormsAdminList(): Promise<FormSummary[]> {
  const response = await cmsApi("/forms/admin");
  if (!response.ok) return [];
  const body = (await response.json()) as { forms?: FormSummary[] };
  return body.forms ?? [];
}
