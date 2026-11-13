import "server-only";

import { API_READ_TIMEOUT_MS, API_WRITE_TIMEOUT_MS, fetchWithTimeout } from "@/lib/fetch-timeout";

export const apiBaseUrl = () =>
  (
    process.env.CMS_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000/api"
  ).replace(/\/$/, "");

export async function cmsApi(path: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  const read = method === "GET" || method === "HEAD";
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
    read ? API_READ_TIMEOUT_MS : API_WRITE_TIMEOUT_MS,
  );
}
