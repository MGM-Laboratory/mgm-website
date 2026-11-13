import "server-only";

import { visitorAddress } from "@/lib/forms/visitor-ip";

/**
 * The visitor's address and client, to forward to the API. The API believes them only when the request also carries the
 * CMS passphrase of this server (`cmsApi` adds it), so a caller that talks to the API directly cannot choose its own address.
 */
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

/** The visitor headers and the passphrase that proves them, for a call that does not go through `cmsApi`. */
export function provenVisitorHeaders(request: Request): Record<string, string> {
  return {
    "x-cms-passphrase": process.env.ADMIN_PASSPHRASE ?? "",
    ...visitorHeaders(request),
  };
}
