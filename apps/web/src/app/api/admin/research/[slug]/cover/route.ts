import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: Context) {
  const gate = await requireAdminPermission("research", "write");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }
  const { slug } = await params;
  const response = await cmsApi(`/cms/research/${encodeURIComponent(slug)}/cover`, {
    body: JSON.stringify(await request.json()),
    method: "POST",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
