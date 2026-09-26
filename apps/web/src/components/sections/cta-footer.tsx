"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ArrowUp, ArrowUpRight } from "lucide-react";

import { PatternTile } from "@/components/process/pattern-tile";
import { HQ_ADDRESS_LINES } from "@/data/contact";
import { LEGAL_LINKS } from "@/data/nav";
import { scrollPageTo } from "@/lib/page-scroll";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

const SOCIAL_LINKS = [
  { label: "Instagram", href: "https://www.instagram.com/labmgmfilkomub/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/mgmlab" },
  { label: "Discord", href: "https://discord.gg/h7PTA7XCq4" },
];

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

function BackToTop() {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const d = reducedMotion() ? 0 : 1;
    gsap.set(button, { autoAlpha: 0, y: 12 });
    // A bare ScrollTrigger.create() is the same forbidden shape as a
    // tween-level trigger (see docs/animation-system.md gotcha #4): GSAP
    // 3.15.0 throws inside its internal refresh when one is created after
    // >=4 other ScrollTriggers already exist on a page loaded already
    // scrolled down - exactly what every client-side navigation does, since
    // this footer (and this effect) remounts on every page. Wrapping the
    // same config in an (empty) timeline makes it timeline-level instead;
    // onEnter/onLeaveBack behave identically either way.
    let entered = false;
    const show = () => {
      if (entered) return;
      entered = true;
      gsap.to(button, { autoAlpha: 1, y: 0, duration: 0.4 * d });
    };
    const hide = () => {
      entered = false;
      gsap.to(button, { autoAlpha: 0, y: 12, duration: 0.3 * d });
    };
    const trigger = gsap.timeline({
      scrollTrigger: {
        trigger: button.closest("footer"),
        start: "top bottom",
        onEnter: show,
        onLeaveBack: hide,
      },
    }).scrollTrigger;
    // Catch-up for mounting already scrolled past the footer's start (fast
    // scroll straight to the bottom on a fresh page): onEnter only fires on
    // a forward crossing, and a freshly created trigger defers its position
    // calculation to the next tick, so re-check on the refresh event and at
    // two delays, mirroring fadeUpOnScroll's catch-up (lib/scroll-reveal.ts).
    let handled = false;
    const onRefresh = () => {
      if (handled || !trigger || !(trigger.progress > 0)) return;
      handled = true;
      show();
      timers.forEach(clearTimeout);
      ScrollTrigger.removeEventListener("refresh", onRefresh);
    };
    const timers = [250, 750].map((ms) => setTimeout(onRefresh, ms));
    ScrollTrigger.addEventListener("refresh", onRefresh);
    onRefresh();
    return () => {
      trigger?.kill();
      timers.forEach(clearTimeout);
      ScrollTrigger.removeEventListener("refresh", onRefresh);
    };
  }, []);

  function scrollToTop() {
    const reduced = reducedMotion();
    ScrollSmoother.get()?.scrollTo(0, !reduced);
    // Through the page's own smooth scroller when it runs one (/projects):
    // a direct window.scrollTo is cancelled by a wheel glide still in
    // flight. Everywhere else this is the same native smooth scroll.
    scrollPageTo(0, { duration: reduced ? 0 : 1 });
  }

  return (
    <button
      ref={buttonRef}
      aria-label="Back to top"
      className="fixed right-6 bottom-6 z-30 flex size-11 items-center justify-center rounded-full bg-brand-blue text-white opacity-0 shadow-[0_12px_30px_-10px_rgba(58,109,197,0.6)] transition-colors hover:bg-brand-blue/90 sm:right-10"
      onClick={scrollToTop}
      type="button"
    >
      <ArrowUp className="size-5" strokeWidth={2.25} />
    </button>
  );
}

/**
 * The footer every page shares. `lead` is an optional block rendered at its
 * top, for a page's own closing words: the homepage passes its "Your turn"
 * finale (components/home-extras/home-finale.tsx) there, and every other
 * page leaves it out, so their footer reads exactly as before.
 */
