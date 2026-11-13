import "server-only";

import { cookies } from "next/headers";

import { FORM_SLUG_PATTERN, type PublicFormPayload } from "@repo/shared";

import { cmsApi } from "@/lib/cms-api";

/**
 * Server-side reads for the public form page (`/forms/[slug]`). The unlock
 * route stores a passphrase form's token in an HTTP-only cookie named after
 * the slug; the page reads it here and sends it back with its fetch.
 */

/** Twelve hours, the lifetime of the API's unlock token. */
export const FORM_TOKEN_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Whether a URL segment can be a form slug at all (anything else is a 404 without a fetch). */
export function isFormSlug(slug: string) {
  return slug.length <= 80 && FORM_SLUG_PATTERN.test(slug);
}

export function formTokenCookieName(slug: string) {
  return `mgm_form_${slug}`;
}

/** The unlock token this visitor holds for a form, if any. */
export async function readFormToken(slug: string): Promise<string | undefined> {
  if (!isFormSlug(slug)) return undefined;
  const store = await cookies();
  return store.get(formTokenCookieName(slug))?.value || undefined;
}

/**
 * The public payload of a form: `null` only when the API answers 404 (the
 * form doesn't exist or is a draft). Any other failure, including no answer
 * within 5 seconds, throws so the page shows the error page and not a 404.
 */
export async function fetchPublicForm(
  slug: string,
  token?: string,
): Promise<PublicFormPayload | null> {
  if (!isFormSlug(slug)) return null;
  const response = await cmsApi(`/forms/public/${encodeURIComponent(slug)}`, {
    headers: token ? { "x-form-token": token } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Public form could not be read");
  return (await response.json()) as PublicFormPayload;
}
