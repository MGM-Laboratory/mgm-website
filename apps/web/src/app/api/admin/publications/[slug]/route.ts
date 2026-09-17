import { detailRoute, gateAdminRequest } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PUT, DELETE } = detailRoute(
  () => gateAdminRequest("publications", "write"),
  () => gateAdminRequest("publications", "delete"),
  (slug) => `/cms/publications/${encodeURIComponent(slug)}`,
);
