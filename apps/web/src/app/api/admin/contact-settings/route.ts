import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

export async function GET() {
  if (!(await hasAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const response = await cmsApi("/cms/contact-settings");
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function PUT(request: Request) {
  if (!(await hasAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const response = await cmsApi("/cms/contact-settings", {
    body: JSON.stringify(await request.json()),
    method: "PUT",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