export function CtaFooter({ lead }: { lead?: ReactNode } = {}) {
  const rootRef = useRef<HTMLElement>(null);
  const wordmarkTrackRef = useRef<HTMLDivElement>(null);
  const year = new Date().getFullYear();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // The footer's blocks carry no static `opacity-0` (unlike the sections
    // above): server HTML stays fully visible without JS, and a reveal that
    // never fires can't leave invisible content reserving its full height -
    // the long blank scrollable region after the footer reported in #66.
    // The tween below applies the hidden "from" state via immediateRender
    // in this pre-paint effect, so JS visitors still get the same entrance.
    const tween = fadeUpOnScroll(root, ".footer-reveal", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  // The wordmark drifts left at a steady 90 px/s, and the page's scroll
  // pushes it: scrolling down speeds it up, a quick scroll up throws it the
  // other way for a moment, then it eases back to its drift. It only runs
  // while the footer is on screen.
  useLayoutEffect(() => {
    const track = wordmarkTrackRef.current;
    if (!track || reducedMotion()) return;
    const measure = () => {
      const secondCopy = track.children[1] as HTMLElement | undefined;
      return secondCopy ? secondCopy.offsetLeft : track.scrollWidth / 2;
    };
    let shiftPx = measure();
    const setX = gsap.quickSetter(track, "x", "px") as (value: number) => void;
    const DRIFT = 90;
    let x = 0;
    let push = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const now = performance.now();
      const dt = Math.max(16, now - lastT) / 1000;
      const velocity = (window.scrollY - lastY) / dt;
      lastY = window.scrollY;
      lastT = now;
      const target = Math.max(-700, Math.min(700, velocity * 0.4));
      push += (target - push) * 0.5;
    };
    const tick = (_time: number, deltaMs: number) => {
      const dt = Math.min(deltaMs, 50) / 1000;
      push *= Math.exp(-dt * 2.6);
      x -= (DRIFT + push) * dt;
      if (shiftPx > 0) x = gsap.utils.wrap(-shiftPx, 0, x);
      setX(x);
    };
    let running = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting === running) return;
      running = entry.isIntersecting;
      if (running) gsap.ticker.add(tick);
      else gsap.ticker.remove(tick);
    });
    observer.observe(track);
    const onResize = () => {
      shiftPx = measure();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      gsap.ticker.remove(tick);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <footer ref={rootRef} className="relative overflow-hidden bg-background text-foreground">
      {lead}
      <div className="footer-reveal mx-auto grid max-w-5xl gap-10 px-6 py-14 sm:px-10 sm:py-16 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-end lg:px-16">
        <div>
          <Image src="/logo.svg" alt="MGM Laboratory" width={32} height={32} />
          <p className="mt-4 font-display text-xl font-semibold tracking-tight">
            Media, Game, and Mobile Laboratory
          </p>
          <p className="mt-4 max-w-md text-sm leading-6 text-foreground/75">
            © {year} MGM Research Laboratory. Built for research. Designed for impact.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-wide text-foreground/70 uppercase">
            Location
          </p>
          <p className="mt-3 text-sm leading-6 text-foreground/80">
            {HQ_ADDRESS_LINES.map((line, i) => (
              <span key={line}>
                {i > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </p>
        </div>

        <nav aria-label="Social links">
          <p className="text-xs font-semibold tracking-wide text-foreground/70 uppercase">
            Connect
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium">
            {SOCIAL_LINKS.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative inline-flex items-center gap-1.5 pb-1 text-foreground transition-colors hover:text-brand-blue focus-visible:text-brand-blue focus-visible:outline-none"
                >
                  {social.label}
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-3.5 translate-y-0.5 opacity-0 transition-all duration-200 motion-reduce:transition-none group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-0.5 group-focus-visible:opacity-100"
                    strokeWidth={2.25}
                  />
                  <span className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-current transition-transform duration-200 motion-reduce:transition-none group-hover:scale-x-100 group-focus-visible:scale-x-100" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div
        aria-hidden="true"
        className="footer-reveal overflow-hidden border-y border-[var(--line)] py-5"
      >
        <div ref={wordmarkTrackRef} className="flex w-max items-center whitespace-nowrap">
          {[0, 1].map((copy) => (
            <span key={copy} className="flex shrink-0 items-center">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="mx-4 flex shrink-0 items-center gap-8 sm:mx-6 sm:gap-12">
                  <span
                    className="font-display text-5xl font-semibold tracking-tight text-transparent opacity-30 sm:text-7xl"
                    style={{ WebkitTextStroke: "1.5px var(--foreground)" }}
                  >
                    MGM LABORATORY
                  </span>
                  <PatternTile
                    kind="x"
                    bg="background"
                    fg="red"
                    className="size-6 shrink-0 sm:size-8"
                  />
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="footer-reveal mx-auto flex max-w-5xl flex-col items-center gap-3 pt-6 pr-6 pb-20 pl-6 text-xs text-foreground/70 sm:flex-row sm:justify-between sm:pt-6 sm:pr-24 sm:pb-6 sm:pl-10 lg:px-16">
        <p>© {year} MGM Laboratory. All rights reserved.</p>
        <div className="flex gap-5">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <BackToTop />
    </footer>
  );
}
