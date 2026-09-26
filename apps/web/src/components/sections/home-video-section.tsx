"use client";

import { useLayoutEffect, useRef } from "react";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/base.css";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import type { HomeContent } from "@repo/shared";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { homeVideoSource } from "@/lib/home-cms";

/** Admin-configurable homepage video block — renders nothing until a video is uploaded. */
export function HomeVideoSection({ content }: Readonly<{ content: HomeContent }>) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  const src = homeVideoSource(content);
  if (!src) return null;

  return (
    <section ref={rootRef} className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <div className="reveal-card overflow-hidden rounded-2xl opacity-0">
          <MediaPlayer aspectRatio="16/9" src={src} title="MGM Laboratory" viewType="video">
            <MediaProvider />
            <DefaultVideoLayout icons={defaultLayoutIcons} />
          </MediaPlayer>
        </div>
      </div>
    </section>
  );
}
