import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await gateAdminRequest("events", "write");
  if (!gate.ok) return gate.response;
  return proxyJson("/cms/events/registrations/bulk", {
    body: JSON.stringify(await request.json()),
    method: "POST",
  });
}
