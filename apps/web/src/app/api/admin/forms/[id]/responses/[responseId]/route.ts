import { gateAdminRequest } from "@/lib/admin-proxy";

import { enc, formPath, forwardBody } from "../../../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; responseId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("forms", "write");
  if (!gate.ok) return gate.response;
  const { id, responseId } = await params;
  return forwardBody(request, formPath(id, `/responses/${enc(responseId)}`), "PATCH");
}
