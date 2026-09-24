"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";

import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";

// Same technique as the hero CTA's hover burst (see hero/see-work-button):
// small brand-colored shapes pop out, rise on a projectile arc, and tumble
// as they go — just scaled down for a 28px mark and fading out at the top
// of the arc instead of tucking back behind anything (there's no gap to
// land in on a logo the way there is on the CTA's two words).
const BURST: {
  kind: PatternKind;
  tone: PatternTone;
  size: number;
  x: number;
  peakY: number;
  rotate: number;
  delay: number;
}[] = [
  { kind: "circle", tone: "blue", size: 9, x: -18, peakY: -22, rotate: -160, delay: 0 },
  { kind: "x", tone: "red", size: 8, x: -6, peakY: -28, rotate: 200, delay: 0.05 },
  { kind: "square", tone: "yellow", size: 7, x: 9, peakY: -20, rotate: 140, delay: 0.1 },
  { kind: "arcs", tone: "green", size: 9, x: 22, peakY: -26, rotate: -180, delay: 0.06 },
];

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function LogoMark() {
  const markRef = useRef<HTMLDivElement>(null);
  const burstRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isAnimating = useRef(false);

  function handleEnter() {
    if (reducedMotion() || isAnimating.current) return;
    const mark = markRef.current;
    if (!mark) return;

    isAnimating.current = true;
    const tl = gsap.timeline({
      onComplete: () => {
        isAnimating.current = false;
      },
    });

    tl.to(mark, { scale: 1.12, duration: 0.22, ease: "back.out(3)" }, 0).to(
      mark,
      { scale: 1, duration: 0.3, ease: "elastic.out(1, 0.5)" },
      0.22,
    );

    const rise = 0.42;
    BURST.forEach((b, i) => {
      const el = burstRefs.current[i];
      if (!el) return;
      tl.set(el, { opacity: 0, scale: 0, x: b.x, y: 0, rotate: 0 }, b.delay)
        .to(el, { opacity: 1, scale: 1, duration: 0.14, ease: "back.out(2.5)" }, b.delay)
        .to(el, { y: b.peakY, duration: rise, ease: "power2.out" }, b.delay)
        .to(el, { rotate: b.rotate, duration: rise, ease: "none" }, b.delay)
        .to(el, { opacity: 0, duration: 0.18, ease: "power1.in" }, b.delay + rise - 0.16);
    });
  }

  return (
    // The wordmark takes the logo zone's ink (the header ink, a project
    // page's text colour, or whatever the adaptive header picked for what
    // is behind it); the mark itself is a multicolour image and keeps its
    // brand colours on every theme.
    <Link
      href="/"
      onMouseEnter={handleEnter}
      data-header-zone="logo"
      className="header-focus flex items-center gap-2 rounded-md"
    >
      <div className="relative inline-flex size-7 items-center justify-center">
        <div className="pointer-events-none absolute inset-0">
          {BURST.map((b, i) => (
            <div
              key={i}
              ref={(el) => {
                burstRefs.current[i] = el;
              }}
              className="absolute top-1/2 left-1/2 opacity-0"
              style={{
                width: b.size,
                height: b.size,
                marginLeft: -b.size / 2,
                marginTop: -b.size / 2,
              }}
            >
              <FlairShape kind={b.kind} tone={b.tone} className="h-full w-full" />
            </div>
          ))}
        </div>
        <div ref={markRef}>
          <Image src="/logo.svg" alt="" width={28} height={28} priority />
        </div>
      </div>
      <span className="flex flex-col leading-[1.1] font-display tracking-tight">
        <span className="text-sm font-bold">MGM</span>
        <span className="text-[10px] font-medium text-current/70">Laboratory</span>
      </span>
    </Link>
  );
}
