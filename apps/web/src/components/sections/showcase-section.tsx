"use client";

import { useLayoutEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, ImageIcon } from "lucide-react";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PatternTile } from "@/components/process/pattern-tile";

export type ShowcaseItem = {
  title: string;
  description: string;
};

const CARD_ICONS = [
  { kind: "circle", fg: "blue" },
  { kind: "square", fg: "red" },
  { kind: "x", fg: "yellow" },
] as const;

export function ShowcaseSection({
  id,
  title,
  intro,
  items,
}: {
  id: string;
  title: string;
  intro: string;
  items: ShowcaseItem[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  function scrollTrack(dir: 1 | -1) {
    trackRef.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  }

  return (
    <section id={id} ref={rootRef} className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
              {title}
            </h2>
            <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">{intro}</p>
          </div>
          <div className="reveal-card hidden shrink-0 gap-2 opacity-0 sm:flex">
            <button
              type="button"
              aria-label={`Scroll ${title} left`}
              onClick={() => scrollTrack(-1)}
              className="flex size-9 items-center justify-center rounded-full border border-[var(--line)] text-foreground/60 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${title} right`}
              onClick={() => scrollTrack(1)}
              className="flex size-9 items-center justify-center rounded-full border border-[var(--line)] text-foreground/60 transition-colors hover:text-foreground"
            >
              <ArrowRight className="size-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          className="mt-10 flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none]"
        >
          {items.map((item) => (
            <article key={item.title} className="reveal-card w-[320px] shrink-0 opacity-0">
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-[var(--surface-muted)]">
                <ImageIcon className="size-10 text-foreground/25" strokeWidth={1.5} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <h3 className="font-display font-semibold text-foreground">{item.title}</h3>
                <div className="flex items-center gap-1.5">
                  {CARD_ICONS.map(({ kind, fg }, i) => (
                    <PatternTile key={i} kind={kind} bg="canvas" fg={fg} className="size-5" />
                  ))}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-foreground/60">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
