"use client";

import { useLayoutEffect, useRef } from "react";
import Image from "next/image";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { MonitorWindow } from "./monitor-window";

/**
 * A real screenshot of this exact site — not a mockup, not a stand-in.
 * The most honest possible proof for a page about building websites.
 */
export function LiveProof() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <section className="bg-[var(--surface-muted)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>
      <div ref={rootRef} className="mx-auto max-w-5xl">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="reveal-card opacity-0">
            <p className="font-mono text-xs font-semibold tracking-wide text-brand-green uppercase">
              Not a mockup
            </p>
            <h2 className="mt-3 font-display text-[clamp(1.75rem,3vw+1rem,2.5rem)] font-semibold tracking-tight text-foreground">
              This exact page is the portfolio piece.
            </h2>
            <p className="mt-4 max-w-md text-foreground/60">
              Every animation, every breakpoint, every dark-mode toggle you can try right now on
              this site was built with the same stack described above. No staged screenshot — the
              real thing, live, while you&apos;re looking at it.
            </p>
          </div>

          <div className="reveal-card opacity-0">
            <MonitorWindow url="labmgm.org">
              <div className="relative aspect-[16/10] w-full overflow-hidden">
                <Image
                  src="/focus/website/photos/site-screenshot.png"
                  alt="A screenshot of the MGM Laboratory homepage — this exact site"
                  fill
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  className="object-cover object-top"
                />
              </div>
            </MonitorWindow>
          </div>
        </div>
      </div>
    </section>
  );
}
