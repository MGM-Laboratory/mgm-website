import { createSign } from "node:crypto";

import { zoneCandidates } from "./shortlinks.utils.js";

/**
 * The Domain Connect v2 client. A "Connect with Cloudflare" click builds a
 * signed apply-template URL (spec:
 * github.com/Domain-Connect/spec, synchronous flow) and opens it in a new
 * tab; Cloudflare shows the consent page and applies the template's DNS
 * records to the user's zone without the API ever holding a token.
 *
 * The signature covers the full query string, excluding `sig` and `key`,
 * with every value URL-encoded, in its original order, and is computed
 * with RSA-SHA256 against the private key whose public half is published
 * as the chunked TXT records at <keyId>.<providerId>.
 */

const CLOUDFLARE_DISCOVERY = "https://cloudflare.com/cdn-cgi/domain-connect";

/** The zone Cloudflare recognizes plus the sync UX prefix to apply with. */
export async function resolveCloudflareSync(
  hostname: string,
  fallbackSyncUrl: string,
): Promise<{ zone: string; syncUrl: string }> {
  for (const candidate of zoneCandidates(hostname)) {
    try {
      const response = await fetch(`${CLOUDFLARE_DISCOVERY}/v2/${candidate}/settings`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const settings = (await response.json()) as { urlSyncUX?: string };
        return { zone: candidate, syncUrl: settings.urlSyncUX ?? fallbackSyncUrl };
      }
    } catch {
      // Not this candidate (or the network refused); the next one may be the zone.
    }
  }
  return { zone: hostname, syncUrl: fallbackSyncUrl };
}

export type ConnectRecords = {
  cname: { name: string; content: string };
  verifyTxt: { name: string; content: string };
  railwayTxt: { name: string; content: string } | null;
};

/**
 * The records the template applies: the routing CNAME, our own
 * verification TXT (what the check-now button looks for), and Railway's
 * ownership TXT. Railway hands the verification token over with the
 * "railway-verify=" prefix already in place.
 */
export function connectRecords(
  hostname: string,
  cnameTarget: string,
  verifyToken: string,
  railwayToken: string | null,
): ConnectRecords {
  return {
    cname: { name: hostname, content: cnameTarget },
    verifyTxt: { name: `_mgm-verify.${hostname}`, content: verifyToken },
    railwayTxt: railwayToken
      ? { name: `_railway-verify.${hostname}`, content: railwayToken }
      : null,
  };
}

export type ConnectUrlInput = {
  syncUrl: string;
  providerId: string;
  serviceId: string;
  zone: string;
  hostname: string;
  records: ConnectRecords;
  keyId: string;
  redirectUrl: string;
  privateKey: string;
};

export type ConnectUrlResult = {
  url: string;
  canonical: string;
  signature: string;
};

/** Builds the signed apply-template URL; `sig` is always the last parameter. */
export function buildConnectUrl(input: ConnectUrlInput): ConnectUrlResult {
  const host =
    input.hostname === input.zone
      ? undefined
      : input.hostname.endsWith(`.${input.zone}`)
        ? input.hostname.slice(0, -input.zone.length - 1)
        : input.hostname;

  const pairs: [string, string][] = [["domain", input.zone]];
  if (host) pairs.push(["host", host]);
  pairs.push(["cnameTarget", input.records.cname.content]);
  pairs.push(["verifyToken", input.records.verifyTxt.content]);
  if (input.records.railwayTxt) pairs.push(["railwayToken", input.records.railwayTxt.content]);
  pairs.push(["redirect_uri", input.redirectUrl]);

  // The signature covers everything after the "?" except the key parameter
  // and the signature itself, in order, with values URL-encoded.
  const canonical = pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  const signer = createSign("RSA-SHA256");
  signer.update(canonical);
  const signature = signer.sign(input.privateKey, "base64");

  const url = `${input.syncUrl.replace(/\/$/, "")}/v2/domainTemplates/providers/${encodeURIComponent(
    input.providerId,
  )}/services/${encodeURIComponent(input.serviceId)}/apply?${canonical}&key=${encodeURIComponent(
    input.keyId,
  )}&sig=${encodeURIComponent(signature)}`;
  return { url, canonical, signature };
}
