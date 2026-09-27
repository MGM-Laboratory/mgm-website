"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { labNote } from "@/lib/lab-notes";
import { motionAllowed } from "@/lib/reduced-motion";
import { isRouteCoverActive } from "@/lib/route-reveal";
import { isScrollLocked } from "@/lib/scroll-lock";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { HOME_CHAPTERS } from "./chapters";
import { ConfettiBurst, type Burst } from "./confetti-burst";
import { KineticHeading } from "./kinetic-heading";
import { LogoStage, type LogoStageHandle } from "./logo-3d/logo-stage";
import { Magnetic } from "./magnetic";
import { useThemeNotes } from "./theme-notes";

/**
 * The homepage's last chapter ("Your turn"), rendered at the top of the
 * footer through `CtaFooter`'s `lead` slot: an invitation to get in touch,
 * with the lab's mark floating beside it (3D where the device can, flat
 * otherwise).
 *
 * The first time a visitor reaches it in a session, the footer celebrates:
 * the mark spins, a burst of Bauhaus confetti pops out of it, the heading's
 * letters hop, and a lab note says hello. That moment is decorative, so it
 * is skipped under reduced motion. It also hosts the theme-switch notes,
 * since this block only exists on the homepage.
 */
export function HomeFinale() {
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<LogoStageHandle>(null);
  const [burst, setBurst] = useState<Burst | null>(null);
  useThemeNotes();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".finale-reveal", { stagger: 0.12 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let timer = 0;
    let armed = true;

    const celebrate = () => {
      const said = labNote({
        id: "reached-end",
        text: "You made it to the end. That deserves a proper hello. Say hi any time.",
        shape: "star",
        tone: "yellow",
      });
      // Once a session: the note is said once, and the party follows it.
      if (!said) return;
      const rect = stageRef.current?.rect();
      if (rect) {
        setBurst({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          id: performance.now(),
        });
      }
      stageRef.current?.celebrate();
      root.querySelector(".kinetic-heading")?.dispatchEvent(new CustomEvent("kinetic:hop"));
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!armed || !entry.isIntersecting) return;
        const seen =
          entry.intersectionRatio >= 0.45 ||
          entry.intersectionRect.height >= window.innerHeight * 0.5;
        if (!seen || !motionAllowed() || isScrollLocked() || isRouteCoverActive()) return;
        armed = false;
        observer.disconnect();
        // A beat after arriving, so the heading's own entrance reads first.
        timer = window.setTimeout(celebrate, 450);
      },
      { threshold: [0, 0.2, 0.45, 0.7] },
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
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
        <LogoStage
          ref={stageRef}
          className="finale-reveal mx-auto w-[clamp(11rem,46vw,15rem)] md:w-[clamp(14rem,24vw,19rem)]"
        />
      </div>
      {burst ? <ConfettiBurst key={burst.id} burst={burst} onDone={() => setBurst(null)} /> : null}
    </section>
  );
}
