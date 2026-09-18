"use client";

import { useLayoutEffect, useRef } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { useSpotlight } from "@/lib/spotlight";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { WEBSITE_FOCUS_STACK, type FocusStackCategory } from "@/data/website-focus";
import { TOOL_ICONS } from "@/data/tool-icons";
import type { CompetencyColor } from "@/data/competencies";

const ACCENT_BORDER: Record<CompetencyColor, string> = {
  blue: "border-t-brand-blue",
  red: "border-t-brand-red",
  yellow: "border-t-brand-yellow",
  green: "border-t-brand-green",
};

const ACCENT_CHIP: Record<CompetencyColor, string> = {
  blue: "bg-brand-blue-50 text-brand-blue",
  red: "bg-brand-red-50 text-brand-red",
  yellow: "bg-brand-yellow-50 text-[var(--ink)]",
  green: "bg-brand-green-50 text-brand-green",
};

const ACCENT_TEXT: Record<CompetencyColor, string> = {
  blue: "text-brand-blue",
  red: "text-brand-red",
  yellow: "text-[color-mix(in_srgb,var(--brand-yellow)_65%,var(--ink))]",
  green: "text-brand-green",
};

const GRID_SPAN: Record<string, string> = {
  plan: "sm:col-span-2",
  design: "sm:col-span-1",
  build: "sm:col-span-1 sm:row-span-2",
  watch: "sm:col-span-2",
  automate: "sm:col-span-1",
  reach: "sm:col-span-4",
};

function ToolChip({ tool, accent }: Readonly<{ tool: string; accent: CompetencyColor }>) {
  const Icon = TOOL_ICONS[tool];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        ACCENT_CHIP[accent],
      )}
    >
      {Icon ? <Icon size={13} className="shrink-0" /> : null}
      {tool}
    </span>
  );
}

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
        hasPhoto ? "text-white" : cn("border-t-4 bg-background", ACCENT_BORDER[category.accent]),
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
            : "[background:radial-gradient(360px_circle_at_var(--mx,50%)_var(--my,50%),rgba(0,0,0,0.05),transparent_60%)] dark:[background:radial-gradient(360px_circle_at_var(--mx,50%)_var(--my,50%),rgba(255,255,255,0.06),transparent_60%)]",
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
        <div className="mt-4 flex flex-wrap gap-1.5">
          {category.tools.map((tool) => (
            <ToolChip key={tool} tool={tool} accent={category.accent} />
          ))}
        </div>
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
