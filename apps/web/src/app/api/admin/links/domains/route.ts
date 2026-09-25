import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Custom short domains: the list behind the picker, and the add form.
export async function GET() {
  const gate = await gateAdminRequest("links", "read");
  if (!gate.ok) return gate.response;
  return proxyJson("/shortlinks/admin/domains");
}

export async function POST(request: Request) {
  const gate = await gateAdminRequest("links", "write");
  if (!gate.ok) return gate.response;
  return proxyJson("/shortlinks/admin/domains", {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
}
