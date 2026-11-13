import { bulkRoute } from "@/lib/admin-bulk-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { POST } = bulkRoute("contact-inquiries", "/cms/contact-inquiries/bulk");
