"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { PROCESS_STAGES } from "@/data/ux-focus";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// The one dark, high-contrast moment on this page (DESIGN_SYSTEM.md caps
// --surface-inverse sections at once per page). Dots animate their *border*
// to brand-yellow, never their fill — DESIGN_SYSTEM.md: yellow never
// carries text on top of it, and these dots keep a white numeral throughout.
export function ProcessSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const line = lineRef.current;
    if (!root || !line) return undefined;

    const items = gsap.utils.toArray<HTMLElement>(".process-reveal", root);
    const dots = gsap.utils.toArray<HTMLElement>(".process-dot", root);

    if (reducedMotion()) {
      gsap.set(items, { opacity: 1, y: 0 });
      gsap.set(line, { scaleX: 1 });
      gsap.set(dots, { borderColor: "var(--brand-yellow)" });
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
      .to(dots, { borderColor: "var(--brand-yellow)", duration: 0.3, stagger: 0.22 }, "<");

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
        <p className="process-reveal font-mono text-xs font-semibold tracking-[0.14em] text-white/60 uppercase opacity-0">
          From data to design
        </p>
        <h2 className="process-reveal mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight opacity-0 sm:text-4xl">
          Every screen goes through the same four questions.
        </h2>
        <p className="process-reveal mt-4 max-w-xl text-white/65 opacity-0">
          Not a formality — a real loop. A design that skips validation is just a guess with better
          typography.
        </p>

        <div className="relative mt-20">
          <div className="absolute top-4 left-0 h-px w-full bg-white/15" />
          <div ref={lineRef} className="absolute top-4 left-0 h-px w-full bg-brand-yellow" />
          <div className="relative grid gap-10 sm:grid-cols-4 sm:gap-6">
            {PROCESS_STAGES.map((stage, i) => (
              <div key={stage.label} className="process-reveal opacity-0">
                <span className="process-dot relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-xs font-semibold text-white">
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
