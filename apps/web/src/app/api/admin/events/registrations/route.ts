import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await gateAdminRequest("events", "read");
  if (!gate.ok) return gate.response;
  return proxyJson("/cms/events/registrations");
}
