"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import gsap from "gsap";

import "./scroll-stack.css";

// The reference React Bits component drives its stack off its own Lenis
// scroller. This app already owns one scroll engine end to end — GSAP
// ScrollSmoother on `/` (see smooth-scroll.tsx) plus ScrollTrigger-based
// reveals everywhere else (docs/animation-system.md) — and Lenis's default
// `overscroll-behavior: contain` scroller would trap the wheel/touch inside
// this section instead of letting the page continue into the next one. So
// the stack math below (verbatim from the original) is driven by GSAP's
// ticker instead, reading the page's native scroll position.
//
// Two things make naive position-reading wrong here:
//
// 1. Card position can't come from a plain `getBoundingClientRect()`: that
//    reflects the element's own *rendered* (already-transformed) box, and
//    this component is the one writing that transform every frame — reading
//    it back would feed each frame's output into the next frame's input and
//    the pin offset would run away unboundedly. `offsetTop` is a pure layout
//    property (unaffected by transforms on the element or any ancestor), so
//    walking the offsetParent chain gives a stable, transform-immune
//    document-space position instead.
//
// 2. ScrollSmoother keeps the real scrollbar on `<body>` (native `scrollY`
//    changes immediately) but *also* applies its own lag transform to
//    `#smooth-content` so the visuals catch up gradually — so a card's
//    actual rendered position moves by native scroll *and* that ambient
//    transform stacked on top of it. Comparing raw `offsetTop` against raw
//    `scrollY` alone ignores the second half of that and desyncs the pin
//    math from what's actually on screen (cards were vanishing, and the
//    next section arriving, at the wrong scroll position). Measuring how
//    far the *container* itself (which this component never transforms) has
//    drifted from its plain scroll-only position gives that ambient shift
//    directly, whatever produced it — no ScrollSmoother-specific coupling
//    needed, and it's a no-op (0) when nothing is smoothing scroll at all.
function getScrollTop() {
  return window.scrollY;
}

function getDocumentOffsetTop(el: HTMLElement) {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node) {
    top += node.offsetTop;
    node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
  }
  return top;
}

function getAmbientShift(referenceEl: HTMLElement) {
  const scrollOnlyTop = getDocumentOffsetTop(referenceEl) - window.scrollY;
  return referenceEl.getBoundingClientRect().top - scrollOnlyTop;
}

function getElementOffset(el: HTMLElement, ambientShift: number) {
  return getDocumentOffsetTop(el) + ambientShift;
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function ScrollStackItem({
  children,
  className = "",
  href,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const classes = `mgm-scroll-stack-card ${className}`.trim();
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return <div className={classes}>{children}</div>;
}

type Transform = { translateY: number; scale: number; rotation: number; blur: number };

export function ScrollStack({
  children,
  className = "",
  itemDistance = 48,
  itemScale = 0.05,
  itemStackDistance = 24,
  stackPosition = "20%",
  scaleEndPosition = "10%",
  baseScale = 0.86,
  rotationAmount = 0,
  blurAmount = 0,
}: {
  children: ReactNode;
  className?: string;
  itemDistance?: number;
  itemScale?: number;
  itemStackDistance?: number;
  stackPosition?: string;
  scaleEndPosition?: string;
  baseScale?: number;
  rotationAmount?: number;
  blurAmount?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || reducedMotion()) return;

    const cards = Array.from(container.querySelectorAll<HTMLElement>(".mgm-scroll-stack-card"));
    const endEl = container.querySelector<HTMLElement>(".mgm-scroll-stack-end");
    if (!cards.length) return;

    const lastTransforms = new Map<number, Transform>();

    cards.forEach((card, i) => {
      if (i < cards.length - 1) card.style.marginBottom = `${itemDistance}px`;
      card.style.willChange = "transform, filter";
      card.style.transformOrigin = "top center";
      card.style.backfaceVisibility = "hidden";
    });

    function parsePercentage(value: string, containerHeight: number) {
      if (value.includes("%")) return (parseFloat(value) / 100) * containerHeight;
      return parseFloat(value);
    }

    function update() {
      const scrollTop = getScrollTop();
      const containerHeight = window.innerHeight;
      const stackPositionPx = parsePercentage(stackPosition, containerHeight);
      const scaleEndPositionPx = parsePercentage(scaleEndPosition, containerHeight);
      const ambientShift = container ? getAmbientShift(container) : 0;
      const endElementTop = endEl ? getElementOffset(endEl, ambientShift) : 0;

      cards.forEach((card, i) => {
        const cardTop = getElementOffset(card, ambientShift);
        const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
        const triggerEnd = cardTop - scaleEndPositionPx;
        const pinStart = triggerStart;
        const pinEnd = endElementTop - containerHeight / 2;

        const scaleProgress =
          scrollTop < triggerStart
            ? 0
            : scrollTop > triggerEnd
              ? 1
              : (scrollTop - triggerStart) / (triggerEnd - triggerStart);
        const targetScale = baseScale + i * itemScale;
        const scale = 1 - scaleProgress * (1 - targetScale);
        const rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0;

        let blur = 0;
        if (blurAmount) {
          let topCardIndex = 0;
          for (let j = 0; j < cards.length; j++) {
            const jTriggerStart =
              getElementOffset(cards[j], ambientShift) - stackPositionPx - itemStackDistance * j;
            if (scrollTop >= jTriggerStart) topCardIndex = j;
          }
          if (i < topCardIndex) blur = Math.max(0, (topCardIndex - i) * blurAmount);
        }

        let translateY = 0;
        const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (isPinned) {
          translateY = scrollTop - cardTop + stackPositionPx + itemStackDistance * i;
        } else if (scrollTop > pinEnd) {
          translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i;
        }

        const next: Transform = {
          translateY: Math.round(translateY * 100) / 100,
          scale: Math.round(scale * 1000) / 1000,
          rotation: Math.round(rotation * 100) / 100,
          blur: Math.round(blur * 100) / 100,
        };
        const prev = lastTransforms.get(i);
        const changed =
          !prev ||
          Math.abs(prev.translateY - next.translateY) > 0.1 ||
          Math.abs(prev.scale - next.scale) > 0.001 ||
          Math.abs(prev.rotation - next.rotation) > 0.1 ||
          Math.abs(prev.blur - next.blur) > 0.1;

        if (changed) {
          card.style.transform = `translate3d(0, ${next.translateY}px, 0) scale(${next.scale}) rotate(${next.rotation}deg)`;
          card.style.filter = next.blur > 0 ? `blur(${next.blur}px)` : "";
          lastTransforms.set(i, next);
        }
      });
    }

    update();
    gsap.ticker.add(update);

    return () => {
      gsap.ticker.remove(update);
      cards.forEach((card) => {
        card.style.transform = "";
        card.style.filter = "";
        card.style.marginBottom = "";
        card.style.willChange = "";
      });
      lastTransforms.clear();
    };
  }, [
    itemDistance,
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
  ]);

  return (
    <div ref={containerRef} className={`mgm-scroll-stack ${className}`.trim()}>
      {children}
      <div className="mgm-scroll-stack-end" />
    </div>
  );
}
