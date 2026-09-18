import "server-only";

import {
  contactSettingsSchema,
  DEFAULT_CONTACT_SETTINGS,
  type ContactSettings,
} from "@repo/shared";

import { cmsApi } from "@/lib/cms-api";

/** CMS-configurable contact details, with the same default the API falls
 * back to when no record has been saved yet — so the page never breaks just
 * because nobody has opened the CMS editor, or the API is briefly down.
 * Parsed through the same schema the API validates against (rather than
 * trusted as-is) so a stale/legacy-shaped or briefly-mismatched response
 * never crashes the page - it just falls back to the default settings. */
export async function fetchContactSettings(): Promise<ContactSettings> {
  try {
    const response = await cmsApi("/cms/contact-settings");
    if (!response.ok) return DEFAULT_CONTACT_SETTINGS;
    const data = (await response.json()) as { record?: unknown };
    const parsed = contactSettingsSchema.safeParse(data.record);
    return parsed.success ? parsed.data : DEFAULT_CONTACT_SETTINGS;
  } catch {
    return DEFAULT_CONTACT_SETTINGS;
  }
}
