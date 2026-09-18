"use client";

import { useLayoutEffect, useRef } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { useSpotlight } from "@/lib/spotlight";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { WEBSITE_FOCUS_STACK, type FocusStackCategory } from "@/data/website-focus";
import type { CompetencyColor } from "@/data/competencies";

// Non-photo cells carry their accent as a real background tint (the
// design system's own -50 tokens, paired with the site's established
// dark-mode convention of swapping to a low-opacity brand fill — see
// research/projects detail pages) rather than a border-only accent on a
// white card, which read as thin/generic in review.
const ACCENT_BG: Record<CompetencyColor, string> = {
  blue: "bg-brand-blue-50 dark:bg-brand-blue/15",
  red: "bg-brand-red-50 dark:bg-brand-red/15",
  yellow: "bg-brand-yellow-50 dark:bg-brand-yellow/20",
  green: "bg-brand-green-50 dark:bg-brand-green/15",
};

const ACCENT_BORDER: Record<CompetencyColor, string> = {
  blue: "border-t-brand-blue",
  red: "border-t-brand-red",
  yellow: "border-t-brand-yellow",
  green: "border-t-brand-green",
};

const ACCENT_TEXT: Record<CompetencyColor, string> = {
  blue: "text-brand-blue dark:text-[#9db8e8]",
  red: "text-brand-red dark:text-[#ef9a9a]",
  yellow: "text-[color-mix(in_srgb,var(--brand-yellow)_65%,var(--ink))] dark:text-[#e3c36a]",
  green: "text-brand-green dark:text-[#7cc9a5]",
};

const GRID_SPAN: Record<string, string> = {
  plan: "sm:col-span-2",
  design: "sm:col-span-1",
  build: "sm:col-span-1 sm:row-span-2",
  watch: "sm:col-span-2",
  automate: "sm:col-span-1",
  reach: "sm:col-span-4",
};

function BentoCard({ category }: Readonly<{ category: FocusStackCategory }>) {
  const cardRef = useRef<HTMLDivElement>(null);
  useSpotlight(cardRef);
  const hasPhoto = Boolean(category.photo);

  return (
    <div
      ref={cardRef}
      className={cn(
        "group/card reveal-card relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-3xl p-7 opacity-0 sm:p-8",
        GRID_SPAN[category.id],
        hasPhoto
          ? "text-white"
          : cn("border-t-4", ACCENT_BORDER[category.accent], ACCENT_BG[category.accent]),
      )}
    >
      {hasPhoto ? (
        <>
          <Image
            src={category.photo!}
            alt=""
            fill
            sizes="(min-width: 640px) 40vw, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
        </>
      ) : null}

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100",
          hasPhoto
            ? "[background:radial-gradient(360px_circle_at_var(--mx,50%)_var(--my,50%),rgba(255,255,255,0.18),transparent_60%)]"
            : "[background:radial-gradient(360px_circle_at_var(--mx,50%)_var(--my,50%),rgba(0,0,0,0.06),transparent_60%)] dark:[background:radial-gradient(360px_circle_at_var(--mx,50%)_var(--my,50%),rgba(255,255,255,0.08),transparent_60%)]",
        )}
      />

      <div className="relative flex items-start justify-between">
        <span
          className={cn("font-mono text-xs", hasPhoto ? "text-white/60" : "text-foreground/40")}
        >
          {category.index} / 06
        </span>
      </div>

      <div className="relative">
        <h3
          className={cn(
            "font-display text-2xl font-semibold tracking-tight",
            hasPhoto ? "text-white" : "text-foreground",
          )}
        >
          {category.title}
        </h3>
        <p
          className={cn("mt-1 text-sm", hasPhoto ? "text-white/75" : ACCENT_TEXT[category.accent])}
        >
          {category.tagline}
        </p>
        <p
          className={cn("mt-3 max-w-sm text-sm", hasPhoto ? "text-white/70" : "text-foreground/60")}
        >
          {category.body}
        </p>
        <p
          className={cn(
            "mt-4 font-mono text-xs tracking-wide",
            hasPhoto ? "text-white/50" : "text-foreground/40",
          )}
        >
          {category.tools.join(" · ")}
        </p>
      </div>
    </div>
  );
}

export function StackBento() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.08 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <section id="stack" className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>
      <div ref={rootRef} className="mx-auto max-w-5xl">
        <p className="font-mono text-xs font-semibold tracking-wide text-brand-blue uppercase">
          The desk
        </p>
        <h2 className="mt-3 max-w-2xl font-display text-[clamp(1.75rem,3vw+1rem,2.5rem)] font-semibold tracking-tight text-foreground">
          Six monitors, one build.
        </h2>
        <p className="mt-4 max-w-2xl text-foreground/60">
          This is roughly what&apos;s open on a real desk here, at any given time.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:auto-rows-[260px] sm:grid-cols-4">
          {WEBSITE_FOCUS_STACK.map((category) => (
            <BentoCard key={category.id} category={category} />
          ))}
        </div>
      </div>
    </section>
  );
}
