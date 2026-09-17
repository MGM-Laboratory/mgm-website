export type { HomeContent, HomeVideoMode } from "@repo/shared";

/** Resolves an uploaded home-video key to a loadable, range-seekable URL. */
export function homeVideoUrl(key?: string) {
  if (!key) return undefined;
  return `/api/home-cms/video/${encodeURIComponent(key)}`;
}

const YOUTUBE_ID_PATTERN =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i;

/** Extracts the video id from any of YouTube's URL shapes (watch/embed/shorts/short link). */
export function youtubeVideoId(url: string): string | undefined {
  return url.match(YOUTUBE_ID_PATTERN)?.[1];
}
