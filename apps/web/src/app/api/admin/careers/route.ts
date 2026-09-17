import { gateAdminRequest, listRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The admin list endpoint includes drafts and closed roles.
export const { GET } = listRoute(() => gateAdminRequest("careers", "read"), "/cms/jobs/admin");
