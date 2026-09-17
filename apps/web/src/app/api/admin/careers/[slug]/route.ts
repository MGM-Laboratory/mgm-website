import { detailRoute, gateAdminRequest } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PUT, DELETE } = detailRoute(
  () => gateAdminRequest("careers", "write"),
  () => gateAdminRequest("careers", "delete"),
  (slug) => `/cms/jobs/${encodeURIComponent(slug)}`,
);
