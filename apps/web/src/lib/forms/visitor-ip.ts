import "server-only";

/**
 * The respondent's address for the public form routes, from headers only
 * the hosting can vouch for.
 *
 * Railway's edge overwrites `x-forwarded-for` with the peer it received the
 * request from (checked on a preview: a spoofed value never survives). When
 * the site is reached through Cloudflare (labmgm.org), that peer is a
 * Cloudflare edge and the visitor is in `cf-connecting-ip`, which Cloudflare
 * sets. The Railway domain can be reached directly too, and then a caller
 * could send any `cf-connecting-ip`, so that header only counts when the
 * peer is inside Cloudflare's published ranges
 * (https://www.cloudflare.com/ips/).
 */

const CLOUDFLARE_V4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

const CLOUDFLARE_V6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inIpv4Range(ip: number, cidr: string) {
  const [base, bits] = cidr.split("/");
  const start = ipv4ToNumber(base);
  if (start === null) return false;
  const size = 2 ** (32 - Number(bits));
  return ip >= start && ip < start + size;
}

/** An IPv6 address as eight 16-bit groups, or null. */
function ipv6Groups(ip: string): number[] | null {
  if (!ip.includes(":") || ip.includes(".")) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  const values: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    values.push(Number.parseInt(group, 16));
  }
  return values;
}

function inIpv6Range(groups: number[], cidr: string) {
  const [base, bitsText] = cidr.split("/");
  const baseGroups = ipv6Groups(base);
  if (!baseGroups) return false;
  let bits = Number(bitsText);
  for (let index = 0; index < 8 && bits > 0; index += 1) {
    const take = Math.min(16, bits);
    const mask = (0xffff << (16 - take)) & 0xffff;
    if (((groups.at(index) ?? 0) & mask) !== ((baseGroups.at(index) ?? 0) & mask)) return false;
    bits -= take;
  }
  return true;
}

export function isCloudflareAddress(ip: string): boolean {
  const v4 = ipv4ToNumber(ip);
  if (v4 !== null) return CLOUDFLARE_V4.some((cidr) => inIpv4Range(v4, cidr));
  const v6 = ipv6Groups(ip.toLowerCase());
  if (v6) return CLOUDFLARE_V6.some((cidr) => inIpv6Range(v6, cidr));
  return false;
}

/** The visitor's address, or null when the hosting didn't say. */
export function visitorAddress(request: Request): string | null {
  const peer = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const viaCloudflare = request.headers.get("cf-connecting-ip")?.trim() || null;
  if (peer && viaCloudflare && isCloudflareAddress(peer)) return viaCloudflare;
  return peer;
}
