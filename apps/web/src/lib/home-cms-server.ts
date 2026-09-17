import "server-only";

import { DEFAULT_HOME_CONTENT, type HomeContent } from "@repo/shared";
import { cmsApi } from "@/lib/cms-api";

/** The public homepage video block — falls back to "no video" if unreachable. */
export async function fetchHomeContent(): Promise<HomeContent> {
  const response = await cmsApi("/cms/home");
  if (!response.ok) return DEFAULT_HOME_CONTENT;
  const data = (await response.json()) as { record?: HomeContent };
  return data.record ?? DEFAULT_HOME_CONTENT;
}
