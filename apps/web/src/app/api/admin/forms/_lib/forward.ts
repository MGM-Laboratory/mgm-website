import "server-only";

import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

/**
 * Shared plumbing of the forms admin proxies (`/api/admin/forms/**`): every
 * route gates on the `forms` permission itself, then forwards here.
 */

export const enc = encodeURIComponent;

/** The API's path for one form. */
export function formPath(id: string, suffix = "") {
  return `/forms/admin/${enc(id)}${suffix}`;
}

/** The API's status and JSON body, or `fallback` as the message when the body isn't JSON. */
function relayJson(text: string, status: number, fallback: string): NextResponse {
  try {
    return NextResponse.json(JSON.parse(text), { status });
  } catch {
    return NextResponse.json({ message: fallback }, { status });
  }
}

/**
 * Forwards a CMS API call and relays its status and JSON body. A body that
 * isn't JSON (a gateway error page) becomes a JSON message instead of a
 * crash in the proxy.
 */
export async function forwardJson(path: string, init?: RequestInit): Promise<NextResponse> {
  let response: Response;
  try {
    response = await cmsApi(path, init);
  } catch {
    return NextResponse.json({ message: "The forms API is not reachable." }, { status: 502 });
  }
  const text = await response.text();
  return relayJson(
    text,
    response.status,
    text.slice(0, 300) || `Request failed (${response.status}).`,
  );
}

/** Forwards a JSON body as-is (400 when the browser sent something unreadable). */
export async function forwardBody(
  request: Request,
  path: string,
  method: "POST" | "PUT" | "PATCH",
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "The request body must be JSON." }, { status: 400 });
  }
  return forwardJson(path, { method, body: JSON.stringify(body) });
}

/** The request's own query string, passed through (`?a=1&b=2` or empty). */
export function passQuery(request: Request, keys: readonly string[]): string {
  const source = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = source.get(key);
    if (value !== null) query.set(key, value);
  }
  return query.size ? `?${query.toString()}` : "";
}

/**
 * Streams a raw body to the API without buffering (Node's fetch needs an
 * explicit duplex mode for that), with the headers the API reads.
 */
export async function streamUpload(
  request: Request,
  path: string,
  contentType = request.headers.get("content-type") ?? "application/octet-stream",
): Promise<NextResponse> {
  const headers: Record<string, string> = { "content-type": contentType };
  const length = request.headers.get("content-length");
  if (length) headers["content-length"] = length;
  const fileName = request.headers.get("x-file-name");
  if (fileName) headers["x-file-name"] = fileName;
  let response: Response;
  try {
    response = await cmsApi(path, {
      method: "POST",
      body: request.body,
      headers,
      duplex: "half",
    } as RequestInit);
  } catch {
    return NextResponse.json({ message: "The upload could not reach the API." }, { status: 502 });
  }
  const text = await response.text();
  return relayJson(
    text,
    response.status,
    response.status === 413 ? "The file is too large." : "The upload failed.",
  );
}
