import { gateAdminRequest, slugPutRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PUT } = slugPutRoute(
  () => gateAdminRequest("contact-inquiries", "write"),
  (slug) => `/cms/contact-inquiries/${encodeURIComponent(slug)}/state`,
);
