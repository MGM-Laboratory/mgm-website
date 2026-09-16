import { NextResponse } from "next/server";
import type { ContactSettings } from "@repo/shared";

import { requireAdminPermission } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await requireAdminPermission("contact", "read");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }
  const response = await cmsApi("/cms/contact-settings");
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function PUT(request: Request) {
  const gate = await requireAdminPermission("contact", "write");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }

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
  if (touchesRouting && gate.session.role !== "superadmin") {
    const current = await cmsApi("/cms/contact-settings");
    const { record } = (await current.json()) as { record?: ContactSettings };
    const changed =
      !record ||
      routingFields.some((field) => JSON.stringify(body[field]) !== JSON.stringify(record[field]));
    if (changed) {
      return NextResponse.json(
        { error: "Only the superadmin can change mail routing settings." },
        { status: 403 },
      );
    }
  }

  const response = await cmsApi("/cms/contact-settings", {
    body: JSON.stringify(body),
    method: "PUT",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
