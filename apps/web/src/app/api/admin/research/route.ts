import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await requireAdminPermission("research", "read");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }
  // The admin list endpoint includes unpublished drafts.
  const response = await cmsApi("/cms/research/admin");
  return NextResponse.json(await response.json(), { status: response.status });
}
