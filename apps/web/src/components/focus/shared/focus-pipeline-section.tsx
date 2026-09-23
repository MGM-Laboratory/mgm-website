"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { killTriggerOnComplete } from "@/lib/scroll-reveal";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export type PipelineStage = { label: string; detail: string };

// The one dark, high-contrast --surface-inverse moment every Focus page has
// (DESIGN_SYSTEM.md caps it at once per page): a play-once ScrollTrigger
// timeline fades up the stage cards and grows a GSAP-owned connector line
// (`scaleX` set in JS, never a static class — animation-system.md gotcha
// #1) alongside a staggered dot color change. `dotStyle: "border"` targets
// each dot's border instead of its fill — needed wherever the accent color
// is brand-yellow, since DESIGN_SYSTEM.md says yellow never carries text and
// these dots keep a white numeral throughout.
export function FocusPipelineSection({
  eyebrow,
  headline,
  body,
  stages,
  accentVar,
  dotStyle = "fill",
  tools,
}: Readonly<{
  eyebrow: string;
  headline: string;
  body: string;
  stages: PipelineStage[];
  accentVar: string;
  dotStyle?: "fill" | "border";
  tools?: string[];
}>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const line = lineRef.current;
    if (!root || !line) return undefined;

    const items = gsap.utils.toArray<HTMLElement>(".pipeline-reveal", root);
    const dots = gsap.utils.toArray<HTMLElement>(".pipeline-dot", root);
    const dotColorProp = dotStyle === "border" ? "borderColor" : "backgroundColor";

    if (reducedMotion()) {
      gsap.set(items, { opacity: 1, y: 0 });
      gsap.set(line, { scaleX: 1 });
      gsap.set(dots, { [dotColorProp]: accentVar });
      return undefined;
    }

    gsap.set(line, { scaleX: 0, transformOrigin: "left center" });
    // `once: false` + kill-on-complete instead of `once: true`: identical
    // visible behavior without the refresh-loop self-kill that crashes when
    // several triggers mount on a page already scrolled down (see
    // killTriggerOnComplete in lib/scroll-reveal.ts).
    const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: "top 75%", once: false } });
    tl.fromTo(
      items,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power3.out" },
    )
      .to(line, { scaleX: 1, duration: 1, ease: "power2.inOut" }, "-=0.35")
      .to(dots, { [dotColorProp]: accentVar, duration: 0.3, stagger: 0.22 }, "<");
    killTriggerOnComplete(tl);

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, [accentVar, dotStyle]);

  return (
    <div
      ref={rootRef}
      className="border-t border-[var(--line)] bg-[var(--surface-inverse)] px-6 py-24 text-white sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-6xl">
        <p className="pipeline-reveal font-mono text-xs font-semibold tracking-[0.14em] text-white/60 uppercase opacity-0">
          {eyebrow}
        </p>
        <h2 className="pipeline-reveal mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight opacity-0 sm:text-4xl">
          {headline}
        </h2>
        <p className="pipeline-reveal mt-4 max-w-xl text-white/65 opacity-0">{body}</p>

        <div className="relative mt-20">
          <div className="absolute top-4 left-0 hidden h-px w-full bg-white/15 sm:block" />
          <div
            ref={lineRef}
            className="absolute top-4 left-0 hidden h-px w-full sm:block"
            style={{ backgroundColor: accentVar }}
          />
          <div className="relative grid gap-10 sm:grid-cols-4 sm:gap-6">
            {stages.map((stage, i) => (
              <div key={stage.label} className="pipeline-reveal opacity-0">
                <span
                  className={`pipeline-dot relative z-10 flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white ${
                    dotStyle === "border" ? "border-2 border-white/20 bg-white/10" : "bg-white/15"
                  }`}
                >
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{stage.label}</h3>
                <p className="mt-1 text-sm text-white/55">{stage.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {tools?.length ? (
          <div className="mt-16 flex flex-wrap gap-2">
            {tools.map((tool) => (
              <span
                key={tool}
                className="pipeline-reveal rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/70 opacity-0"
              >
                {tool}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
