import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("links", "write");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  return proxyJson(`/shortlinks/admin/links/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(await request.json()),
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  const gate = await gateAdminRequest("links", "delete");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  return proxyJson(`/shortlinks/admin/links/${encodeURIComponent(id)}`, { method: "DELETE" });
}
