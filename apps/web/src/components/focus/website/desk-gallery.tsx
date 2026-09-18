"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { cn } from "@/lib/utils";
import { WEBSITE_FOCUS_STACK, type FocusStackCategory } from "@/data/website-focus";
import type { CompetencyColor } from "@/data/competencies";
import { Marquee } from "./marquee";
import { GrainOverlay } from "./grain-overlay";
import styles from "./desk-gallery.module.css";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const PANEL_BG: Record<CompetencyColor, string> = {
  blue: "bg-brand-blue",
  red: "bg-brand-red",
  yellow: "bg-brand-yellow",
  green: "bg-brand-green",
};

const PANEL_TEXT: Record<CompetencyColor, string> = {
  blue: "text-white",
  red: "text-white",
  green: "text-white",
  yellow: "text-[var(--ink)]",
};

const PANEL_MUTED: Record<CompetencyColor, string> = {
  blue: "text-white/70",
  red: "text-white/70",
  green: "text-white/70",
  yellow: "text-[var(--ink)]/60",
};

const PANEL_BADGE: Record<CompetencyColor, string> = {
  blue: "bg-white/15",
  red: "bg-white/15",
  green: "bg-white/15",
  yellow: "bg-black/10",
};

const PANEL_LINE: Record<CompetencyColor, string> = {
  blue: "border-white/20",
  red: "border-white/20",
  green: "border-white/20",
  yellow: "border-black/15",
};

function Panel({ category }: Readonly<{ category: FocusStackCategory }>) {
  const Icon = category.icon;
  return (
    <div
      className={cn(
        styles.panel,
        "relative flex shrink-0 flex-col justify-between overflow-hidden rounded-[28px] p-7 sm:p-10 lg:rounded-[36px] lg:p-12",
        PANEL_BG[category.accent],
        PANEL_TEXT[category.accent],
      )}
    >
      <GrainOverlay className="opacity-[0.08]" />

      <div className="relative flex items-start justify-between">
        <span className={cn("font-mono text-xs sm:text-sm", PANEL_MUTED[category.accent])}>
          {category.index} / 06
        </span>
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-full sm:size-11",
            PANEL_BADGE[category.accent],
          )}
        >
          <Icon className="size-5" strokeWidth={2.25} />
        </span>
      </div>

      <div className="relative grid gap-6 sm:grid-cols-[1.1fr_0.9fr] sm:items-end sm:gap-8">
        <div>
          <h3 className="font-display text-[clamp(1.75rem,3.2vw,3rem)] leading-[0.98] font-semibold tracking-tight">
            {category.title}
          </h3>
          <p className={cn("mt-2 text-sm sm:text-base", PANEL_MUTED[category.accent])}>
            {category.tagline}
          </p>
          <p className={cn("mt-3 max-w-sm text-sm sm:text-[15px]", PANEL_MUTED[category.accent])}>
            {category.body}
          </p>
        </div>
        <div className="relative aspect-square w-full max-w-[280px] justify-self-end opacity-90">
          <Image src={category.image} alt="" fill sizes="280px" className="object-contain" />
        </div>
      </div>

      <Marquee
        items={category.tools}
        speed={55}
        className={cn("relative mt-6 border-t pt-3", PANEL_LINE[category.accent])}
        itemClassName={cn(
          "mr-7 font-mono text-[11px] tracking-wide uppercase sm:text-xs",
          PANEL_MUTED[category.accent],
        )}
      />
    </div>
  );
}

export function DeskGallery() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!section || !wrap || !track) return undefined;

    const canPin =
      window.matchMedia("(pointer: fine)").matches &&
      window.matchMedia("(min-width: 1024px)").matches &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

    if (!canPin) return undefined;

    wrap.classList.add(styles.pinned);
    queueMicrotask(() => setPinned(true));

    const distance = () => track.scrollWidth - section.clientWidth;
    // `paused: true`: an un-paused gsap.to() starts playing immediately on
    // creation (its default 0.5s duration) instead of waiting for scrub
    // control to drive it.
    const tween = gsap.to(track, { x: () => -distance(), ease: "none", paused: true });
    const trigger = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: () => `+=${distance()}`,
      pin: true,
      // `section`'s parent (<main>, in website-focus-page.tsx) is a flex
      // container — ScrollTrigger's own default disables pin-spacing
      // entirely whenever the pinned element's parent is `display: flex`
      // (see the "if the parent is display: flex, don't apply pinSpacing
      // by default" branch in gsap/src/ScrollTrigger.js), on the assumption
      // a flex sibling will reflow on its own. That assumption doesn't hold
      // here — without this, the pin has the right start/end internally but
      // no scroll runway is ever added, so the page runs out of scroll
      // distance long before the horizontal tween finishes and everything
      // after this section becomes unreachable by scrolling.
      pinSpacing: true,
      scrub: 1,
      animation: tween,
      invalidateOnRefresh: true,
    });

    return () => {
      trigger.kill();
      tween.kill();
      wrap.classList.remove(styles.pinned);
      setPinned(false);
    };
  }, []);

  // A custom "drag" cursor while the pinned track is active — the section's
  // real cursor is hidden via CSS (desk-gallery.module.css .pinned) so this
  // is the only pointer the visitor sees there. GSAP owns both x/y (via
  // quickTo) and the constant xPercent/yPercent centering offset on the
  // same element from one gsap.set() — composing them through GSAP instead
  // of mixing in a static Tailwind translate class is what keeps this clear
  // of the "static class + GSAP transform" gotcha (docs/animation-system.md).
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const cursor = cursorRef.current;
    if (!pinned || !section || !cursor) return undefined;

    gsap.set(cursor, { xPercent: -50, yPercent: -50, autoAlpha: 0 });
    const quickX = gsap.quickTo(cursor, "x", { duration: 0.35, ease: "power3.out" });
    const quickY = gsap.quickTo(cursor, "y", { duration: 0.35, ease: "power3.out" });

    function onMove(e: PointerEvent) {
      quickX(e.clientX);
      quickY(e.clientY);
      gsap.to(cursor, { autoAlpha: 1, duration: 0.2 });
    }
    function onLeave() {
      gsap.to(cursor, { autoAlpha: 0, duration: 0.2 });
    }

    section.addEventListener("pointermove", onMove);
    section.addEventListener("pointerleave", onLeave);
    return () => {
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
    };
  }, [pinned]);

  return (
    <section ref={sectionRef} id="stack" className="relative bg-background">
      <div ref={wrapRef} className={styles.wrap}>
        <div className="mx-auto w-full max-w-5xl shrink-0 px-6 sm:px-10 lg:px-16">
          <p className="font-mono text-xs font-semibold tracking-wide text-brand-blue uppercase">
            The desk
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-[clamp(1.75rem,3vw+1rem,2.5rem)] font-semibold tracking-tight text-foreground">
            Six monitors, one build.
          </h2>
          <p className="mt-4 max-w-2xl text-foreground/60">
            This is roughly what&apos;s open on a real desk here, at any given time.
          </p>
        </div>

        <div ref={trackRef} className={cn(styles.track, "mt-10 px-6 sm:px-10 lg:px-16")}>
          {WEBSITE_FOCUS_STACK.map((category) => (
            <Panel key={category.id} category={category} />
          ))}
        </div>
      </div>

      {pinned ? (
        <div
          ref={cursorRef}
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 z-50 flex size-16 items-center justify-center rounded-full bg-[var(--surface-inverse)] font-mono text-[10px] font-semibold tracking-wide text-white uppercase"
        >
          Drag
        </div>
      ) : null}
    </section>
  );
}
