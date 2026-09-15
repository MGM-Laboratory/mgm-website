import "server-only";

import { DEFAULT_CONTACT_SETTINGS, type ContactSettings } from "@repo/shared";

import { cmsApi } from "@/lib/cms-api";

/** CMS-configurable contact details, with the same default the API falls
 * back to when no record has been saved yet — so the page never breaks just
 * because nobody has opened the CMS editor, or the API is briefly down. */
export async function fetchContactSettings(): Promise<ContactSettings> {
  try {
    const response = await cmsApi("/cms/contact-settings");
    if (!response.ok) return DEFAULT_CONTACT_SETTINGS;
    const data = (await response.json()) as { record?: ContactSettings };
    return data.record ?? DEFAULT_CONTACT_SETTINGS;
  } catch {
    return DEFAULT_CONTACT_SETTINGS;
  }
}
