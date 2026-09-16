import { NextResponse } from "next/server";

import type { AdminAction, AdminPageId } from "@/lib/admin-permissions";
import { requireAdminPermission, type AdminSession } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

export type AdminGate = { ok: true; session: AdminSession } | { ok: false; response: NextResponse };

/**
 * Runs the RBAC check every /api/admin/** route handler needs and returns
 * either the authorized session or the exact 401/403 response to return
 * immediately — shared so route handlers don't each repeat the same
 * gate-then-format-the-error block.
 */
export async function gateAdminRequest(page: AdminPageId, action: AdminAction): Promise<AdminGate> {
  const gate = await requireAdminPermission(page, action);
  if (gate.status !== 200) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: gate.status },
      ),
    };
  }
  return { ok: true, session: gate.session };
}

/** Forwards a CMS API response as-is: same status, same JSON body. */
export async function proxyJson(path: string, init?: RequestInit): Promise<NextResponse> {
  const response = await cmsApi(path, init);
  return NextResponse.json(await response.json(), { status: response.status });
}
