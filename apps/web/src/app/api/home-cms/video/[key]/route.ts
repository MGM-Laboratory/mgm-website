import { IMMUTABLE_VIDEO_CACHE, videoPlaybackRoute } from "@/lib/video-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VIDEO_KEY_PATTERN =
  /^home-video-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/;

export const { GET } = videoPlaybackRoute(
  VIDEO_KEY_PATTERN,
  (key) => `/cms/home/video/${encodeURIComponent(key)}`,
  // Every upload mints a fresh uuid key and a replaced video's old key stops
  // resolving, so the bytes behind a key never change: let the browser keep
  // them and start the reel from its cache on the next visit.
  { cacheControl: IMMUTABLE_VIDEO_CACHE },
);
