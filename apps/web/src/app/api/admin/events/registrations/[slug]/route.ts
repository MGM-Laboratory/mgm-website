import { gateAdminRequest, slugPutRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PUT } = slugPutRoute(
  () => gateAdminRequest("events", "write"),
  (slug) => `/cms/events/registrations/${encodeURIComponent(slug)}/state`,
);
