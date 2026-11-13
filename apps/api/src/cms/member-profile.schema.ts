import { z } from "zod";

/**
 * Schemes that a profile link may use. The public member page renders the value as the href of a link, so any other
 * scheme (javascript:, data:, vbscript:) would run in the origin of the site when a visitor clicks it. The value is tested
 * as it is stored, with no trimming, because the page uses the stored value.
 */
const SAFE_LINK_PATTERN = /^(https?:\/\/|mailto:|tel:)/i;

/** A profile holds free text such as the bio, so the cap is generous. It stops a body that is only there to fill the table. */
export const MAX_PROFILE_JSON_LENGTH = 200_000;

/** Checks one list of the profile whose entries carry a link under `key`. An empty link is allowed, any other type is not. */
function checkLinks(
  profile: Record<string, unknown>,
  field: string,
  key: string,
  context: z.RefinementCtx,
) {
  const list = profile[field];
  if (list === undefined || list === null) return;
  if (!Array.isArray(list)) {
    context.addIssue({ code: "custom", path: [field], message: `${field} must be a list.` });
    return;
  }
  list.forEach((entry: unknown, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      context.addIssue({
        code: "custom",
        path: [field, index],
        message: "Each entry must be an object.",
      });
      return;
    }
    const url = (entry as Record<string, unknown>)[key];
    if (url === undefined || url === null || url === "") return;
    if (typeof url !== "string" || !SAFE_LINK_PATTERN.test(url)) {
      context.addIssue({
        code: "custom",
        path: [field, index, key],
        message:
          "Use a link that starts with https://, http://, mailto: or tel: and has no space before it.",
      });
    }
  });
}

/** The profile of a member as the editor sends it. The shape stays open, the links and the size are checked. */
export const memberProfileSchema = z
  .record(z.string(), z.unknown())
  .superRefine((profile, context) => {
    if (JSON.stringify(profile).length > MAX_PROFILE_JSON_LENGTH) {
      context.addIssue({ code: "custom", message: "The profile is too large." });
    }
    checkLinks(profile, "links", "url", context);
    checkLinks(profile, "certificates", "credentialUrl", context);
  });
