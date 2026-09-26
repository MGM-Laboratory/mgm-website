"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { HOME_CHAPTERS } from "./chapters";
import { KineticHeading } from "./kinetic-heading";
import { LogoStage } from "./logo-3d/logo-stage";
import { Magnetic } from "./magnetic";

/**
 * The homepage's last chapter ("Your turn"), rendered at the top of the
 * footer through `CtaFooter`'s `lead` slot: an invitation to get in touch,
 * with the lab's mark beside it.
 *
 * It only exists on the homepage.
 */
export function HomeFinale() {
  const rootRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".finale-reveal", { stagger: 0.12 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <section
      ref={rootRef}
      aria-labelledby="home-finale-heading"
      className="relative border-b border-[var(--line)]"
    >
      <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 pt-16 pb-14 sm:px-10 sm:pt-24 sm:pb-20 md:grid-cols-[minmax(0,1fr)_auto] md:gap-14 lg:px-16">
        <div>
          <KineticHeading
            id="home-finale-heading"
            chapter={HOME_CHAPTERS.finale}
            text="Come say hello"
            accent="hello"
            className="font-display text-[clamp(2rem,3vw_+_1rem,2.75rem)] leading-tight font-semibold tracking-tight text-foreground"
          />
          <p className="finale-reveal mt-5 max-w-xl text-base leading-7 text-foreground/70 sm:text-lg sm:leading-8">
            Have a project, a research question, or an idea you want to test? Tell us about it. We
            would love to hear from you.
          </p>
          <div className="finale-reveal mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Magnetic radius={80} strength={0.35} max={12}>
              <Link
                href="/contact"
                className="group relative inline-flex h-12 items-center overflow-hidden rounded-full bg-foreground pr-7 pl-10 text-sm font-semibold text-background transition-[background-color] duration-200 hover:bg-brand-yellow hover:delay-300 focus-visible:bg-brand-yellow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)] focus-visible:delay-300 motion-reduce:transition-none"
              >
                {/* The dot floods the pill yellow on hover, and the pill's own
                    fill follows once the flood covers it, so no seam shows at
                    the rim. CSS only: nothing here meets the magnet's tween. */}
                <span
                  aria-hidden
                  className="absolute top-1/2 left-5 size-2 -translate-y-1/2 rounded-full bg-brand-yellow transition-transform duration-500 ease-[cubic-bezier(.35,0,0,1)] group-hover:scale-[42] group-focus-visible:scale-[42] motion-reduce:transition-none"
                />
                <span data-magnetic-inner className="relative inline-block">
                  <span className="inline-block transition-[color,translate] duration-500 ease-[cubic-bezier(.35,0,0,1)] group-hover:-translate-x-3 group-hover:text-[#0e1116] group-focus-visible:-translate-x-3 group-focus-visible:text-[#0e1116] motion-reduce:transition-none">
                    Get in touch
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  strokeWidth={2.25}
                  className="absolute right-5 size-4 translate-x-[250%] text-[#0e1116] transition-transform duration-500 ease-[cubic-bezier(.35,0,0,1)] group-hover:translate-x-0 group-focus-visible:translate-x-0 motion-reduce:transition-none"
                />
              </Link>
            </Magnetic>
            <Magnetic radius={50} strength={0.3} max={8}>
              <Link
                href="/careers"
                className="group relative inline-flex items-center gap-2 py-1 text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]"
              >
                <span data-magnetic-inner className="inline-block">
                  See open roles
                </span>
                <ArrowRight
                  aria-hidden
                  strokeWidth={2.25}
                  className="size-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-current transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none"
                />
              </Link>
            </Magnetic>
          </div>
        </div>
        <LogoStage className="finale-reveal mx-auto w-[clamp(11rem,46vw,15rem)] md:w-[clamp(14rem,24vw,19rem)]" />
      </div>
    </section>
  );
}
