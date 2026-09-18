"use client";

import { useLayoutEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";

import { useSpotlight } from "@/lib/spotlight";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

const LINE_1 = ["Bring", "the", "idea."];
const LINE_2 = ["Every", "tab's", "already", "open."];

export function FocusHero() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);
  useSpotlight(sectionRef);

  useLayoutEffect(() => {
    const root = typeRef.current;
    if (!root) return;
    const reduced = reducedMotion();
    const d = reduced ? 0 : 1;

    const words = gsap.utils.toArray<HTMLElement>(".hero-word", root);
    gsap.set(words, { yPercent: reduced ? 0 : 115, rotate: reduced ? 0 : 3 });
    gsap.set(".hero-fade", { opacity: reduced ? 1 : 0, y: reduced ? 0 : 16 });

    gsap
      .timeline({ defaults: { ease: "power4.out" } })
      .to(words, { yPercent: 0, rotate: 0, duration: 0.85 * d, stagger: 0.045 })
      .to(".hero-fade", { opacity: 1, y: 0, duration: 0.6 * d, stagger: 0.08 }, "-=0.45");
  }, []);

  return (
    <section
      ref={sectionRef}
      className="group relative min-h-[94vh] overflow-hidden bg-[var(--surface-inverse)]"
    >
      <Image
        src="/focus/website/photos/hero-desk.jpg"
        alt="A dual-monitor development setup, dark room, code on screen"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* Dot-grid texture, faded toward the text side via a radial mask. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle,rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_55%_55%_at_28%_45%,black,transparent)]"
      />

      {/* Legibility gradients for the headline column. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10"
      />

      {/* Cursor-follow spotlight — desktop only (useSpotlight no-ops without pointer:fine), fades in on hover. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(560px_circle_at_var(--mx,50%)_var(--my,50%),rgba(58,109,197,0.35),transparent_60%)]"
      />

      <div
        ref={typeRef}
        className="relative z-10 mx-auto flex min-h-[94vh] max-w-[1600px] flex-col justify-center px-6 pt-24 pb-16 sm:px-10 lg:px-16"
      >
        <div className="max-w-2xl">
          <p className="hero-fade font-mono text-xs font-semibold tracking-wide text-brand-yellow uppercase opacity-0">
            Focus — Website Development
          </p>
          <h1 className="mt-5 font-display font-semibold tracking-tight text-white">
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
          <p className="hero-fade mt-8 max-w-md text-white/70 opacity-0">
            &quot;We know React&quot; is table stakes. What actually changes how fast something
            ships is everything else — already running, before you&apos;ve opened your laptop.
          </p>
          <div className="hero-fade mt-10 flex items-center gap-2.5 text-xs text-white/50 opacity-0">
            <span className="flex items-center gap-1" aria-hidden="true">
              <span className="size-2 rounded-full bg-brand-red" />
              <span className="size-2 rounded-full bg-brand-yellow" />
              <span className="size-2 rounded-full bg-brand-green" />
            </span>
            <span>a real desk, mid-build — not a mockup</span>
          </div>
        </div>
      </div>
    </section>
  );
}
