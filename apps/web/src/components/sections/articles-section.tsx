"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";

const FILTERS = ["All", "Mobile", "Web", "Interactive Media", "UX Research"] as const;

const ARTICLES = [
  { title: "Designing for touch-first research tools", tag: "UX Research" },
  { title: "Shipping a mobile prototype in a week", tag: "Mobile" },
  { title: "What makes an interface feel alive", tag: "Web" },
  { title: "Notes from our latest usability study", tag: "UX Research" },
  { title: "Building an interactive media pipeline", tag: "Interactive Media" },
  { title: "A faster path from idea to prototype", tag: "Web" },
];

export function ArticlesSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.08 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  const visible = filter === "All" ? ARTICLES : ARTICLES.filter((a) => a.tag === filter);

  return (
    <section ref={rootRef} className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
            Articles
          </h2>
          <p className="reveal-card max-w-md text-foreground/60 opacity-0">
            Notes on research, design, and engineering from the lab.
          </p>
        </div>

        <div className="reveal-card mt-8 flex flex-wrap gap-2 opacity-0">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-colors",
                f === filter
                  ? "border-brand-blue text-brand-blue"
                  : "border-[var(--line)] text-foreground/60 hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Not part of the scroll-in reveal — the grid changes contents
            when the filter above changes, so it stays plainly visible
            rather than being tied to a one-time scroll animation. */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {visible.map((a) => (
            <article key={a.title}>
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-[var(--surface-muted)]">
                <ImageIcon className="size-10 text-foreground/25" strokeWidth={1.5} />
              </div>
              <p className="mt-3 text-xs font-medium tracking-wide text-foreground/45 uppercase">
                {a.tag}
              </p>
              <h3 className="mt-1 font-display font-medium text-foreground">{a.title}</h3>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
