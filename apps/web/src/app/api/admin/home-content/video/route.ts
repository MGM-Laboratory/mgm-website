import { gateAdminRequest, videoUploadRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { POST } = videoUploadRoute(
  () => gateAdminRequest("home", "write"),
  "/cms/home/video",
);
