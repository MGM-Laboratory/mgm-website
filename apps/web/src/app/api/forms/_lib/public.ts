import "server-only";

import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";
import { formTokenCookieName, isFormSlug } from "@/lib/forms/public-server";

/**
 * Shared plumbing of the public form routes (`/api/forms/**`): no session,
 * the visitor's address and client forwarded to the API (exactly like the
 * short-link click path), and the unlock cookie sent back as x-form-token.
 */

export type SlugContext = { params: Promise<{ slug: string }> };

export function visitorHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip") ?? forwardedFor;
  if (ip) headers["x-visitor-ip"] = ip;
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["x-visitor-user-agent"] = userAgent;
  const referer = request.headers.get("referer");
  if (referer) headers["x-visitor-referer"] = referer;
  return headers;
}

/** The unlock token: the page's explicit header, else the slug's cookie. */
function tokenHeader(request: Request, slug: string): Record<string, string> {
  const explicit = request.headers.get("x-form-token");
  if (explicit) return { "x-form-token": explicit };
  const name = formTokenCookieName(slug);
  const cookie = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  const value = cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
  return value ? { "x-form-token": value } : {};
}

export function notFound() {
  return NextResponse.json({ message: "That form does not exist." }, { status: 404 });
}

/** The API's answer relayed as JSON, whatever it sent. */
async function relay(response: Response): Promise<NextResponse> {
  const text = await response.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: response.status });
  } catch {
    return NextResponse.json(
      {
        message:
          response.status === 413
            ? "The file is too large."
            : "Something went wrong on our side. Please try again.",
      },
      { status: response.status >= 400 ? response.status : 502 },
    );
  }
}

/** Resolves and checks the slug, then forwards a JSON POST with the visitor headers. */
export async function forwardPublicJson(
  request: Request,
  context: SlugContext,
  action: "unlock" | "events" | "responses",
): Promise<{ slug: string; response: NextResponse }> {
  const { slug } = await context.params;
  if (!isFormSlug(slug)) return { slug, response: notFound() };
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      slug,
      response: NextResponse.json({ message: "The request body must be JSON." }, { status: 400 }),
    };
  }
  try {
    const upstream = await cmsApi(`/forms/public/${encodeURIComponent(slug)}/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { ...visitorHeaders(request), ...tokenHeader(request, slug) },
    });
    return { slug, response: await relay(upstream) };
  } catch {
    return {
      slug,
      response: NextResponse.json(
        { message: "We could not reach the form right now. Please try again." },
        { status: 502 },
      ),
    };
  }
}

const maxUploadBytes = () => Number(process.env.FORMS_MAX_UPLOAD_BYTES ?? 104_857_600);

/**
 * Streams a respondent's raw file to the API (never `formData()`, never
 * buffered), with its type, size and URI-encoded name.
 */
export async function forwardPublicUpload(
  request: Request,
  context: SlugContext,
): Promise<NextResponse> {
  const { slug } = await context.params;
  if (!isFormSlug(slug)) return notFound();
  const length = Number(request.headers.get("content-length"));
  if (length && length > maxUploadBytes()) {
    return NextResponse.json({ message: "The file is too large." }, { status: 413 });
  }
  const source = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["fieldId", "sessionId"]) {
    const value = source.get(key);
    if (value !== null) query.set(key, value);
  }
  const headers: Record<string, string> = {
    ...visitorHeaders(request),
    ...tokenHeader(request, slug),
    "content-type": request.headers.get("content-type") || "application/octet-stream",
  };
  if (length) headers["content-length"] = String(length);
  const fileName = request.headers.get("x-file-name");
  if (fileName) headers["x-file-name"] = fileName;
  try {
    const upstream = await cmsApi(
      `/forms/public/${encodeURIComponent(slug)}/uploads?${query.toString()}`,
      { method: "POST", body: request.body, headers, duplex: "half" } as RequestInit,
    );
    return relay(upstream);
  } catch {
    return NextResponse.json(
      { message: "The upload could not be completed. Please try again." },
      { status: 502 },
    );
  }
}
