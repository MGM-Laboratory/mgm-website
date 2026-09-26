import { gateAdminRequest } from "@/lib/admin-proxy";

import { formPath, forwardJson, passQuery } from "../../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("forms", "read");
  if (!gate.ok) return gate.response;
  const query = passQuery(request, ["range", "tzOffset"]);
  return forwardJson(formPath((await params).id, `/analytics${query}`));
}
