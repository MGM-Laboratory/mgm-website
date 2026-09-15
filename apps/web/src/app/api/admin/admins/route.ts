import { NextResponse } from "next/server";

import { requireSuperadmin } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function denied(gate: { status: 401 | 403 }) {
  return NextResponse.json(
    { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
    { status: gate.status },
  );
}

export async function GET() {
  const gate = await requireSuperadmin();
  if (gate.status !== 200) return denied(gate);
  const response = await cmsApi("/cms/admins");
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function POST(request: Request) {
  const gate = await requireSuperadmin();
  if (gate.status !== 200) return denied(gate);
  const response = await cmsApi("/cms/admins", {
    body: JSON.stringify(await request.json()),
    method: "POST",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
