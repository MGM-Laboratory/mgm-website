"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { DetailMediaItem } from "@/components/projects/detail/detail-data";
import { useMotionPreference } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

import styles from "./project-detail.module.css";

/** Unknown sizes lay out at 16:9 until the file reports its own. */
export const FALLBACK_ASPECT = 16 / 9;

export function mediaAspect(item: Pick<DetailMediaItem, "width" | "height">) {
  return item.width > 0 && item.height > 0 ? item.width / item.height : FALLBACK_ASPECT;
}

type DetailMediaProps = {
  item: DetailMediaItem;
  index: number;
  /** The file reported its intrinsic size (it may differ from the stored one). */
  onSize(id: string, width: number, height: number): void;
  /** The file failed to load: the page drops the item from the layout. */
  onFail(id: string): void;
};

/**
 * One media section. The <figure> is the layout box (the WebGL stage reads
 * its rect, so nothing ever transforms it); `.frame` clips and carries the
 * scroll-speed response, `.content` the emerge zoom and the placeholder
 * colour. The page's controller drives play and pause, the emerge and the
 * stage's ownership through data attributes, never through React state.
 */
export function DetailMedia({ item, index, onSize, onFail }: DetailMediaProps) {
  const figureRef = useRef<HTMLElement>(null);
  const aspect = mediaAspect(item);
  // The first two load at once and at high priority: they are the first
  // screen. The rest load lazily (the controller promotes the ones about to
  // scroll in, since native lazy loading can't see ahead inside the
  // clipped horizontal stage).
  const eager = index < 2;

  // Media events can fire before hydration attaches the handlers (a cached
  // image, a video's metadata): settle whatever already happened.
  useEffect(() => {
    const figure = figureRef.current;
    const image = figure?.querySelector("img");
    const video = figure?.querySelector("video");
    if (image?.complete) {
      if (image.naturalWidth > 0) {
        figure?.setAttribute("data-loaded", "");
        onSize(item.id, image.naturalWidth, image.naturalHeight);
      } else if (image.currentSrc) {
        onFail(item.id);
      }
    }
    if (video) {
      if (video.error) {
        onFail(item.id);
        return;
      }
      if (video.readyState >= 2 || (item.poster && video.readyState >= 1)) {
        figure?.setAttribute("data-loaded", "");
      }
      if (video.readyState >= 1 && video.videoWidth && video.videoHeight) {
        onSize(item.id, video.videoWidth, video.videoHeight);
      }
    }
  }, [item.id, item.poster, onFail, onSize]);

  const style = { "--aspect": String(aspect) } as CSSProperties;

  return (
    <figure
      className={cn(styles.item, item.full && styles.full)}
      data-detail-item=""
      data-id={item.id}
      data-kind={item.kind}
      data-full={item.full ? "" : undefined}
      ref={figureRef}
      style={style}
    >
      <div className={styles.frame} data-frame="">
        <div className={styles.content}>
          {item.kind === "image" ? (
            // CMS media stays a plain image: the files are signed CMS assets,
            // outside Next's image loader.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={item.alt}
              className={styles.media}
              decoding="async"
              fetchPriority={eager ? "high" : "auto"}
              height={item.height || undefined}
              loading={eager ? "eager" : "lazy"}
              onError={() => onFail(item.id)}
              onLoad={(event) => {
                const image = event.currentTarget;
                figureRef.current?.setAttribute("data-loaded", "");
                onSize(item.id, image.naturalWidth, image.naturalHeight);
              }}
              src={item.src}
              width={item.width || undefined}
            />
          ) : (
            <video
              aria-label={item.alt}
              className={styles.media}
              data-detail-video=""
              loop
              muted
              onError={() => onFail(item.id)}
              onLoadedData={() => figureRef.current?.setAttribute("data-loaded", "")}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (item.poster) figureRef.current?.setAttribute("data-loaded", "");
                if (video.videoWidth && video.videoHeight) {
                  onSize(item.id, video.videoWidth, video.videoHeight);
                }
              }}
              playsInline
              poster={item.poster}
              preload="metadata"
              src={item.src}
            />
          )}
        </div>
      </div>
      {item.kind === "video" ? <VideoToggle figureRef={figureRef} label={item.alt} /> : null}
    </figure>
  );
}

/**
 * The per-video pause and play control (WCAG 2.2.2: anything that moves on
 * its own for more than five seconds can be paused). It records the
 * visitor's choice on the <video> element, which the controller respects:
 * a paused video stays paused, and under reduced motion only a video the
 * visitor started plays.
 */
function VideoToggle({
  figureRef,
  label,
}: {
  figureRef: React.RefObject<HTMLElement | null>;
  label: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const motion = useMotionPreference();

  useEffect(() => {
    const video = figureRef.current?.querySelector("video");
    if (!video) return;
    const sync = () => setPlaying(!video.paused);
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    sync();
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
    };
  }, [figureRef]);

  const toggle = () => {
    const video = figureRef.current?.querySelector("video");
    if (!video) return;
    if (video.paused) {
      delete video.dataset.userPaused;
      video.dataset.userPlayed = "";
      setUserPaused(false);
      void video.play().catch(() => undefined);
    } else {
      delete video.dataset.userPlayed;
      video.dataset.userPaused = "";
      setUserPaused(true);
      video.pause();
    }
  };

  // Stays visible while the video is stopped for good (paused by the
  // visitor, or never autoplayed under reduced motion); otherwise it shows
  // on hover and focus only.
  const pinned = !playing && (userPaused || !motion);

  return (
    <button
      aria-label={`${playing ? "Pause" : "Play"} video: ${label}`}
      className={styles.toggle}
      data-paused={pinned ? "" : undefined}
      onClick={toggle}
      type="button"
    >
      {playing ? (
        <Pause aria-hidden="true" fill="currentColor" strokeWidth={2.25} />
      ) : (
        <Play aria-hidden="true" fill="currentColor" strokeWidth={2.25} />
      )}
    </button>
  );
}
