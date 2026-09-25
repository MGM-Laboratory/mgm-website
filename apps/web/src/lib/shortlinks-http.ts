import { NextResponse } from "next/server";

import { renderShortlinkPage, renderShortlinkUnavailable } from "@/lib/shortlinks-pages";

/**
 * The short-link request path, shared by /s/[slug] (links on the site's own
 * domain) and the root catch-all (links at the root of custom domains). The
 * redirect itself is one API call and one 302: no page, no scripts, no ads.
 */

const DEFAULT_SITE_HOSTS = "labmgm.org,www.labmgm.org,web-production-589d3f.up.railway.app";

function apiBase(): string {
  return (
    process.env.CMS_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000/api"
  ).replace(/\/$/, "");
}

function normalizeHost(host: string | null): string {
  return (host ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

const SITE_HOSTS = new Set(
  (process.env.SHORTLINKS_SITE_HOSTS ?? DEFAULT_SITE_HOSTS)
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

/** Hosts that serve the marketing site, where short links live under /s/. */
function isSiteHost(host: string | null): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return true;
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }
  return SITE_HOSTS.has(normalized);
}

function visitorHeaders(request: Request): Record<string, string> {
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

type PublicState =
  | { status: "ok"; longUrl: string }
  | { status: "passphrase"; host: string }
  | { status: "expired"; kind: "expired" | "consumed" }
  | { status: "not_found" };

async function fetchLinkState(
  slug: string,
  host: string,
  request: Request,
): Promise<PublicState | null> {
  try {
    const response = await fetch(
      `${apiBase()}/shortlinks/public/${encodeURIComponent(slug)}?host=${encodeURIComponent(host)}`,
      {
        cache: "no-store",
        headers: visitorHeaders(request),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as PublicState;
  } catch {
    return null;
  }
}

type VerifyResult =
  | { outcome: "ok"; longUrl: string }
  | { outcome: "rejected" }
  | { outcome: "expired"; kind: "expired" | "consumed" }
  | { outcome: "missing" }
  | { outcome: "unavailable" };

async function verifyPassphrase(
  slug: string,
  host: string,
  passphrase: string,
  request: Request,
): Promise<VerifyResult> {
  try {
    const response = await fetch(`${apiBase()}/shortlinks/verify`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...visitorHeaders(request),
      },
      body: JSON.stringify({ slug, host, passphrase }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) return { outcome: "rejected" };
    if (response.status === 410) return { outcome: "expired", kind: "consumed" };
    if (response.status === 404) return { outcome: "missing" };
    if (!response.ok) return { outcome: "unavailable" };
    const body = (await response.json()) as { longUrl: string };
    return { outcome: "ok", longUrl: body.longUrl };
  } catch {
    return { outcome: "unavailable" };
  }
}

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function redirectTo(longUrl: string): Response {
  try {
    const url = new URL(longUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return html(renderShortlinkPage("not_found"), 404);
    return NextResponse.redirect(longUrl, 302);
  } catch {
    return html(renderShortlinkPage("not_found"), 404);
  }
}

export async function handleShortlinkGet(request: Request, slug: string): Promise<Response> {
  const host = normalizeHost(request.headers.get("host"));
  const state = await fetchLinkState(slug, host, request);
  if (state === null) return html(renderShortlinkUnavailable(), 503);
  switch (state.status) {
    case "ok":
      return redirectTo(state.longUrl);
    case "passphrase":
      return html(renderShortlinkPage("passphrase", { slug }), 200);
    case "expired":
      return html(renderShortlinkPage(state.kind === "consumed" ? "consumed" : "expired"), 410);
    default:
      return html(renderShortlinkPage("not_found"), 404);
  }
}

export async function handleShortlinkPost(request: Request, slug: string): Promise<Response> {
  const host = normalizeHost(request.headers.get("host"));
  let passphrase = "";
  try {
    const form = await request.formData();
    passphrase = String(form.get("passphrase") ?? "").trim();
  } catch {
    // A JSON or malformed body is treated as an empty passphrase.
  }
  if (!passphrase) {
    return html(
      renderShortlinkPage("passphrase", { slug, error: "Enter a passphrase first." }),
      400,
    );
  }
  const result = await verifyPassphrase(slug, host, passphrase, request);
  switch (result.outcome) {
    case "ok":
      return redirectTo(result.longUrl);
    case "rejected":
      return html(
        renderShortlinkPage("passphrase", { slug, error: "That passphrase is not right." }),
        401,
      );
    case "expired":
      return html(renderShortlinkPage(result.kind === "consumed" ? "consumed" : "expired"), 410);
    case "missing":
      return html(renderShortlinkPage("not_found"), 404);
    default:
      return html(renderShortlinkUnavailable(), 503);
  }
}

// --- Custom domains ---

type HostsCache = { hosts: Set<string>; fetchedAt: number };
let hostsCache: HostsCache | null = null;

/** The API's custom-domain list, cached a minute at a time. */
async function knownCustomHosts(): Promise<Set<string> | null> {
  if (hostsCache && Date.now() - hostsCache.fetchedAt < 60_000) return hostsCache.hosts;
  try {
    const response = await fetch(`${apiBase()}/shortlinks/hosts`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error("hosts unavailable");
    const body = (await response.json()) as { hosts?: { hostname: string }[] };
    hostsCache = {
      hosts: new Set((body.hosts ?? []).map((host) => host.hostname.toLowerCase())),
      fetchedAt: Date.now(),
    };
    return hostsCache.hosts;
  } catch {
    if (hostsCache) hostsCache.fetchedAt = Date.now() - 30_000;
    return hostsCache?.hosts ?? null;
  }
}

/**
 * Root-level requests on custom short domains. The API only probes domains
 * it knows, so the verification marker answers positively for known hosts
 * only; everything else on a custom host is treated as a short code.
 */
export async function handleShortlinkCatchAll(
  request: Request,
  segments: string[],
): Promise<Response | null> {
  const host = normalizeHost(request.headers.get("host"));
  if (isSiteHost(host) || !host) return null;

  const hosts = await knownCustomHosts();
  const isKnownHost = hosts ? hosts.has(host) : null;

  if (
    request.method === "GET" &&
    segments.length === 1 &&
    segments[0] === "__mgm-shortlink-verify"
  ) {
    return isKnownHost === true
      ? new Response("mgm-shortlinks-ok", { status: 200 })
      : new Response("Not found", { status: 404 });
  }
  if (segments.length < 1) return new Response("Not found", { status: 404 });
  if (isKnownHost === false) return new Response("Not found", { status: 404 });

  const slug = segments[0];
  if (request.method === "POST") return handleShortlinkPost(request, slug);
  if (request.method === "GET") return handleShortlinkGet(request, slug);
  return new Response("Not found", { status: 404 });
}
