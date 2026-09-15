import { NextResponse } from "next/server";

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
  const response = await cmsApi("/cms/contact-settings", {
    body: JSON.stringify(await request.json()),
    method: "PUT",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
