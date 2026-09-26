import { gateAdminRequest } from "@/lib/admin-proxy";

import { forwardBody, forwardJson } from "./_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await gateAdminRequest("forms", "read");
  if (!gate.ok) return gate.response;
  return forwardJson("/forms/admin");
}

export async function POST(request: Request) {
  const gate = await gateAdminRequest("forms", "write");
  if (!gate.ok) return gate.response;
  return forwardBody(request, "/forms/admin", "POST");
}
