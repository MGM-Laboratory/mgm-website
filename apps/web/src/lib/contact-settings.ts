import "server-only";

import {
  contactSettingsSchema,
  DEFAULT_CONTACT_SETTINGS,
  type ContactSettings,
} from "@repo/shared";

import { cmsApi } from "@/lib/cms-api";

/** The part of the contact settings that the public page shows. The page is a client component, so everything that
 * it receives ends up in the HTML and the flight data. The other inboxes and the mail routing stay on the server. */
export type PublicContactSettings = Pick<ContactSettings, "address" | "lat" | "lng"> & {
  emails: string[];
};

function toPublic(settings: ContactSettings): PublicContactSettings {
  return {
    address: settings.address,
    lat: settings.lat,
    lng: settings.lng,
    emails: settings.emails.slice(0, 1),
  };
}

/** CMS-configurable contact details, with the same default the API falls
 * back to when no record has been saved yet — so the page never breaks just
 * because nobody has opened the CMS editor, or the API is briefly down.
 * The API route needs the admin passphrase, which `cmsApi` sends. A refusal is logged, because a wrong passphrase
 * on the web side would otherwise show the default details to every visitor without a sign.
 * Parsed through the same schema the API validates against (rather than
 * trusted as-is) so a stale/legacy-shaped or briefly-mismatched response
 * never crashes the page - it just falls back to the default settings. */
export async function fetchContactSettings(): Promise<PublicContactSettings> {
  try {
    const response = await cmsApi("/cms/contact-settings");
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.error("contact-settings: the API refused the passphrase of the web server");
      }
      return toPublic(DEFAULT_CONTACT_SETTINGS);
    }
    const data = (await response.json()) as { record?: unknown };
    const parsed = contactSettingsSchema.safeParse(data.record);
    return toPublic(parsed.success ? parsed.data : DEFAULT_CONTACT_SETTINGS);
  } catch {
    return toPublic(DEFAULT_CONTACT_SETTINGS);
  }
}
