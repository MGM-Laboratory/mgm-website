"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

import { FAQS } from "@/data/about-content";
import { RevealSection } from "./reveal-section";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const vBarRef = useRef<HTMLSpanElement>(null);

  // The panel's own height is what actually animates (a native <details>
  // can't animate open/close at all — it's an instant show/hide), measured
  // from the answer's natural height each time rather than hardcoded, since
  // the copy varies per question. The icon's vertical bar scaling to 0 is
  // the "morph" — a plus easing into a minus — timed alongside it.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const inner = innerRef.current;
    const vBar = vBarRef.current;
    if (!panel || !inner || !vBar) return;

    const d = reducedMotion() ? 0 : 1;
    const targetHeight = open ? inner.scrollHeight : 0;

    gsap.to(panel, { height: targetHeight, duration: 0.45 * d, ease: "power3.inOut" });
    gsap.to(inner, {
      opacity: open ? 1 : 0,
      y: open ? 0 : -6,
      duration: 0.35 * d,
      delay: open ? 0.08 * d : 0,
      ease: "power2.out",
    });
    gsap.to(vBar, { scaleY: open ? 0 : 1, duration: 0.4 * d, ease: "back.out(2.4)" });

    panel.inert = !open;
  }, [open]);

  return (
    <div className="reveal-item opacity-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left text-base font-semibold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue dark:text-white"
      >
        {question}
        <span
          aria-hidden="true"
          className="relative inline-flex size-5 shrink-0 items-center justify-center text-[var(--ink-3)] dark:text-white/50"
        >
          <span className="absolute h-[2px] w-3.5 rounded-full bg-current" />
          <span
            ref={vBarRef}
            className="absolute h-3.5 w-[2px] rounded-full bg-current"
            style={{ transformOrigin: "50% 50%" }}
          />
        </span>
      </button>
      <div ref={panelRef} id={panelId} className="overflow-hidden" style={{ height: 0 }}>
        <div ref={innerRef} className="pb-5 text-[var(--ink-2)] opacity-0 dark:text-white/65">
          {answer}
        </div>
      </div>
    </div>
  );
}

export function FaqSection() {
  return (
    <section className="bg-[var(--surface-muted)] px-6 py-10 sm:px-10 sm:py-14 lg:px-16">
      <RevealSection className="mx-auto max-w-2xl" stagger={0.06}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-blue uppercase opacity-0">
          Questions
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          Things people usually ask
        </h2>

        <div className="mt-10 flex flex-col divide-y divide-[var(--line)] dark:divide-white/10">
          {FAQS.map((faq) => (
            <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </RevealSection>
    </section>
  );
}
