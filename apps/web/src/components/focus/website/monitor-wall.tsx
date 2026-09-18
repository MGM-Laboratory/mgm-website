"use client";

import { useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import gsap from "gsap";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { WEBSITE_FOCUS_STACK, type FocusStackCategory } from "@/data/website-focus";
import { MonitorWindow } from "./monitor-window";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

/**
 * A card picks up a subtle 3D tilt toward the cursor, like it's a real
 * monitor sitting on a desk. GSAP owns rotateX/rotateY on this element from
 * mount (an explicit gsap.set()) so there's never a static-class transform
 * for it to stack onto (see docs/animation-system.md gotcha #1) — and the
 * whole listener is skipped under reduced motion rather than just muted,
 * since it's a pure decorative loop-adjacent effect.
 */
type QuickTo = ReturnType<typeof gsap.quickTo>;

function StackCard({ category }: Readonly<{ category: FocusStackCategory }>) {
  const cardRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<{ x: QuickTo; y: QuickTo } | null>(null);
  const Icon = category.icon;

  useLayoutEffect(() => {
    const card = cardRef.current;
    // Skip on touch devices (no real hover/mouse target) and under reduced
    // motion, matching src/lib/parallax.ts's own guard for the same reason.
    if (!card || reducedMotion() || !window.matchMedia("(pointer: fine)").matches) {
      return undefined;
    }
    gsap.set(card, { transformPerspective: 900, rotateX: 0, rotateY: 0 });
    quickRef.current = {
      x: gsap.quickTo(card, "rotateY", { duration: 0.4, ease: "power3.out" }),
      y: gsap.quickTo(card, "rotateX", { duration: 0.4, ease: "power3.out" }),
    };
    return () => {
      quickRef.current = null;
    };
  }, []);

  function handleMove(event: ReactMouseEvent<HTMLDivElement>) {
    const card = cardRef.current;
    const quick = quickRef.current;
    if (!card || !quick) return;
    const box = card.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width - 0.5;
    const py = (event.clientY - box.top) / box.height - 0.5;
    quick.y(px * -6);
    quick.x(py * 6);
  }

  function handleLeave() {
    quickRef.current?.x(0);
    quickRef.current?.y(0);
  }

  return (
    <div
      ref={cardRef}
      className="reveal-card opacity-0 [transform-style:preserve-3d] will-change-transform"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <MonitorWindow url={category.url}>
        <div className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
              <Icon className="size-5" strokeWidth={2.25} />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
                {category.title}
              </h3>
              <p className="text-xs text-foreground/50">{category.tagline}</p>
            </div>
          </div>
          <p className="mt-4 text-[15px] text-foreground/65">{category.body}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {category.tools.map((tool) => (
              <span
                key={tool}
                className="rounded-full border border-[var(--line)] px-2.5 py-1 font-mono text-xs text-foreground/60"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      </MonitorWindow>
    </div>
  );
}

export function MonitorWall() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.08 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <section
      id="stack"
      ref={rootRef}
      className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16"
    >
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <p className="reveal-card font-mono text-xs font-semibold tracking-wide text-brand-blue uppercase opacity-0">
          The desk
        </p>
        <h2 className="reveal-card mt-3 max-w-2xl font-display text-[clamp(1.75rem,3vw+1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
          Six monitors, one build.
        </h2>
        <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">
          This is roughly what&apos;s open on a real desk here, at any given time. Hover a window —
          it&apos;s not just decoration.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {WEBSITE_FOCUS_STACK.map((category) => (
            <StackCard key={category.id} category={category} />
          ))}
        </div>
      </div>
    </section>
  );
}
