import { gateAdminRequest, singletonRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET, PUT } = singletonRoute(
  () => gateAdminRequest("home", "read"),
  () => gateAdminRequest("home", "write"),
  "/cms/home",
);
