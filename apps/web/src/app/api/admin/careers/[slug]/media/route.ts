import { gateAdminRequest, slugPostRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// BlockNote image embeds use the same JSON relay as other record media.
export const { POST } = slugPostRoute(
  () => gateAdminRequest("careers", "write"),
  (slug) => `/cms/jobs/${encodeURIComponent(slug)}/media`,
);
