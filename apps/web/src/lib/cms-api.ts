import "server-only";

import {
  API_READ_TIMEOUT_MS,
  API_UPLOAD_TIMEOUT_MS,
  API_WRITE_TIMEOUT_MS,
  fetchWithTimeout,
} from "@/lib/fetch-timeout";

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

export async function cmsApi(path: string, init?: RequestInit) {
  return fetchWithTimeout(
    `${apiBaseUrl()}${path}`,
    {
      ...init,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-cms-passphrase": process.env.ADMIN_PASSPHRASE ?? "",
        ...init?.headers,
      },
    },
    timeoutFor(init),
  );
}
