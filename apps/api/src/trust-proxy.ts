import { isIP } from "node:net";

const KEYWORDS = new Set(["loopback", "linklocal", "uniquelocal"]);

/** One entry of a trust proxy list, an address, a range or a keyword that Express knows. */
function isTrustedEntry(entry: string) {
  if (KEYWORDS.has(entry)) return true;
  const [address, prefix, ...rest] = entry.split("/");
  if (rest.length > 0) return false;
  const version = isIP(address);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  const max = version === 4 ? 32 : 128;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= max;
}

/**
 * The value for the Express `trust proxy` setting, or undefined to leave it off. The API trusts no proxy by default, so
 * `req.ip` is the address of the peer. A number is how many proxy hops to trust, and a list is the addresses, the ranges
 * or the keywords (`loopback`, `linklocal`, `uniquelocal`) of the proxies that may set `x-forwarded-for`. `true` is refused
 * because it makes every `x-forwarded-for` believable, which lets any caller choose its own address.
 */
export function parseTrustProxy(value: string | undefined): number | string | undefined {
  const text = (value ?? "").trim().toLowerCase();
  if (text === "" || text === "false") return undefined;
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    if (hops >= 1 && hops <= 10) return hops;
    throw new Error("TRUST_PROXY as a number must be between 1 and 10");
  }
  const entries = text.split(",").map((entry) => entry.trim());
  if (entries.every((entry) => entry !== "" && isTrustedEntry(entry))) return entries.join(",");
  throw new Error(
    "TRUST_PROXY must be a number of hops, or a comma separated list of addresses, ranges or the keywords loopback, linklocal and uniquelocal",
  );
}
