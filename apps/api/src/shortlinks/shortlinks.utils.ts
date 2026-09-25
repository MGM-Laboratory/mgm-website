import { lookup } from "node:dns/promises";
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

/** The registrable part of a hostname: "short.mgm.li" → "mgm.li". */
export function apexOf(hostname: string): string {
  const labels = hostname.split(".").filter(Boolean);
  return labels.length > 2 ? labels.slice(-2).join(".") : labels.join(".");
}

export async function hashPassphrase(passphrase: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(passphrase, salt, 64);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

export async function verifyPassphrase(passphrase: string, saltHex: string, hashHex: string) {
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scryptAsync(passphrase, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export type ClientInfo = { browser: string; os: string; device: string };

/** Best-effort user-agent classification, dependency-free. */
export function parseUserAgent(userAgent: string): ClientInfo {
  const ua = (userAgent ?? "").toLowerCase();
  let browser = "Other";
  let os = "Other";
  let device = "Desktop";

  if (/edg(e|ios|a)?\//.test(ua)) browser = "Edge";
  else if (/opr\/|opera/.test(ua)) browser = "Opera";
  else if (/firefox\//.test(ua)) browser = "Firefox";
  else if (/chrome\/|crios\//.test(ua)) browser = "Chrome";
  else if (/safari\//.test(ua)) browser = "Safari";
  else if (/\bwhatsapp\//.test(ua)) browser = "WhatsApp";
  else if (/\binstagram\b/.test(ua)) browser = "Instagram";
  else if (/\btelegram\b/.test(ua)) browser = "Telegram";
  else if (/\bfacebook\b|fbav|fban/.test(ua)) browser = "Facebook";
  else if (/\bpostman\b/.test(ua)) browser = "Postman";
  else if (/curl\/|wget\//.test(ua)) browser = "cURL";
  else if (/bot|crawl|spider|slurp|preview/.test(ua)) browser = "Bot";

  if (/windows/.test(ua)) os = "Windows";
  else if (/mac os x|macintosh/.test(ua)) os = "macOS";
  else if (/iphone|ipad|ipod/.test(ua)) os = "iOS";
  else if (/android/.test(ua)) os = "Android";
  else if (/crkey|netcast|tizen/.test(ua)) os = "TV";
  else if (/linux/.test(ua)) os = "Linux";

  if (/ipad|tablet/.test(ua)) device = "Tablet";
  else if (/iphone|android.*mobile|blackberry|windows phone/.test(ua)) device = "Mobile";
  else if (/crkey|netcast|tizen/.test(ua)) device = "TV";

  return { browser, os, device };
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
    return address === "::1" || address.startsWith("fc") || address.startsWith("fd");
  }
  return false;
}

/**
 * A best-effort HEAD check of a link's target, with two guards against the
 * API being used to probe internal networks: the URL must be http(s), and
 * every address the hostname resolves to must be a public one.
 */
export async function checkLongUrl(url: string): Promise<"ok" | "error"> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "error";
  } catch {
    return "error";
  }
  if (isIP(parsed.hostname) && isPrivateAddress(parsed.hostname)) return "error";
  try {
    const addresses = await lookup(parsed.hostname, { all: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
      return "error";
    }
  } catch {
    return "error";
  }
  const attempt = async (method: "HEAD" | "GET") => {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    return response.status < 400 ? "ok" : "error";
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
