import { gateAdminRequest, listRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET } = listRoute(
  () => gateAdminRequest("events", "read"),
  "/cms/events/registrations",
);
