import { gateAdminRequest } from "@/lib/admin-proxy";

import { formPath, forwardJson } from "../../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const gate = await gateAdminRequest("forms", "read");
  if (!gate.ok) return gate.response;
  return forwardJson(formPath((await params).id, "/responses"));
}
