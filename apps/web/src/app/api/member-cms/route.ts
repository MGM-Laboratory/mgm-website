import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

export async function GET() {
  try {
    const response = await cmsApi("/cms/members");
    return NextResponse.json(await response.json(), {
      headers: { "cache-control": "no-store" },
      status: response.status,
    });
  } catch {
    return NextResponse.json({ records: [] });
  }
}
