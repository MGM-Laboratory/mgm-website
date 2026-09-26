"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import type { FormDesign } from "@repo/shared";

import { motionAllowed } from "@/lib/reduced-motion";

/**
 * The form's motion vocabulary: letter-by-letter titles and blocks that
 * emerge as they scroll into view. Reveals use an IntersectionObserver
 * (never ScrollTrigger, docs/animation-system.md gotchas #4, #10, #11), so
 * a block already on screen or scrolled past plays or resolves at once.
 * Hidden states before hydration are opacity only (forms.css, with a
 * <noscript> override in the layouts), and GSAP owns every transform.
 */

export const SPEED: Record<FormDesign["motion"]["speed"], number> = {
  slow: 1.45,
  normal: 1,
  fast: 0.62,
};

function canAnimate() {
  return typeof window !== "undefined" && motionAllowed();
}

/** Splits a string into words of letters; screen readers get the plain text. */
export function SplitText({
  text,
  as: Tag = "h1",
  className,
  id,
  speed = "normal",
  delay = 0,
  play = true,
  tabIndex,
  headingRef,
}: {
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  id?: string;
  speed?: FormDesign["motion"]["speed"];
  delay?: number;
  play?: boolean;
  tabIndex?: number;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !play) return;
    const chars = root.querySelectorAll<HTMLElement>(".fx-char");
    if (!canAnimate()) {
      gsap.set(chars, { opacity: 1, clearProps: "transform" });
      return;
    }
    const factor = SPEED[speed];
    const tween = gsap.fromTo(
      chars,
      { opacity: 0, yPercent: 105, rotate: 7, transformOrigin: "0% 100%" },
      {
        opacity: 1,
        yPercent: 0,
        rotate: 0,
        duration: 0.9 * factor,
        ease: "expo.out",
        stagger: Math.min(0.035, 0.9 / Math.max(chars.length, 1)) * factor,
        delay,
        immediateRender: true,
      },
    );
    return () => {
      tween.kill();
    };
  }, [text, speed, delay, play]);

  const words = text.split(/(\s+)/);
  return (
    <Tag className={className} id={id} aria-label={text} tabIndex={tabIndex} ref={headingRef}>
      <span ref={rootRef} className="fx-split" data-split="" aria-hidden>
        {words.map((word, wordIndex) =>
          /^\s+$/.test(word) ? (
            <span key={wordIndex}> </span>
          ) : (
            <span key={wordIndex} className="fx-word">
              {[...word].map((char, charIndex) => (
                <span key={charIndex} className="fx-char">
                  {char}
                </span>
              ))}
            </span>
          ),
        )}
      </span>
    </Tag>
  );
}

type Entrance = FormDesign["motion"]["entrance"];

function entranceFrom(entrance: Entrance, index: number): gsap.TweenVars {
  switch (entrance) {
    case "pop":
      return { opacity: 0, scale: 0.9, y: 10 };
    case "slide":
      return { opacity: 0, x: index % 2 === 0 ? -44 : 44 };
    case "blur":
      return { opacity: 0, filter: "blur(14px)", y: 8 };
    case "type":
      return { opacity: 0 };
    default:
      return { opacity: 0, y: 34 };
  }
}

function entranceTo(entrance: Entrance, factor: number): gsap.TweenVars {
  const base = { opacity: 1, duration: 0.85 * factor, immediateRender: false };
  switch (entrance) {
    case "pop":
      return { ...base, scale: 1, y: 0, ease: "back.out(1.9)", duration: 0.7 * factor };
    case "slide":
      return { ...base, x: 0, ease: "expo.out" };
    case "blur":
      return { ...base, filter: "blur(0px)", y: 0, ease: "power3.out", clearProps: "filter" };
    case "type":
      return { ...base, duration: 0.25 * factor, ease: "none" };
    default:
      return { ...base, y: 0, ease: "expo.out" };
  }
}

/** The label typing itself out, for the "type" entrance (a clip, not the text). */
function typeLabel(block: HTMLElement, factor: number) {
  const label = block.querySelector<HTMLElement>("[data-type-target]");
  if (!label) return null;
  const length = Math.max(8, (label.textContent ?? "").length);
  return gsap.fromTo(
    label,
    { clipPath: "inset(0 100% 0 0)" },
    {
      clipPath: "inset(0 0% 0 0)",
      duration: Math.min(1.6, length * 0.035) * factor,
      ease: `steps(${Math.min(60, length)})`,
      immediateRender: false,
      clearProps: "clipPath",
    },
  );
}

/**
 * Plays each `[data-reveal]` block inside `root` as it enters the viewport.
 * Blocks added later (logic showing a question, a new page) are picked up
 * through `key`: change it to rescan.
 */
export function useReveal(
  rootRef: React.RefObject<HTMLElement | null>,
  entrance: Entrance,
  speed: FormDesign["motion"]["speed"],
  key: unknown,
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const blocks = [...root.querySelectorAll<HTMLElement>("[data-reveal]:not([data-revealed])")];
    if (!blocks.length) return;
    if (!canAnimate()) {
      for (const block of blocks) {
        block.dataset.revealed = "";
        gsap.set(block, { opacity: 1 });
      }
      return;
    }
    const factor = SPEED[speed];
    const tweens: gsap.core.Animation[] = [];
    let batch = 0;
    let batchTimer = 0;
    const play = (block: HTMLElement) => {
      if (block.dataset.revealed !== undefined) return;
      block.dataset.revealed = "";
      const index = Number(block.dataset.revealIndex ?? 0);
      const delay = batch * 0.08 * factor;
      batch += 1;
      window.clearTimeout(batchTimer);
      batchTimer = window.setTimeout(() => {
        batch = 0;
      }, 120);
      tweens.push(
        gsap.fromTo(block, entranceFrom(entrance, index), {
          ...entranceTo(entrance, factor),
          delay,
        }),
      );
      if (entrance === "type") {
        const typing = typeLabel(block, factor);
        if (typing) tweens.push(typing.delay(delay + 0.05));
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const block = entry.target as HTMLElement;
          // Entered, or already scrolled past (a reload mid-page): show it.
          if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) {
            observer.unobserve(block);
            play(block);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
    );
    for (const block of blocks) {
      gsap.set(block, entranceFrom(entrance, Number(block.dataset.revealIndex ?? 0)));
      observer.observe(block);
    }
    return () => {
      observer.disconnect();
      window.clearTimeout(batchTimer);
      for (const tween of tweens) tween.progress(1).kill();
      for (const block of blocks) {
        if (block.dataset.revealed === undefined) gsap.set(block, { clearProps: "all" });
      }
    };
  }, [rootRef, entrance, speed, key]);
}

/** A stage's content arriving (welcome, a page, the ending): children rise in order. */
export function useStageEntrance(
  rootRef: React.RefObject<HTMLElement | null>,
  speed: FormDesign["motion"]["speed"],
  key: unknown,
  selector = "[data-stage-item]",
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = root.querySelectorAll<HTMLElement>(selector);
    if (!items.length) return;
    if (!canAnimate()) {
      gsap.set(items, { opacity: 1 });
      return;
    }
    const factor = SPEED[speed];
    const tween = gsap.fromTo(
      items,
      { opacity: 0, y: 26 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8 * factor,
        ease: "expo.out",
        stagger: 0.08 * factor,
        delay: 0.1 * factor,
        immediateRender: true,
      },
    );
    return () => {
      tween.progress(1).kill();
    };
  }, [rootRef, speed, key, selector]);
}

export function Reveal({
  children,
  className,
  index = 0,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <div className={className} data-reveal="" data-reveal-index={index}>
      {children}
    </div>
  );
}
