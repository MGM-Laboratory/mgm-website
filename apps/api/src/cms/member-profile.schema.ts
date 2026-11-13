import { z } from "zod";

/**
 * Schemes that a profile link may use. The public member page renders the value as the href of a link, so any other
 * scheme (javascript:, data:, vbscript:) would run in the origin of the site when a visitor clicks it.
 */
const SAFE_LINK_PATTERN = /^(https?:\/\/|mailto:|tel:)/i;

/** A profile holds free text such as the bio, so the cap is generous. It stops a body that is only there to fill the table. */
export const MAX_PROFILE_JSON_LENGTH = 200_000;

function readUrls(value: unknown, key: string): { path: (string | number)[]; url: string }[] {
  if (!Array.isArray(value)) return [];
  const found: { path: (string | number)[]; url: string }[] = [];
  value.forEach((item, index) => {
    const url = (item as Record<string, unknown> | null)?.[key];
    if (typeof url === "string" && url !== "") found.push({ path: [index, key], url });
  });
  return found;
}

/** The profile of a member as the editor sends it. The shape stays open, the URLs and the size are checked. */
export const memberProfileSchema = z
  .record(z.string(), z.unknown())
  .superRefine((profile, context) => {
    if (JSON.stringify(profile).length > MAX_PROFILE_JSON_LENGTH) {
      context.addIssue({ code: "custom", message: "The profile is too large." });
    }
    const checks: [string, string][] = [
      ["links", "url"],
      ["certificates", "credentialUrl"],
    ];
    for (const [field, key] of checks) {
      for (const { path, url } of readUrls(profile[field], key)) {
        if (!SAFE_LINK_PATTERN.test(url.trim())) {
          context.addIssue({
            code: "custom",
            path: [field, ...path],
            message: "Use a link that starts with https://, http://, mailto: or tel:.",
          });
        }
      }
    }
  });
