import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The detail response carries a short-lived signed CV URL alongside the record.
export async function GET(_request: Request, { params }: Context) {
  const gate = await gateAdminRequest("careers", "read");
  if (!gate.ok) return gate.response;
  const { slug } = await params;
  return proxyJson(`/cms/jobs/applications/${encodeURIComponent(slug)}`);
}

export async function PUT(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("careers", "write");
  if (!gate.ok) return gate.response;
  const { slug } = await params;
  return proxyJson(`/cms/jobs/applications/${encodeURIComponent(slug)}/state`, {
    body: JSON.stringify(await request.json()),
    method: "PUT",
  });
}
