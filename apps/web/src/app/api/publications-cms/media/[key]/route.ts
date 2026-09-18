import { mediaPlaybackRoute } from "@/lib/cms-media-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Author portraits are minted by the photo upload endpoint; the key shape is
// verified here before anything is asked of storage.
const AUTHOR_PHOTO_KEY_PATTERN =
  /^author-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|webp)$/;

export const { GET } = mediaPlaybackRoute(
  (key) => `/cms/publications/media/${encodeURIComponent(key)}`,
  { keyPattern: AUTHOR_PHOTO_KEY_PATTERN },
);
