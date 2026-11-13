import { NextResponse } from "next/server";
import type { ContactSettings } from "@repo/shared";

import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";
import { cmsApi } from "@/lib/cms-api";
import { mergeOrdinarySave } from "@/lib/contact-settings-merge";

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
  // above. The API fills a missing routing field with its default, so an
  // ordinary save carries the stored routing along and never resets it.
  let payload = body;
  if (gate.session.role !== "superadmin") {
    const current = await cmsApi("/cms/contact-settings");
    if (!current.ok) {
      return NextResponse.json(
        { error: "The current settings could not be read. Please try again." },
        { status: 502 },
      );
    }
    const { record } = (await current.json()) as { record?: ContactSettings };
    if (!record) {
      return NextResponse.json(
        { error: "The current settings could not be read. Please try again." },
        { status: 502 },
      );
    }
    const merged = mergeOrdinarySave(body, record);
    if (!merged.ok) {
      return NextResponse.json(
        { error: "Only the superadmin can change mail routing settings." },
        { status: 403 },
      );
    }
    payload = merged.payload;
  }

  return proxyJson("/cms/contact-settings", { body: JSON.stringify(payload), method: "PUT" });
}
