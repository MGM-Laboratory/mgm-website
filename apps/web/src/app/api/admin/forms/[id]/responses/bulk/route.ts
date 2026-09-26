import { NextResponse } from "next/server";

import { gateAdminRequest } from "@/lib/admin-proxy";

import { formPath, forwardJson } from "../../../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

// Deleting responses needs the delete permission; every other bulk action
// (star, flag, review, spam, tags) is a write.
export async function POST(request: Request, { params }: Context) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "The request body must be JSON." }, { status: 400 });
  }
  const action = (body as { action?: unknown } | null)?.action;
  const gate = await gateAdminRequest("forms", action === "delete" ? "delete" : "write");
  if (!gate.ok) return gate.response;
  return forwardJson(formPath((await params).id, "/responses/bulk"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}
