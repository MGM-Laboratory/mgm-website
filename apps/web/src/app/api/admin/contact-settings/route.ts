import type { ContactSettings } from "@repo/shared";

import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await gateAdminRequest("contact", "read");
  if (!gate.ok) return gate.response;
  return proxyJson("/cms/contact-settings");
}

export async function PUT(request: Request) {
  const gate = await gateAdminRequest("contact", "write");
  if (!gate.ok) return gate.response;

  const body = (await request.json()) as Partial<ContactSettings>;

  // Mail routing (strategy, provider order, weights, per-provider limits) is
  // superadmin-only: everything else on this form (recipient email, address,
  // map coordinates) stays gated on the ordinary "contact" write permission
  // above. An ordinary admin saves only the contact details. The API merges
  // them into the stored settings under a row lock, so the routing the form
  // carries (possibly an older copy) is never written and never refused.
  if (gate.session.role !== "superadmin") {
    const details = { emails: body.emails, address: body.address, lat: body.lat, lng: body.lng };
    return proxyJson("/cms/contact-settings", { body: JSON.stringify(details), method: "PATCH" });
  }

  return proxyJson("/cms/contact-settings", { body: JSON.stringify(body), method: "PUT" });
}
