import "server-only";

import { headers } from "next/headers";

import {
  API_READ_TIMEOUT_MS,
  API_UPLOAD_TIMEOUT_MS,
  API_WRITE_TIMEOUT_MS,
  fetchWithTimeout,
} from "@/lib/fetch-timeout";
import { visitorAddress } from "@/lib/forms/visitor-ip";

export const apiBaseUrl = () =>
  (
    process.env.CMS_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000/api"
  ).replace(/\/$/, "");

/**
 * How long to wait for the answer. A stream passes a large file on, and the API answers only after it has stored the whole file,
 * so a streamed body gets the upload limit. A read is quick, and a write with a body in memory is small.
 */
function timeoutFor(init?: RequestInit) {
  if ((init as { duplex?: string } | undefined)?.duplex === "half") return API_UPLOAD_TIMEOUT_MS;
  const method = (init?.method ?? "GET").toUpperCase();
  return method === "GET" || method === "HEAD" ? API_READ_TIMEOUT_MS : API_WRITE_TIMEOUT_MS;
}

/**
 * The address of the visitor whose request is being served. The API counts a call for the visitor that it names, but only when
 * the call also carries the passphrase of this server, which `cmsApi` adds. Without it every page render would count for the
 * address of this web server, and one visitor could use up the budget of all the others.
 */
async function visitorHeader(): Promise<Record<string, string>> {
  try {
    const ip = visitorAddress({ headers: await headers() } as unknown as Request);
    return ip ? { "x-visitor-ip": ip } : {};
  } catch (error) {
    // Next stops a static render with an error that carries a digest. It has to pass through, or the page would be built as a
    // static one with no visitor in it
    if (typeof (error as { digest?: unknown } | null)?.digest === "string") throw error;
    // There is no request outside a render or a route handler, for example in a unit test
    return {};
  }
}

export async function cmsApi(path: string, init?: RequestInit) {
  const visitor = await visitorHeader();
  return fetchWithTimeout(
    `${apiBaseUrl()}${path}`,
    {
      ...init,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-cms-passphrase": process.env.ADMIN_PASSPHRASE ?? "",
        ...visitor,
        ...init?.headers,
      },
    },
    timeoutFor(init),
  );
}
