import "server-only";

import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";
import { formTokenCookieName, isFormSlug } from "@/lib/forms/public-server";
import { visitorAddress } from "@/lib/forms/visitor-ip";

/**
 * Shared plumbing of the public form routes (`/api/forms/**`): no session,
 * the visitor's address and client forwarded to the API (exactly like the
 * short-link click path), and the unlock cookie sent back as x-form-token.
 */

export type SlugContext = { params: Promise<{ slug: string }> };

export function visitorHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const ip = visitorAddress(request);
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

/** The API's body as JSON with its status, or a readable message when it isn't JSON. */
function relayText(text: string, status: number): NextResponse {
  try {
    return NextResponse.json(JSON.parse(text), { status });
  } catch {
    return NextResponse.json(
      {
        message:
          status === 413
            ? "The file is too large."
            : "Something went wrong on our side. Please try again.",
      },
      { status: status >= 400 ? status : 502 },
    );
  }
}

/** The API's answer relayed as JSON, whatever it sent. */
async function relay(response: Response): Promise<NextResponse> {
  return relayText(await response.text(), response.status);
}

const SMALL_BODY_BYTES = 64 * 1024;
/** The API's own JSON limit: a submission carries every answer at once. */
const RESPONSE_BODY_BYTES = 8 * 1024 * 1024;
const BODY_LIMITS = new Map<string, number>([
  ["unlock", SMALL_BODY_BYTES],
  ["events", SMALL_BODY_BYTES],
  ["responses", RESPONSE_BODY_BYTES],
]);

/**
 * The request body as text, read chunk by chunk and abandoned as soon as it
 * passes `limit` bytes (null then), so an oversized or endless body can't
 * fill the web server's memory before the API gets to refuse it.
 */
async function readLimitedText(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Resolves and checks the slug, then forwards a JSON POST with the visitor headers. */
export async function forwardPublicJson(
  request: Request,
  context: SlugContext,
  action: "unlock" | "events" | "responses",
): Promise<{ slug: string; response: NextResponse }> {
  const { slug } = await context.params;
  if (!isFormSlug(slug)) return { slug, response: notFound() };
  const text = await readLimitedText(request, BODY_LIMITS.get(action) ?? SMALL_BODY_BYTES);
  if (text === null) {
    return {
      slug,
      response: NextResponse.json({ message: "The request is too large." }, { status: 413 }),
    };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
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
