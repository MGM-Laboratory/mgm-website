import { bundledMediaPath, mediaPlaybackRoute } from "@/lib/cms-media-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET } = mediaPlaybackRoute(
  (key) => `/cms/projects/media/${encodeURIComponent(key)}`,
  { staticAssetPath: bundledMediaPath },
);
