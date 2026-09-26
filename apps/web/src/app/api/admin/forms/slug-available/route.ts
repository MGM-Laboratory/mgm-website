import { gateAdminRequest } from "@/lib/admin-proxy";

import { forwardJson, passQuery } from "../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await gateAdminRequest("forms", "read");
  if (!gate.ok) return gate.response;
  return forwardJson(`/forms/admin/slug-available${passQuery(request, ["slug", "excludeId"])}`);
}
