import "server-only";

import { DEFAULT_HOME_CONTENT, type HomeContent } from "@repo/shared";
import { cmsApi } from "@/lib/cms-api";

/**
 * The public homepage video block — falls back to "no video" if unreachable.
 * Network-level failures (not just non-2xx responses) must be caught here
 * too: an uncaught rejection would fail the whole homepage's server render.
 */
export async function fetchHomeContent(): Promise<HomeContent> {
  try {
    const response = await cmsApi("/cms/home");
    if (!response.ok) return DEFAULT_HOME_CONTENT;
    const data = (await response.json()) as { record?: HomeContent };
    return data.record ?? DEFAULT_HOME_CONTENT;
  } catch {
    return DEFAULT_HOME_CONTENT;
  }
}
