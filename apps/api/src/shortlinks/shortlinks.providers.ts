import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { apexOf } from "./shortlinks.utils.js";

/**
 * Encrypts a Cloudflare API token with AES-256-GCM before it touches the
 * database. The key comes from SHORTLINKS_ENCRYPTION_KEY; callers check
 * `hasEncryptionKey()` first and refuse to store tokens without one.
 */
export function hasEncryptionKey(): boolean {
  return Boolean(process.env.SHORTLINKS_ENCRYPTION_KEY);
}

export function encryptToken(token: string): string {
  const key = Buffer.from(process.env.SHORTLINKS_ENCRYPTION_KEY ?? "", "hex");
  if (key.length !== 32) throw new Error("SHORTLINKS_ENCRYPTION_KEY is not a 32-byte hex key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${ciphertext.toString("hex")}`;
}

export function decryptToken(stored: string): string | null {
  try {
    const key = Buffer.from(process.env.SHORTLINKS_ENCRYPTION_KEY ?? "", "hex");
    const [ivHex, tagHex, ciphertextHex] = stored.split(".");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export class CloudflareError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CloudflareError";
  }
}

async function cloudflareRequest(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(10000),
  });
  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: unknown;
    errors?: { code?: number; message?: string }[];
  } | null;
  if (!response.ok || !json?.success) {
    throw new CloudflareError(
      json?.errors?.[0]?.message ?? `Cloudflare responded with status ${response.status}`,
      response.status,
    );
  }
  return json.result;
}

export async function findCloudflareZone(token: string, hostname: string): Promise<string | null> {
  const zones = (await cloudflareRequest(
    token,
    `/zones?name=${encodeURIComponent(apexOf(hostname))}`,
  )) as { id: string }[];
  return zones[0]?.id ?? null;
}

export type CloudflareDnsRecord = { name: string; content: string; type: "CNAME" | "TXT" };

export async function createCloudflareDnsRecord(
  token: string,
  zoneId: string,
  record: CloudflareDnsRecord,
): Promise<void> {
  await cloudflareRequest(token, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: record.type,
      name: record.name,
      content: record.content,
      proxied: false,
      comment: "MGM Laboratory short links",
    }),
  });
}

// --- Railway ---

const RAILWAY_ENDPOINT = "https://backboard.railway.com/graphql/v2";

export class RailwayApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RailwayApiError";
  }
}

async function railwayGraphql(token: string, query: string, variables: Record<string, unknown>) {
  const response = await fetch(RAILWAY_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await response.json()) as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new RailwayApiError(json.errors.map((error) => error.message).join("; "));
  }
  return json.data;
}

export type RailwayDomainStatus = {
  id: string;
  domain: string;
  status: {
    verificationToken: string;
    dnsRecords: { hostlabel: string; requiredValue: string; status: string }[];
    certificateStatus?: string;
  } | null;
};

export async function railwayCustomDomainAvailable(token: string, domain: string) {
  const data = (await railwayGraphql(
    token,
    `query($domain: String!) { customDomainAvailable(domain: $domain) { available message } }`,
    { domain },
  )) as { customDomainAvailable: { available: boolean; message: string | null } };
  return data.customDomainAvailable;
}

export async function railwayCustomDomainCreate(
  token: string,
  projectId: string,
  environmentId: string,
  serviceId: string,
  domain: string,
) {
  const data = (await railwayGraphql(
    token,
    `mutation($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
        domain
        status {
          verificationToken
          dnsRecords { hostlabel requiredValue status }
        }
      }
    }`,
    { input: { projectId, environmentId, serviceId, domain, targetPort: 3000 } },
  )) as { customDomainCreate: RailwayDomainStatus | null };
  if (!data.customDomainCreate) throw new RailwayApiError("Railway did not return a domain.");
  return data.customDomainCreate;
}

export async function railwayCustomDomainStatus(
  token: string,
  id: string,
  projectId: string,
): Promise<RailwayDomainStatus | null> {
  const data = (await railwayGraphql(
    token,
    `query($id: String!, $projectId: String!) {
      customDomain(id: $id, projectId: $projectId) {
        id
        domain
        status {
          verificationToken
          dnsRecords { hostlabel requiredValue status }
          certificateStatus
        }
      }
    }`,
    { id, projectId },
  )) as { customDomain: RailwayDomainStatus | null };
  return data.customDomain;
}

export async function railwayCustomDomainDelete(token: string, id: string): Promise<void> {
  await railwayGraphql(token, `mutation($id: String!) { customDomainDelete(id: $id) }`, { id });
}
