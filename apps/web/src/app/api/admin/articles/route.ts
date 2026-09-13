import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await hasAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const response = await cmsApi("/cms/articles");
  return NextResponse.json(await response.json(), { status: response.status });
}
