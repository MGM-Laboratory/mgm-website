import { gateAdminRequest } from "@/lib/admin-proxy";

import { formPath, forwardJson } from "../../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("forms", "read");
  if (!gate.ok) return gate.response;
  const search = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  const cursor = search.get("cursor");
  const limit = search.get("limit");
  if (cursor) query.set("cursor", cursor);
  if (limit) query.set("limit", limit);
  const suffix = query.size ? `?${query.toString()}` : "";
  return forwardJson(formPath((await params).id, `/responses${suffix}`));
}
