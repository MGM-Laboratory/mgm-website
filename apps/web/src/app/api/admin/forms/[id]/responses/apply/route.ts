import { gateAdminRequest } from "@/lib/admin-proxy";

import { formPath, forwardBody } from "../../../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("forms", "write");
  if (!gate.ok) return gate.response;
  return forwardBody(request, formPath((await params).id, "/responses/apply"), "POST");
}
