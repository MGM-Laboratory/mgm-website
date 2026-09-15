import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The detail response carries a short-lived signed CV URL alongside the record.
export async function GET(_request: Request, { params }: Context) {
  const gate = await requireAdminPermission("careers", "read");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }
  const { slug } = await params;
  const response = await cmsApi(`/cms/jobs/applications/${encodeURIComponent(slug)}`);
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function PUT(request: Request, { params }: Context) {
  const gate = await requireAdminPermission("careers", "write");
  if (gate.status !== 200) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status },
    );
  }
  const { slug } = await params;
  const response = await cmsApi(`/cms/jobs/applications/${encodeURIComponent(slug)}/state`, {
    body: JSON.stringify(await request.json()),
    method: "PUT",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
