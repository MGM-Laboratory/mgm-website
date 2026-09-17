import { detailRoute, gateAdminRequest } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PUT, DELETE } = detailRoute(
  () => gateAdminRequest("members", "write"),
  () => gateAdminRequest("members", "delete"),
  (slug) => `/cms/members/${encodeURIComponent(slug)}`,
);
