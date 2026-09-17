import { NextResponse } from "next/server";

import type { AdminAction, AdminPageId } from "@/lib/admin-permissions";
import { requireAdminPermission, requireSuperadmin, type AdminSession } from "@/lib/admin-session";
import { apiBaseUrl, cmsApi } from "@/lib/cms-api";

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

type SlugContext = { params: Promise<{ slug: string }> };

/**
 * A GET-list route: gate on read, then proxy straight through. Every simple
 * CMS resource (articles, careers, projects, …) has one of these — a
 * generator here, rather than a copy of the same three-line body in every
 * route.ts, is what actually keeps them from being flagged as clones (a
 * repeated one-line call site is below any duplication detector's block
 * threshold; a repeated function body isn't).
 */
export function listRoute(gate: () => Promise<AdminGate>, cmsPath: string) {
  return {
    async GET() {
      const g = await gate();
      if (!g.ok) return g.response;
      return proxyJson(cmsPath);
    },
  };
}

/** A PUT (replace) + DELETE detail route for a `[slug]` segment. */
export function detailRoute(
  writeGate: () => Promise<AdminGate>,
  deleteGate: () => Promise<AdminGate>,
  cmsPath: (slug: string) => string,
) {
  return {
    async PUT(request: Request, { params }: SlugContext) {
      const g = await writeGate();
      if (!g.ok) return g.response;
      const { slug } = await params;
      return proxyJson(cmsPath(slug), {
        body: JSON.stringify(await request.json()),
        method: "PUT",
      });
    },
    async DELETE(_request: Request, { params }: SlugContext) {
      const g = await deleteGate();
      if (!g.ok) return g.response;
      const { slug } = await params;
      return proxyJson(cmsPath(slug), { method: "DELETE" });
    },
  };
}

/**
 * A GET + PUT route for a singleton record (no slug) — e.g. a single
 * settings row. Same shape as listRoute/detailRoute, just for the one CMS
 * collection that's a single row instead of a list of records.
 */
export function singletonRoute(
  readGate: () => Promise<AdminGate>,
  writeGate: () => Promise<AdminGate>,
  cmsPath: string,
) {
  return {
    async GET() {
      const g = await readGate();
      if (!g.ok) return g.response;
      return proxyJson(cmsPath);
    },
    async PUT(request: Request) {
      const g = await writeGate();
      if (!g.ok) return g.response;
      return proxyJson(cmsPath, { body: JSON.stringify(await request.json()), method: "PUT" });
    },
  };
}

const DEFAULT_MAX_VIDEO_BYTES = 524_288_000;

function maxVideoBytes() {
  return Number(process.env.CMS_MAX_VIDEO_BYTES ?? DEFAULT_MAX_VIDEO_BYTES);
}

/**
 * Streams a raw video upload through to the API untouched (no buffering, so
 * memory use stays flat regardless of file size), after the same
 * content-type/size checks every video-upload route needs.
 */
export function videoUploadRoute(gate: () => Promise<AdminGate>, cmsPath: string) {
  return {
    async POST(request: Request) {
      const g = await gate();
      if (!g.ok) return g.response;

      const contentType = request.headers.get("content-type") ?? "";
      if (contentType !== "video/mp4" && contentType !== "video/webm") {
        return NextResponse.json(
          { message: "The video must be an MP4 or WebM file." },
          { status: 400 },
        );
      }
      const contentLength = Number(request.headers.get("content-length"));
      if (contentLength && contentLength > maxVideoBytes()) {
        return NextResponse.json(
          { message: `The video must be under ${Math.floor(maxVideoBytes() / 1024 / 1024)} MB.` },
          { status: 413 },
        );
      }

      const response = await fetch(`${apiBaseUrl()}${cmsPath}`, {
        body: request.body,
        headers: {
          "content-type": contentType,
          "x-cms-passphrase": process.env.ADMIN_PASSPHRASE ?? "",
        },
        method: "POST",
        // Node's fetch requires an explicit duplex mode for streamed bodies.
        duplex: "half",
      } as RequestInit);
      return NextResponse.json(await response.json(), { status: response.status });
    },
  };
}
