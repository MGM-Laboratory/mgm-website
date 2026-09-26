"use client";

import { useState, type CSSProperties } from "react";
import { Play } from "lucide-react";
import type { FormMedia } from "@repo/shared";

import {
  embedSrc,
  focalPosition,
  formMediaSrc,
  formPosterSrc,
  youtubeThumb,
} from "@/lib/forms/public-media";

import { useFormCopyOptional } from "./use-copy";

/**
 * A picture or video placed in a form. Pictures and uploaded videos render
 * directly (videos that autoplay stay muted and loop). YouTube and Vimeo
 * render a thumbnail and a play button, and load the player (the
 * privacy-enhanced youtube-nocookie domain, Vimeo with do-not-track) only
 * after a click.
 */
export function FormMediaView({
  media,
  className,
  cover = false,
  eager = false,
}: {
  media: FormMedia;
  className?: string;
  /** Fill the box (a cover), cropping at the focal point. */
  cover?: boolean;
  eager?: boolean;
}) {
  const copy = useFormCopyOptional();
  const [playing, setPlaying] = useState(false);
  const fit = cover ? "cover" : (media.fit ?? "cover");
  const style: CSSProperties = { objectFit: fit, objectPosition: focalPosition(media) };
  const ratio =
    media.width && media.height && !cover ? `${media.width} / ${media.height}` : undefined;

  if (media.kind === "image") {
    const src = formMediaSrc(media);
    if (!src) return null;
    return (
      <div
        className={`fx-media ${className ?? ""}`}
        style={ratio ? { aspectRatio: ratio } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={media.alt ?? ""}
          style={style}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
        />
      </div>
    );
  }

  if (media.kind === "video") {
    const src = formMediaSrc(media);
    if (!src) return null;
    const autoplay = media.autoplay ?? cover;
    return (
      <div
        className={`fx-media ${className ?? ""}`}
        style={ratio ? { aspectRatio: ratio } : undefined}
      >
        <video
          src={src}
          poster={formPosterSrc(media)}
          style={style}
          autoPlay={autoplay}
          muted={autoplay || media.muted}
          loop={media.loop ?? autoplay}
          playsInline
          controls={!cover}
          aria-label={media.alt}
        />
      </div>
    );
  }

  const embed = embedSrc(media);
  if (!embed) return null;
  if (playing) {
    return (
      <div className={`fx-media fx-media-embed ${className ?? ""}`}>
        <iframe
          src={embed}
          title={media.alt || (media.kind === "youtube" ? "YouTube video" : "Vimeo video")}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  const thumb = formPosterSrc(media) ?? youtubeThumb(media);
  return (
    <div className={`fx-media fx-media-embed ${className ?? ""}`}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" style={style} loading="lazy" decoding="async" />
      ) : (
        <span className="fx-media-placeholder" aria-hidden />
      )}
      <button type="button" className="fx-media-play" onClick={() => setPlaying(true)}>
        <span className="fx-media-play-disc">
          <Play aria-hidden strokeWidth={2.25} size={22} />
        </span>
        <span className="fx-media-play-text">
          <span>{copy?.playVideo ?? "Play video"}</span>
          <small>{copy?.videoConsent ?? ""}</small>
        </span>
      </button>
    </div>
  );
}
