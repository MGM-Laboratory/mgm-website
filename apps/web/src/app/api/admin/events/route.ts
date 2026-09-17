import { gateAdminRequest, listRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The admin list endpoint includes unpublished drafts.
export const { GET } = listRoute(() => gateAdminRequest("events", "read"), "/cms/events/admin");
