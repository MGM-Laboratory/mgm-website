import { detailRoute, gateAdminRequest } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PUT, DELETE } = detailRoute(
  () => gateAdminRequest("articles", "write"),
  () => gateAdminRequest("articles", "delete"),
  (slug) => `/cms/articles/${encodeURIComponent(slug)}`,
);
