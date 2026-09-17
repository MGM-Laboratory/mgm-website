import { videoPlaybackRoute } from "@/lib/video-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Demo videos live behind the same signed-URL flow as other CMS media, but
// the <video> element relies on HTTP range requests to seek without
// downloading the whole file. Range headers are relayed to storage and the
// 206 responses streamed back, mirroring the publications paper viewer.
const VIDEO_KEY_PATTERN =
  /^demo-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/;

export const { GET } = videoPlaybackRoute(
  VIDEO_KEY_PATTERN,
  (key) => `/cms/projects/video/${encodeURIComponent(key)}`,
);
