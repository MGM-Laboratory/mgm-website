import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildConnectUrl, connectRecords } from "./shortlinks.domainconnect.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

describe("connectRecords", () => {
  it("lays out the CNAME plus the verification TXT", () => {
    const records = connectRecords("mgm.li", "edge.example.net", "token123");
    expect(records).toEqual({
      cname: { name: "mgm.li", content: "edge.example.net" },
      verifyTxt: { name: "_mgm-verify.mgm.li", content: "token123" },
    });
  });
});

describe("buildConnectUrl", () => {
  const base = {
    syncUrl: "https://cloudflare.com/cdn-cgi/domain-connect",
    providerId: "labmgm.org",
    serviceId: "shortlinks",
    zone: "mgm.li",
    hostname: "mgm.li",
    records: connectRecords("mgm.li", "edge.example.net", "token123"),
    keyId: "_dcpubkeyv1",
    redirectUrl: "https://labmgm.org/admin",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  };

  it("puts sig last and signs the canonical query string", () => {
    const { url, canonical, signature } = buildConnectUrl(base);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(
      "/cdn-cgi/domain-connect/v2/domainTemplates/providers/labmgm.org/services/shortlinks/apply",
    );
    const params = [...parsed.searchParams.entries()];
    expect(params[params.length - 1][0]).toBe("sig");
    expect(params.map(([key]) => key)).not.toContain("key-before-sig");
    // sig and key are excluded from the signed canonical string.
    expect(canonical).not.toContain("sig=");
    expect(canonical).not.toContain("key=");
    expect(canonical).toContain("domain=mgm.li");
    expect(canonical).toContain("verifyToken=token123");

    const verifier = createVerify("RSA-SHA256");
    verifier.update(canonical);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64"))).toBe(true);
  });

  it("uses the subdomain as host when the zone is its parent", () => {
    const { url } = buildConnectUrl({
      ...base,
      zone: "mgm.li",
      hostname: "short.mgm.li",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("domain")).toBe("mgm.li");
    expect(parsed.searchParams.get("host")).toBe("short");
  });

  it("verifies the signature against the URL as sent", () => {
    const { url, canonical } = buildConnectUrl(base);
    const parsed = new URL(url);
    const sig = parsed.searchParams.get("sig")!;
    const verifier = createVerify("RSA-SHA256");
    verifier.update(canonical);
    expect(verifier.verify(publicKey, Buffer.from(sig, "base64"))).toBe(true);
  });
});
