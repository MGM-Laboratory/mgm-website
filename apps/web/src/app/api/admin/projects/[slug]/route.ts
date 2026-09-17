import { detailRoute, gateAdminRequest } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PUT, DELETE } = detailRoute(
  () => gateAdminRequest("projects", "write"),
  () => gateAdminRequest("projects", "delete"),
  (slug) => `/cms/projects/${encodeURIComponent(slug)}`,
);
