import { NextResponse } from "next/server";

import type { AdminAction, AdminPageId } from "@/lib/admin-permissions";
import { requireAdminPermission, requireSuperadmin, type AdminSession } from "@/lib/admin-session";
import { cmsApi } from "@/lib/cms-api";

export type AdminGate = { ok: true; session: AdminSession } | { ok: false; response: NextResponse };

function toGate(status: 200 | 401 | 403, session?: AdminSession): AdminGate {
  if (status !== 200) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: status === 401 ? "Unauthorized" : "Forbidden" },
        { status },
      ),
    };
  }
  return { ok: true, session: session! };
}

/**
 * Runs the RBAC check every /api/admin/** route handler needs and returns
 * either the authorized session or the exact 401/403 response to return
 * immediately — shared so route handlers don't each repeat the same
 * gate-then-format-the-error block.
 */
export async function gateAdminRequest(page: AdminPageId, action: AdminAction): Promise<AdminGate> {
  const gate = await requireAdminPermission(page, action);
  return toGate(gate.status, gate.status === 200 ? gate.session : undefined);
}

/** Same as gateAdminRequest, but for routes only the superadmin may use. */
export async function gateSuperadminRequest(): Promise<AdminGate> {
  const gate = await requireSuperadmin();
  return toGate(gate.status, gate.status === 200 ? gate.session : undefined);
}

/** Forwards a CMS API response as-is: same status, same JSON body. */
export async function proxyJson(path: string, init?: RequestInit): Promise<NextResponse> {
  const response = await cmsApi(path, init);
  return NextResponse.json(await response.json(), { status: response.status });
}
