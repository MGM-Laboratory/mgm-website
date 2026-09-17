"use client";

import { useLayoutEffect, useRef } from "react";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/base.css";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import type { HomeContent } from "@repo/shared";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { homeVideoUrl, youtubeVideoId } from "@/lib/home-cms";

function resolveSrc(content: HomeContent): string | undefined {
  if (content.videoMode === "upload") return homeVideoUrl(content.videoKey);
  if (content.videoMode === "url") return content.videoUrl;
  return undefined;
}

/**
 * YouTube gets the platform's own embed iframe rather than routing through
 * Vidstack — Vidstack's YouTube provider still renders its own custom
 * control skin over the video, but a YouTube link should show YouTube's own
 * familiar player chrome, not a lookalike.
 */
function YouTubeEmbed({ url, title }: Readonly<{ url: string; title: string }>) {
  const videoId = youtubeVideoId(url);
  if (!videoId) return null;
  return (
    <iframe
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      className="aspect-video w-full"
      src={`https://www.youtube.com/embed/${videoId}`}
      title={title}
    />
  );
}

/** Admin-configurable homepage video block — renders nothing until a video is set. */
export function HomeVideoSection({ content }: Readonly<{ content: HomeContent }>) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  const isYouTube = content.videoMode === "youtube" && content.videoUrl;
  const src = resolveSrc(content);
  if (!isYouTube && !src) return null;

  return (
    <section ref={rootRef} className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        {content.videoTitle ? (
          <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
            {content.videoTitle}
          </h2>
        ) : null}
        {content.videoDescription ? (
          <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">
            {content.videoDescription}
          </p>
        ) : null}

        <div className="reveal-card mt-10 overflow-hidden rounded-2xl opacity-0">
          {isYouTube && content.videoUrl ? (
            <YouTubeEmbed title={content.videoTitle || "MGM Laboratory"} url={content.videoUrl} />
          ) : src ? (
            <MediaPlayer
              aspectRatio="16/9"
              src={src}
              title={content.videoTitle || "MGM Laboratory"}
              viewType="video"
            >
              <MediaProvider />
              <DefaultVideoLayout icons={defaultLayoutIcons} />
            </MediaPlayer>
          ) : null}
        </div>
      </div>
    </section>
  );
}
