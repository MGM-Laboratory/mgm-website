import { bulkRoute } from "@/lib/admin-bulk-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { POST } = bulkRoute("events", "/cms/events/registrations/bulk");
