import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await gateAdminRequest("contact-inquiries", "write");
  if (!gate.ok) return gate.response;
  return proxyJson("/cms/contact-inquiries/bulk", {
    body: JSON.stringify(await request.json()),
    method: "POST",
  });
}
