"use client";

import Image from "next/image";
import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";

export function MemberHero() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const media = element.querySelector<HTMLElement>(".member-hero-media");
    const title = element.querySelector<HTMLElement>(".member-hero-title");
    const copy = element.querySelector<HTMLElement>(".member-hero-copy");
    if (!media || !title || !copy) return;

    if (reducedMotion) {
      gsap.set([media, title, copy], { opacity: 1, y: 0, scale: 1 });
      return;
    }

    const context = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power4.out" } })
        .fromTo(media, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 1.25 })
        .fromTo(title, { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: 0.82 }, "-=0.68")
        .fromTo(copy, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.56 }, "-=0.46");
    }, element);
    return () => context.revert();
  }, []);

  return (
    <section
      ref={root}
      className="relative min-h-[76dvh] overflow-hidden bg-[var(--surface-inverse)] pt-16"
    >
      <div className="member-hero-media absolute inset-0">
        <Image
          src="/member.webp"
          alt="Members of MGM Laboratory together"
          fill
          preload
          quality={88}
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#f7f7f5]/95 via-[#f7f7f5]/45 via-[42%] to-transparent dark:from-[#15181e]/95 dark:via-[#15181e]/55" />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-[8%] h-[12%] w-px bg-brand-blue/70"
      />
      <div className="relative mx-auto flex min-h-[calc(76dvh-4rem)] max-w-[1440px] items-end px-5 pb-12 sm:px-8 sm:pb-16 lg:px-12 lg:pb-20">
        <div className="max-w-3xl">
          <h1 className="member-hero-title font-display text-[clamp(3.25rem,8vw,7rem)] font-semibold leading-[0.93] tracking-[-0.055em] text-[var(--ink)] dark:text-white">
            Our Little Family
          </h1>
          <p className="member-hero-copy mt-6 max-w-xl text-base leading-7 text-[var(--ink-2)] dark:text-white/80 sm:text-lg">
            Researchers, builders, and storytellers growing together at MGM Laboratory.
          </p>
        </div>
      </div>
    </section>
  );
}
