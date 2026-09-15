import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await requireAdminPermission("careers", "read");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }
  // The admin list endpoint includes drafts and closed roles.
  const response = await cmsApi("/cms/jobs/admin");
  return NextResponse.json(await response.json(), { status: response.status });
}
