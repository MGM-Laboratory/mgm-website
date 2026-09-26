import "server-only";

import { NextResponse } from "next/server";

import { apiBaseUrl, cmsApi } from "@/lib/cms-api";

/**
 * Shared plumbing of the forms admin proxies (`/api/admin/forms/**`): every
 * route gates on the `forms` permission itself, then forwards here.
 */

export const enc = encodeURIComponent;

/** The API's path for one form. */
export function formPath(id: string, suffix = "") {
  return `/forms/admin/${enc(id)}${suffix}`;
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
  try {
    return NextResponse.json(JSON.parse(text), { status: response.status });
  } catch {
    return NextResponse.json(
      { message: text.slice(0, 300) || `Request failed (${response.status}).` },
      { status: response.status },
    );
  }
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
  extraHeaders: Record<string, string> = {},
): Promise<NextResponse> {
  const headers: Record<string, string> = {
    "content-type": request.headers.get("content-type") ?? "application/octet-stream",
    "x-cms-passphrase": process.env.ADMIN_PASSPHRASE ?? "",
    ...extraHeaders,
  };
  const length = request.headers.get("content-length");
  if (length) headers["content-length"] = length;
  const fileName = request.headers.get("x-file-name");
  if (fileName) headers["x-file-name"] = fileName;
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      body: request.body,
      headers,
      cache: "no-store",
      duplex: "half",
    } as RequestInit);
  } catch {
    return NextResponse.json({ message: "The upload could not reach the API." }, { status: 502 });
  }
  const text = await response.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: response.status });
  } catch {
    return NextResponse.json(
      { message: response.status === 413 ? "The file is too large." : "The upload failed." },
      { status: response.status },
    );
  }
}
