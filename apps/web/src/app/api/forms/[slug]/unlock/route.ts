import { FORM_TOKEN_MAX_AGE_SECONDS, formTokenCookieName } from "@/lib/forms/public-server";

import { forwardPublicJson, type SlugContext } from "../../_lib/public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A right passphrase answers the open form with its token; the token also
// goes into an HTTP-only cookie so the page and its writes stay unlocked.
export async function POST(request: Request, context: SlugContext) {
  const { slug, response } = await forwardPublicJson(request, context, "unlock");
  if (response.status !== 200) return response;
  const body = (await response.clone().json()) as { token?: unknown };
  if (typeof body.token === "string" && body.token) {
    response.cookies.set(formTokenCookieName(slug), body.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: FORM_TOKEN_MAX_AGE_SECONDS,
    });
  }
  return response;
}
