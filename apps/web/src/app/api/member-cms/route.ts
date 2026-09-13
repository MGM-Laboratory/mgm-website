import { NextResponse } from "next/server";

import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";

export async function GET() {
  try {
    const records = await ensureMemberCmsSeeded();
    return NextResponse.json(
      { records },
      {
        headers: { "cache-control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json({ records: [] });
  }
}
