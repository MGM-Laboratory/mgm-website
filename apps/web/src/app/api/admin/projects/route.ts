import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await gateAdminRequest("projects", "read");
  if (!gate.ok) return gate.response;
  // The admin list endpoint includes unpublished drafts.
  return proxyJson("/cms/projects/admin");
}
