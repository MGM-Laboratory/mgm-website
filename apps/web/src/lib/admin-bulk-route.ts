import "server-only";

import { NextResponse } from "next/server";

import type { AdminPageId } from "@/lib/admin-permissions";
import { gateAdminRequest, proxyJson } from "@/lib/admin-proxy";

/**
 * A route that applies one action to many records. Most actions only change a record, but `delete` removes the records and
 * the stored files, so it needs the delete permission of the page and not only the write permission.
 */
export function bulkRoute(page: AdminPageId, cmsPath: string) {
  return {
    async POST(request: Request) {
      const write = await gateAdminRequest(page, "write");
      if (!write.ok) return write.response;

      const body: unknown = await request.json().catch(() => null);
      if (body === null || typeof body !== "object") {
        return NextResponse.json({ message: "The request body must be JSON." }, { status: 400 });
      }
      if ((body as { action?: unknown }).action === "delete") {
        const remove = await gateAdminRequest(page, "delete");
        if (!remove.ok) return remove.response;
      }
      return proxyJson(cmsPath, { body: JSON.stringify(body), method: "POST" });
    },
  };
}
