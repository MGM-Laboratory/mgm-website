import { detailRoute, gateAdminRequest } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PUT, DELETE } = detailRoute(
  () => gateAdminRequest("events", "write"),
  () => gateAdminRequest("events", "delete"),
  (slug) => `/cms/events/${encodeURIComponent(slug)}`,
);
