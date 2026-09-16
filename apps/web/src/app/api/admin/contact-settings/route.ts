import { NextResponse } from "next/server";
import type { ContactSettings } from "@repo/shared";

import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";
import { cmsApi } from "@/lib/cms-api";

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
  // above.
  const routingFields = [
    "mailStrategy",
    "mailProviderOrder",
    "mailProviderWeights",
    "mailProviderLimits",
  ] as const;
  const touchesRouting = routingFields.some((field) => body[field] !== undefined);
  let payload = body;
  if (gate.session.role !== "superadmin") {
    if (touchesRouting) {
      const current = await cmsApi("/cms/contact-settings");
      const { record } = (await current.json()) as { record?: ContactSettings };
      const changed =
        !record ||
        routingFields.some(
          (field) =>
            body[field] !== undefined &&
            JSON.stringify(body[field]) !== JSON.stringify(record[field]),
        );
      if (changed) {
        return NextResponse.json(
          { error: "Only the superadmin can change mail routing settings." },
          { status: 403 },
        );
      }
    }

    payload = Object.fromEntries(
      Object.entries(body).filter(
        ([key]) => !routingFields.includes(key as (typeof routingFields)[number]),
      ),
    ) as Partial<ContactSettings>;
  }

  return proxyJson("/cms/contact-settings", { body: JSON.stringify(payload), method: "PUT" });
}
