import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

// Builds the signed Domain Connect apply URL (and the records it applies)
// for Cloudflare's one-click consent flow.
export async function POST(_request: Request, { params }: Context) {
  const gate = await gateAdminRequest("links", "write");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  return proxyJson(`/shortlinks/admin/domains/${encodeURIComponent(id)}/connect`, {
    method: "POST",
    body: "{}",
  });
}
