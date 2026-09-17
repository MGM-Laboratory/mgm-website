export type { HomeContent, HomeVideoMode } from "@repo/shared";

/** Resolves an uploaded home-video key to a loadable, range-seekable URL. */
export function homeVideoUrl(key?: string) {
  if (!key) return undefined;
  return `/api/home-cms/video/${encodeURIComponent(key)}`;
}
