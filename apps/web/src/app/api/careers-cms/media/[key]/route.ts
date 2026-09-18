import { mediaPlaybackRoute } from "@/lib/cms-media-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The API owns key validation for job-description images.
export const { GET } = mediaPlaybackRoute((key) => `/cms/jobs/media/${encodeURIComponent(key)}`);
