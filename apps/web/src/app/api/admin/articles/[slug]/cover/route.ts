import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: Context) {
  if (!(await hasAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const response = await cmsApi(`/cms/articles/${encodeURIComponent(slug)}/cover`, {
    body: JSON.stringify(await request.json()),
    method: "POST",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
