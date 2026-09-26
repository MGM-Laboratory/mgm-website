import "server-only";

import { cache } from "react";
import type { PublicFormPayload } from "@repo/shared";

import { fetchPublicForm, isFormSlug, readFormToken } from "@/lib/forms/public-server";

/**
 * One read per request, shared by `generateMetadata`, `generateViewport`
 * and the page (with the visitor's unlock token, when they hold one).
 * Slugs that could never exist skip the round trip.
 */
export const readPublicForm = cache(async (slug: string): Promise<PublicFormPayload | null> => {
  if (!isFormSlug(slug)) return null;
  return fetchPublicForm(slug, await readFormToken(slug));
});
