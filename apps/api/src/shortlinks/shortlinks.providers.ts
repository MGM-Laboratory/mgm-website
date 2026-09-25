/**
 * External provider clients for the link shortener. Cloudflare setup runs
 * through Domain Connect (shortlinks.domainconnect.ts) instead of an API
 * token, so only the Railway client lives here.
 */

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
    verificationDnsHost?: string;
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
          verificationDnsHost
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
          verificationDnsHost
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
