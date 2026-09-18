"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { PIPELINE_STAGES } from "@/data/mobile-focus";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// This page's one --surface-inverse moment (DESIGN_SYSTEM.md caps it at
// once per page) — same stepper technique as the /website pipeline section:
// a `once: true` ScrollTrigger timeline fading up the stage cards and
// growing a GSAP-owned connector line (`scaleX` set in JS, never a static
// class — animation-system.md gotcha #1).
export function StorePipelineSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const line = lineRef.current;
    if (!root || !line) return undefined;

    const items = gsap.utils.toArray<HTMLElement>(".pipeline-reveal", root);
    const dots = gsap.utils.toArray<HTMLElement>(".pipeline-dot", root);

    if (reducedMotion()) {
      gsap.set(items, { opacity: 1, y: 0 });
      gsap.set(line, { scaleX: 1 });
      gsap.set(dots, { backgroundColor: "var(--brand-red)" });
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
      .to(dots, { backgroundColor: "var(--brand-red)", duration: 0.3, stagger: 0.22 }, "<");

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
        <p className="pipeline-reveal font-mono text-xs font-semibold tracking-[0.14em] text-white/60 uppercase opacity-0">
          Prototype to app store
        </p>
        <h2 className="pipeline-reveal mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight opacity-0 sm:text-4xl">
          From a Figma frame to a store listing.
        </h2>
        <p className="pipeline-reveal mt-4 max-w-xl text-white/65 opacity-0">
          The same dedicated IT &amp; Infrastructure team behind our web builds handles backend
          scaling here too — app developers ship features, not servers.
        </p>

        <div className="relative mt-20">
          <div className="absolute top-4 left-0 h-px w-full bg-white/15" />
          <div ref={lineRef} className="absolute top-4 left-0 h-px w-full bg-brand-red" />
          <div className="relative grid gap-10 sm:grid-cols-4 sm:gap-6">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.label} className="pipeline-reveal opacity-0">
                <span className="pipeline-dot relative z-10 flex size-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{stage.label}</h3>
                <p className="mt-1 text-sm text-white/55">{stage.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
