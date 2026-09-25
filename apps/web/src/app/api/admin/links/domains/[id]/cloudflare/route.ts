import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

// Creates the routing and verification DNS records on Cloudflare and
// attaches the domain to the web service on Railway.
export async function POST(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("links", "write");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  return proxyJson(`/shortlinks/admin/domains/${encodeURIComponent(id)}/cloudflare`, {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
}
