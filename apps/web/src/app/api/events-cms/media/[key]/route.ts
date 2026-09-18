import { mediaPlaybackRoute } from "@/lib/cms-media-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET } = mediaPlaybackRoute((key) => `/cms/events/media/${encodeURIComponent(key)}`);
