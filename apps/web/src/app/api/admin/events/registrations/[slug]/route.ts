import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("events", "write");
  if (!gate.ok) return gate.response;
  const { slug } = await params;
  return proxyJson(`/cms/events/registrations/${encodeURIComponent(slug)}/state`, {
    body: JSON.stringify(await request.json()),
    method: "PUT",
  });
}
