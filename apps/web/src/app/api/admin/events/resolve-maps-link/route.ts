import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireAdminPermission("events", "write");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }
  const response = await cmsApi("/cms/events/resolve-maps-link", {
    body: JSON.stringify(await request.json()),
    method: "POST",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
