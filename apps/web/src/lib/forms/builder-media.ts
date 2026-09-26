/**
 * Media helpers for the form builder: YouTube and Vimeo link parsing, their
 * thumbnails, and the best URL to preview a form media item with. Uploads
 * made in this session keep their data URL in memory, so a draft form's
 * images show immediately even before the public media route serves them.
 */

import type { FormMedia } from "@repo/shared";

import { formMediaUrl } from "@/lib/forms/admin-api";
import { parseVimeoId, parseYoutubeId } from "@/lib/project-cms";

export type VideoLink = { kind: "youtube" | "vimeo"; id: string; url: string };

/** Any YouTube or Vimeo share link → its id and a canonical URL. */
export function parseVideoLink(value: string): VideoLink | undefined {
  const url = value.trim();
  if (!url) return undefined;
  const youtube = parseYoutubeId(url);
  if (youtube)
    return { kind: "youtube", id: youtube, url: `https://www.youtube.com/watch?v=${youtube}` };
  const vimeo = parseVimeoId(url);
  if (vimeo) return { kind: "vimeo", id: vimeo, url: `https://vimeo.com/${vimeo}` };
  return undefined;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^\d{1,15}$/;

/** A video's thumbnail; the id comes from pasted text, so only a well-formed id gets a URL. */
export function youtubeThumb(id: string) {
  return YOUTUBE_ID.test(id)
    ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`
    : undefined;
}

export function vimeoThumb(id: string) {
  return VIMEO_ID.test(id) ? `https://vumbnail.com/${encodeURIComponent(id)}.jpg` : undefined;
}

/** Data URLs of images uploaded in this session, by storage key. */
export const localPreviews = new Map<string, string>();

export function rememberPreview(key: string, dataUrl: string) {
  localPreviews.set(key, dataUrl);
}

/**
 * The URL to show `media` with: a session upload's data URL first, then the
 * form media route for a stored key, then the external URL (a YouTube or
 * Vimeo link shows its thumbnail).
 */
export function mediaPreviewUrl(
  media: FormMedia,
  previews: Map<string, string> = localPreviews,
): string | undefined {
  if (media.key) return previews.get(media.key) ?? formMediaUrl(media.key);
  if (!media.url) return undefined;
  if (media.kind === "youtube" || media.kind === "vimeo") {
    const link = parseVideoLink(media.url);
    if (!link) return undefined;
    return link.kind === "youtube" ? youtubeThumb(link.id) : vimeoThumb(link.id);
  }
  return media.url;
}

/** Whether the preview URL is a still image (true) or a playable video file (false). */
export function previewIsImage(media: FormMedia) {
  return media.kind !== "video";
}
