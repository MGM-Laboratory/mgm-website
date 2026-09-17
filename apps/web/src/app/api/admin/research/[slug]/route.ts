import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("research", "write");
  if (!gate.ok) return gate.response;
  const { slug } = await params;
  return proxyJson(`/cms/research/${encodeURIComponent(slug)}`, {
    body: JSON.stringify(await request.json()),
    method: "PUT",
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  const gate = await gateAdminRequest("research", "delete");
  if (!gate.ok) return gate.response;
  const { slug } = await params;
  return proxyJson(`/cms/research/${encodeURIComponent(slug)}`, { method: "DELETE" });
}
