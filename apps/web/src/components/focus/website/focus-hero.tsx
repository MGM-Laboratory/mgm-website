"use client";

import { useLayoutEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { GrainOverlay } from "./grain-overlay";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

const LINE_1 = ["Bring", "the", "idea."];
const LINE_2 = ["Every", "tab's", "already", "open."];

export function FocusHero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduced = reducedMotion();
    const d = reduced ? 0 : 1;

    const words = gsap.utils.toArray<HTMLElement>(".hero-word", root);
    gsap.set(words, { yPercent: reduced ? 0 : 115, rotate: reduced ? 0 : 3 });
    gsap.set(".hero-fade", { opacity: reduced ? 1 : 0, y: reduced ? 0 : 16 });
    gsap.set(artRef.current, { opacity: reduced ? 1 : 0, scale: reduced ? 1 : 1.06 });

    gsap
      .timeline({ defaults: { ease: "power4.out" } })
      .to(artRef.current, { opacity: 1, scale: 1, duration: 1 * d })
      .to(words, { yPercent: 0, rotate: 0, duration: 0.85 * d, stagger: 0.045 }, reduced ? 0 : 0.1)
      .to(".hero-fade", { opacity: 1, y: 0, duration: 0.6 * d, stagger: 0.08 }, "-=0.45");

    if (reduced) return undefined;

    const triggers = [
      gsap.to(artRef.current, {
        yPercent: -10,
        ease: "none",
        scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: true },
      }),
      gsap.to(typeRef.current, {
        yPercent: -16,
        opacity: 0.25,
        ease: "none",
        scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: true },
      }),
    ];
    return () => {
      triggers.forEach((t) => t.scrollTrigger?.kill());
    };
  }, []);

  return (
    <section ref={rootRef} className="relative min-h-[94vh] overflow-hidden bg-background">
      <div ref={artRef} className="absolute inset-0">
        <Image
          src="/focus/website/hero-artwork.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-right"
        />
      </div>
      <GrainOverlay className="opacity-[0.05]" />

      <div
        ref={typeRef}
        className="relative z-10 mx-auto flex min-h-[94vh] max-w-[1600px] flex-col justify-center px-6 pt-24 pb-16 sm:px-10 lg:px-16"
      >
        <div className="max-w-2xl">
          <p className="hero-fade font-mono text-xs font-semibold tracking-wide text-brand-blue uppercase opacity-0">
            Focus — Website Development
          </p>
          <h1 className="mt-5 font-display font-semibold tracking-tight text-foreground">
            {[LINE_1, LINE_2].map((line, li) => (
              <span
                key={li}
                className="block overflow-hidden text-[clamp(2.75rem,7.5vw,6.5rem)] leading-[0.96]"
              >
                {line.map((word, wi) => (
                  <span key={wi} className="hero-word mr-[0.22em] inline-block last:mr-0">
                    {word}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <p className="hero-fade mt-8 max-w-md text-foreground/60 opacity-0">
            &quot;We know React&quot; is table stakes. What actually changes how fast something
            ships is everything else — already running, before you&apos;ve opened your laptop.
          </p>
          <div className="hero-fade mt-10 flex items-center gap-2.5 text-xs text-foreground/45 opacity-0">
            <span className="flex items-center gap-1" aria-hidden="true">
              <span className="size-2 rounded-full bg-brand-red" />
              <span className="size-2 rounded-full bg-brand-yellow" />
              <span className="size-2 rounded-full bg-brand-green" />
            </span>
            <span>same three dots on every window below — this isn&apos;t just decoration</span>
          </div>
        </div>
      </div>
    </section>
  );
}
