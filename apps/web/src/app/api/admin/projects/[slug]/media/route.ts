import { gateAdminRequest, slugPostRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { POST } = slugPostRoute(
  () => gateAdminRequest("projects", "write"),
  (slug) => `/cms/projects/${encodeURIComponent(slug)}/media`,
);
