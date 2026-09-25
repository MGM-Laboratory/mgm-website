import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const gate = await gateAdminRequest("links", "read");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  return proxyJson(`/shortlinks/admin/links/${encodeURIComponent(id)}/analytics`);
}
