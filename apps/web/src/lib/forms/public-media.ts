import type { FormMedia } from "@repo/shared";

/**
 * Where a form's design media come from: an admin upload (served through
 * the site's `/api/forms/media/<key>` redirect) or a pasted link.
 */

export function formMediaSrc(media: Pick<FormMedia, "key" | "url"> | undefined) {
  if (!media) return undefined;
  if (media.key) return `/api/forms/media/${encodeURIComponent(media.key)}`;
  return media.url;
}

export function formPosterSrc(media: FormMedia | undefined) {
  if (!media?.posterKey) return undefined;
  return `/api/forms/media/${encodeURIComponent(media.posterKey)}`;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;

/** The video id of a YouTube link (watch, youtu.be, embed, shorts), or null. */
export function youtubeId(url: string | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = parsed.pathname.slice(1).split("/")[0];
    else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      id =
        parsed.searchParams.get("v") ??
        parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ??
        null;
    }
    return id && YOUTUBE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The numeric id of a Vimeo link, or null. */
export function vimeoId(url: string | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.replace(/^www\.|^player\./, "").endsWith("vimeo.com")) return null;
    return parsed.pathname.match(/\/(?:video\/)?(\d{5,12})(?:\/|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The privacy-friendly player address, loaded only after a click. */
export function embedSrc(media: FormMedia) {
  if (media.kind === "youtube") {
    const id = youtubeId(media.url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null;
  }
  if (media.kind === "vimeo") {
    const id = vimeoId(media.url);
    return id ? `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1` : null;
  }
  return null;
}

export function youtubeThumb(media: FormMedia) {
  const id = media.kind === "youtube" ? youtubeId(media.url) : null;
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}

/** `object-position` from a focal point in percent. */
export function focalPosition(media: FormMedia | undefined) {
  if (!media) return undefined;
  return `${media.focalX ?? 50}% ${media.focalY ?? 50}%`;
}
