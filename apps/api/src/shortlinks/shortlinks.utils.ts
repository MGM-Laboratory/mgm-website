import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { randomInt, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

// 0/O, 1/l/I are left out: short codes get read aloud and typed by hand,
// and ambiguous glyphs just cause support requests.
export const SLUG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const SLUG_START_LENGTH = 4;
export const SLUG_MAX_LENGTH = 10;

export const SLUG_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
export const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function randomSlug(length: number): string {
  let slug = "";
  for (let i = 0; i < length; i += 1) {
    slug += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  }
  return slug;
}

/** Lowercase, drop scheme/port/path/trailing dot: "HTTPS://Mgm.Li/x" → "mgm.li". */
export function normalizeHostname(value: string): string {
  let host = value.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  host = host.split(/[/?#]/)[0];
  host = host.replace(/:\d+$/, "");
  host = host.replace(/\.$/, "");
  return host;
}

/** The registrable part of a hostname, as a longest-first candidate list:
 * "short.mgm.li" → ["short.mgm.li", "mgm.li"]. Trying the full hostname
 * first also handles multi-label public suffixes like foo.co.uk correctly
 * without a suffix database. */
export function zoneCandidates(hostname: string): string[] {
  const labels = hostname.split(".").filter(Boolean);
  const candidates: string[] = [];
  for (let keep = labels.length; keep >= 2; keep -= 1) {
    candidates.push(labels.slice(-keep).join("."));
  }
  return candidates;
}

export async function hashPassphrase(passphrase: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(passphrase, salt, 64);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

export async function verifyPassphrase(passphrase: string, saltHex: string, hashHex: string) {
  // Stored values must be real hex of the expected width: anything else
  // (an empty buffer from malformed hex included) must not verify.
  if (!/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{128}$/.test(hashHex)) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scryptAsync(passphrase, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export type ClientInfo = { browser: string; os: string; device: string };

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/edg(e|ios|a)?\//, "Edge"],
  [/opr\/|opera/, "Opera"],
  [/firefox\//, "Firefox"],
  [/chrome\/|crios\//, "Chrome"],
  [/safari\//, "Safari"],
  [/\bwhatsapp\//, "WhatsApp"],
  [/\binstagram\b/, "Instagram"],
  [/\btelegram\b/, "Telegram"],
  [/\bfacebook\b|fbav|fban/, "Facebook"],
  [/\bpostman\b/, "Postman"],
  [/curl\/|wget\//, "cURL"],
  [/bot|crawl|spider|slurp|preview/, "Bot"],
];

const OS_PATTERNS: [RegExp, string][] = [
  [/windows/, "Windows"],
  // iOS before macOS: an iPhone user agent also carries "like Mac OS X".
  [/iphone|ipad|ipod/, "iOS"],
  [/android/, "Android"],
  [/mac os x|macintosh/, "macOS"],
  [/crkey|netcast|tizen/, "TV"],
  [/linux/, "Linux"],
];

const DEVICE_PATTERNS: [RegExp, string][] = [
  [/ipad|tablet/, "Tablet"],
  [/iphone|android.*mobile|blackberry|windows phone/, "Mobile"],
  [/crkey|netcast|tizen/, "TV"],
];

function matchFirst(ua: string, patterns: [RegExp, string][], fallback: string): string {
  for (const [pattern, label] of patterns) {
    if (pattern.test(ua)) return label;
  }
  return fallback;
}

/** Best-effort user-agent classification, dependency-free. */
export function parseUserAgent(userAgent: string): ClientInfo {
  const ua = (userAgent ?? "").toLowerCase();
  return {
    browser: matchFirst(ua, BROWSER_PATTERNS, "Other"),
    os: matchFirst(ua, OS_PATTERNS, "Other"),
    device: matchFirst(ua, DEVICE_PATTERNS, "Desktop"),
  };
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) !== 0) {
    const parts = address.split(".").map(Number);
    if (parts.length === 4) {
      const [a, b] = parts;
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
      );
    }
    // Link-local (fe80::/10), unique local (fc00::/7) and the loopback.
    return (
      address === "::1" ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      address.startsWith("fe8") ||
      address.startsWith("fe9") ||
      address.startsWith("fea") ||
      address.startsWith("feb")
    );
  }
  return false;
}

/**
 * One request straight to a previously resolved address: the connection is
 * pinned to the IP while the Host header and the TLS server name keep the
 * original hostname, so nothing a DNS rebinding can change between the
 * lookup and the request.
 */
function requestToAddress(
  protocol: string,
  address: string,
  hostHeader: string,
  hostname: string,
  path: string,
  method: "HEAD" | "GET",
): Promise<number | null> {
  const driver = protocol === "https:" ? httpsRequest : httpRequest;
  const port = protocol === "https:" ? 443 : 80;
  const options = {
    hostname: address,
    port,
    method,
    path,
    headers: { host: hostHeader },
    servername: protocol === "https:" ? hostname : undefined,
    signal: AbortSignal.timeout(5000),
  };
  return new Promise((resolve, reject) => {
    const req = driver(options, (response) => {
      response.resume();
      resolve(response.statusCode ?? null);
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * A best-effort HEAD check of a link's target, with two guards against the
 * API being used to probe internal networks: the URL must be http(s), and
 * every address the hostname resolves to must be a public one, with the
 * request itself pinned to one of those addresses.
 */
export async function checkLongUrl(url: string): Promise<"ok" | "error"> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "error";
  } catch {
    return "error";
  }
  let addresses: { address: string }[];
  if (isIP(parsed.hostname)) {
    if (isPrivateAddress(parsed.hostname)) return "error";
    addresses = [{ address: parsed.hostname }];
  } else {
    try {
      addresses = await lookup(parsed.hostname, { all: true });
      if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
        return "error";
      }
    } catch {
      return "error";
    }
  }

  const attempt = async (method: "HEAD" | "GET") => {
    for (const { address } of addresses) {
      try {
        const status = await requestToAddress(
          parsed.protocol,
          address,
          parsed.host,
          parsed.hostname,
          parsed.pathname + parsed.search,
          method,
        );
        if (status !== null) return status < 400 ? "ok" : "error";
      } catch {
        // Try the next address; a multi-homed host only needs one that works.
      }
    }
    return "error";
  };
  try {
    return await attempt("HEAD");
  } catch {
    // Some servers refuse HEAD entirely; one GET fallback still counts as a
    // check, not a fetch of the whole page, thanks to the abort below.
    try {
      return await attempt("GET");
    } catch {
      return "error";
    }
  }
}

export const EXPIRY_OPTIONS = ["once", "24h", "3d", "7d", "30d", "never"] as const;
export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number];

const EXPIRY_DURATIONS: Record<Exclude<ExpiryOption, "once" | "never">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function expiryFromOption(option: ExpiryOption): {
  expiresAt: Date | null;
  maxClicks: number | null;
} {
  if (option === "once") return { expiresAt: null, maxClicks: 1 };
  if (option === "never") return { expiresAt: null, maxClicks: null };
  return { expiresAt: new Date(Date.now() + EXPIRY_DURATIONS[option]), maxClicks: null };
}

export type LinkStatus = "available" | "expired" | "consumed" | "error";

/**
 * Expiry wins over the URL health check: a dead link that has also expired
 * is simply expired. "consumed" is a single-use link whose click is spent.
 */
export function linkStatus(link: {
  expiresAt: Date | null;
  maxClicks: number | null;
  clickCount: number;
  longUrlStatus: string | null;
}): LinkStatus {
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return "expired";
  if (link.maxClicks !== null && link.clickCount >= link.maxClicks) return "consumed";
  if (link.longUrlStatus === "error") return "error";
  return "available";
}
