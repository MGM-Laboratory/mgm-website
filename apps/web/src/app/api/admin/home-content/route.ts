import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await gateAdminRequest("home", "read");
  if (!gate.ok) return gate.response;
  return proxyJson("/cms/home");
}

export async function PUT(request: Request) {
  const gate = await gateAdminRequest("home", "write");
  if (!gate.ok) return gate.response;
  const body = await request.text();
  return proxyJson("/cms/home", { body, method: "PUT" });
}
