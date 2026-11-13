import { mediaPlaybackRoute } from "@/lib/cms-media-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Only a portrait key is served here, in the shape that the portrait upload of the API writes.
const MEMBER_MEDIA_KEY_PATTERN =
  /^member-[a-z0-9-]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;

export const { GET } = mediaPlaybackRoute(
  (key) => `/cms/members/media/${encodeURIComponent(key)}`,
  { keyPattern: MEMBER_MEDIA_KEY_PATTERN },
);
