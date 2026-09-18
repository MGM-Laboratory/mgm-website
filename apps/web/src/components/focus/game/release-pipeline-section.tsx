"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { PUBLISHING_TOOLS, RELEASE_STAGES } from "@/data/game-focus";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// The one dark, high-contrast moment on this page (DESIGN_SYSTEM.md caps
// --surface-inverse sections at once per page) — same connector-line
// technique as /website's pipeline-section.tsx.
export function ReleasePipelineSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const line = lineRef.current;
    if (!root || !line) return undefined;

    const items = gsap.utils.toArray<HTMLElement>(".release-reveal", root);
    const dots = gsap.utils.toArray<HTMLElement>(".release-dot", root);

    if (reducedMotion()) {
      gsap.set(items, { opacity: 1, y: 0 });
      gsap.set(line, { scaleX: 1 });
      gsap.set(dots, { backgroundColor: "var(--brand-green)" });
      return undefined;
    }

    gsap.set(line, { scaleX: 0, transformOrigin: "left center" });
    const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: "top 75%", once: true } });
    tl.fromTo(
      items,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power3.out" },
    )
      .to(line, { scaleX: 1, duration: 1, ease: "power2.inOut" }, "-=0.35")
      .to(dots, { backgroundColor: "var(--brand-green)", duration: 0.3, stagger: 0.22 }, "<");

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="border-t border-[var(--line)] bg-[var(--surface-inverse)] px-6 py-24 text-white sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-6xl">
        <p className="release-reveal font-mono text-xs font-semibold tracking-[0.14em] text-white/60 uppercase opacity-0">
          Prototype to shelf
        </p>
        <h2 className="release-reveal mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight opacity-0 sm:text-4xl">
          You build the game. We handle getting it out the door.
        </h2>
        <p className="release-reveal mt-4 max-w-xl text-white/65 opacity-0">
          Publishing accounts, playtesters, and a marketing hand — the parts that aren&apos;t game
          design but still decide whether anyone plays it.
        </p>

        <div className="relative mt-20">
          <div className="absolute top-4 left-0 h-px w-full bg-white/15" />
          <div ref={lineRef} className="absolute top-4 left-0 h-px w-full bg-brand-green" />
          <div className="relative grid gap-10 sm:grid-cols-4 sm:gap-6">
            {RELEASE_STAGES.map((stage, i) => (
              <div key={stage.label} className="release-reveal opacity-0">
                <span className="release-dot relative z-10 flex size-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{stage.label}</h3>
                <p className="mt-1 text-sm text-white/55">{stage.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-wrap gap-2">
          {PUBLISHING_TOOLS.map((tool) => (
            <span
              key={tool}
              className="release-reveal rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/70 opacity-0"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
