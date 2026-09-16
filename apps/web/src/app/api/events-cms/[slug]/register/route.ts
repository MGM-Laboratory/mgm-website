import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: Context) {
  const { slug } = await params;
  const response = await cmsApi(`/cms/events/${encodeURIComponent(slug)}/register`, {
    body: JSON.stringify(await request.json()),
    method: "POST",
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = { message: "We could not submit your registration right now. Please try again." };
  }
  return NextResponse.json(body, { status: response.status });
}
