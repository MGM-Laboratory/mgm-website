import "server-only";

const apiBaseUrl = () =>
  (
    process.env.CMS_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000/api"
  ).replace(/\/$/, "");

export async function cmsApi(path: string, init?: RequestInit) {
  return fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-cms-passphrase": process.env.ADMIN_PASSPHRASE ?? "",
      ...init?.headers,
    },
  });
}
