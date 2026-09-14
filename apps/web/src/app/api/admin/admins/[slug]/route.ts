import { NextResponse } from "next/server";

import { requireSuperadmin } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function denied(gate: { status: 401 | 403 }) {
  return NextResponse.json(
    { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
    { status: gate.status },
  );
}

export async function PUT(request: Request, { params }: Context) {
  const gate = await requireSuperadmin();
  if (gate.status !== 200) return denied(gate);
  const { slug } = await params;
  const response = await cmsApi(`/cms/admins/${encodeURIComponent(slug)}`, {
    body: JSON.stringify(await request.json()),
    method: "PUT",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function DELETE(_request: Request, { params }: Context) {
  const gate = await requireSuperadmin();
  if (gate.status !== 200) return denied(gate);
  const { slug } = await params;
  const response = await cmsApi(`/cms/admins/${encodeURIComponent(slug)}`, { method: "DELETE" });
  return NextResponse.json(await response.json(), { status: response.status });
}
