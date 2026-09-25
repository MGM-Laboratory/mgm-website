import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The link list and the create form: read and write on the links page.
export async function GET(request: Request) {
  const gate = await gateAdminRequest("links", "read");
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const query = new URLSearchParams();
  const search = url.searchParams.get("search");
  const domainId = url.searchParams.get("domainId");
  if (search) query.set("search", search);
  if (domainId) query.set("domainId", domainId);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return proxyJson(`/shortlinks/admin/links${suffix}`);
}

export async function POST(request: Request) {
  const gate = await gateAdminRequest("links", "write");
  if (!gate.ok) return gate.response;
  return proxyJson("/shortlinks/admin/links", {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
}
