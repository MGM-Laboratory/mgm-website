"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import type { ContactSettings } from "@repo/shared";

import { CtaFooter } from "@/components/sections/cta-footer";
import { ContactForm } from "@/components/contact/contact-form";
import { ContactInfoCard } from "@/components/contact/contact-info-card";
import { FlairShape } from "@/components/process/pattern-tile";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function ContactContent({ settings }: Readonly<{ settings: ContactSettings }>) {
  const heroRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The hero sits above the fold at mount, so it gets its own immediate
  // stagger-in rather than a ScrollTrigger (which would fire on the same
  // frame anyway, but without the guaranteed pre-hydration hidden state a
  // plain mount timeline gives us).
  useLayoutEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const targets = hero.querySelectorAll(".hero-reveal");
    if (!targets.length) return;
    const reduced = reducedMotion();
    if (reduced) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }
    const tween = gsap.fromTo(
      targets,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.09, immediateRender: true },
    );
    return () => {
      tween.kill();
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cards = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.12 });
    const fields = fadeUpOnScroll(root, ".reveal-field", {
      start: "top 90%",
      stagger: 0.06,
      y: 16,
    });
    return () => {
      cards?.scrollTrigger?.kill();
      fields?.scrollTrigger?.kill();
    };
  }, []);

  return (
    // skipcq: JS-0415 -- ordinary page-band layout depth, not a code smell
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden bg-[var(--surface-muted)]">
          <div
            ref={heroRef}
            className="relative mx-auto w-full max-w-[1200px] px-[55px] pt-24 pb-20"
          >
            <noscript>
              <style>{".hero-reveal{opacity:1 !important}"}</style>
            </noscript>
            <FlairShape
              kind="arcs"
              tone="green"
              className="pointer-events-none absolute -top-10 -right-10 size-72 opacity-25 sm:size-96 dark:opacity-35"
            />
            <div className="relative max-w-3xl">
              <p className="hero-reveal font-mono text-xs font-bold tracking-[0.16em] text-brand-green uppercase opacity-0">
                Contact
              </p>
              <h1 className="hero-reveal mt-4 font-display text-[clamp(2.5rem,5vw+1rem,4.25rem)] leading-[1.03] font-semibold tracking-[-0.03em] text-foreground opacity-0">
                Let&apos;s talk.
              </h1>
              <p className="hero-reveal mt-6 max-w-xl text-lg leading-7 text-foreground/65 opacity-0">
                Have a project, a research question, or just want to say hello? Tell us what&apos;s
                on your mind - we&apos;ll get back to you soon.
              </p>
            </div>
          </div>
        </section>

        <section ref={rootRef} className="bg-background">
          <div className="mx-auto w-full max-w-[1200px] px-[55px] pt-16 pb-24">
            <noscript>
              <style>{".reveal-card,.reveal-field{opacity:1 !important}"}</style>
            </noscript>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.75fr_1fr] lg:items-start lg:gap-10">
              <div>
                <ContactForm />
              </div>
              <div className="reveal-card opacity-0">
                <ContactInfoCard settings={settings} />
              </div>
            </div>
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
