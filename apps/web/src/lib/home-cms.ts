import type { HomeContent } from "@repo/shared";

export type { HomeContent, HomeVideoMode } from "@repo/shared";

/** Resolves an uploaded home-video key to a loadable, range-seekable URL. */
export function homeVideoUrl(key?: string) {
  if (!key) return undefined;
  return `/api/home-cms/video/${encodeURIComponent(key)}`;
}

/** The playable source for the saved homepage video, if one is uploaded. */
export function homeVideoSource(content: HomeContent) {
  return content.videoMode === "upload" ? homeVideoUrl(content.videoKey) : undefined;
}
