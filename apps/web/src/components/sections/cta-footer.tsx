"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ArrowUp } from "lucide-react";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PatternTile, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";
import {
  DiscordGlyph,
  InstagramGlyph,
  LinkedinGlyph,
  XGlyph,
  YoutubeGlyph,
} from "@/components/social-icons";
import { NAV_SOCIALS, LEGAL_LINKS, CONTACT_EMAIL } from "@/data/nav";
import { HQ_ADDRESS_LINES } from "@/data/contact";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

const wibTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Jakarta",
});

// Same hydration-safe pattern as the nav menu's clock: a "--:--" placeholder
// server-side, the real WIB time only after mount.
function useWIBClock() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setTime(wibTimeFormatter.format(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

type Tile = { kind: PatternKind; bg: PatternTone; fg: PatternTone };

const FOOTER_MOSAIC: Tile[] = [
  { kind: "arcs", bg: "white", fg: "yellow" },
  { kind: "plus", bg: "red", fg: "white" },
  { kind: "square", bg: "white", fg: "yellow" },
  { kind: "fans", bg: "red", fg: "white" },
  { kind: "x", bg: "white", fg: "blue" },
  { kind: "fans", bg: "white", fg: "green" },
  { kind: "fans", bg: "white", fg: "red" },
  { kind: "x", bg: "white", fg: "blue" },
  { kind: "circle", bg: "white", fg: "yellow" },
  { kind: "clover", bg: "white", fg: "yellow" },
  { kind: "fans", bg: "green", fg: "white" },
  { kind: "circle", bg: "white", fg: "blue" },
];

// Every tile's hover face — a different kind and its colors swapped, rather
// than a second hand-authored set, so every tile still gets a genuinely
// different back face with one source list.
const KIND_OPPOSITE: Record<PatternKind, PatternKind> = {
  fans: "quads",
  quads: "fans",
  square: "circle",
  circle: "square",
  arcs: "leaves",
  leaves: "arcs",
  x: "plus",
  plus: "x",
  clover: "domes",
  domes: "clover",
};

function backOf(tile: Tile): Tile {
  return { kind: KIND_OPPOSITE[tile.kind], bg: tile.fg, fg: tile.bg };
}

const EXPLORE_LINKS = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Core Competencies", href: "/#process" },
  { label: "Portfolio", href: "/projects" },
  { label: "Contact", href: "/contact" },
];

const SOCIAL_GLYPHS: Record<string, typeof InstagramGlyph> = {
  Instagram: InstagramGlyph,
  "X (Formerly Twitter)": XGlyph,
  YouTube: YoutubeGlyph,
  LinkedIn: LinkedinGlyph,
  Discord: DiscordGlyph,
};

function MosaicTile({ tile }: Readonly<{ tile: Tile }>) {
  const innerRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const back = backOf(tile);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const d = reducedMotion() ? 0 : 1;
    tlRef.current = gsap.timeline({ paused: true }).to(inner, {
      rotationY: 180,
      duration: 0.55 * d,
      ease: "back.out(1.6)",
    });
    return () => {
      tlRef.current?.kill();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="size-14 [perspective:600px] sm:size-16"
      onMouseEnter={() => tlRef.current?.play()}
      onMouseLeave={() => tlRef.current?.reverse()}
    >
      <div ref={innerRef} className="relative size-full [transform-style:preserve-3d]">
        <PatternTile
          {...tile}
          className="absolute inset-0 size-full [backface-visibility:hidden]"
        />
        <PatternTile
          {...back}
          className="absolute inset-0 size-full [backface-visibility:hidden] [transform:rotateY(180deg)]"
        />
      </div>
    </div>
  );
}

function BackToTop() {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const d = reducedMotion() ? 0 : 1;
    gsap.set(button, { autoAlpha: 0, y: 12 });
    const trigger = ScrollTrigger.create({
      trigger: button.closest("footer"),
      start: "top bottom",
      onEnter: () => gsap.to(button, { autoAlpha: 1, y: 0, duration: 0.4 * d }),
      onLeaveBack: () => gsap.to(button, { autoAlpha: 0, y: 12, duration: 0.3 * d }),
    });
    return () => trigger.kill();
  }, []);

  function scrollToTop() {
    const reduced = reducedMotion();
    ScrollSmoother.get()?.scrollTo(0, !reduced);
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
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

export function CtaFooter() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wordmarkTrackRef = useRef<HTMLDivElement>(null);
  const socialRefs = useRef<(SVGSVGElement | null)[]>([]);
  const socialTimelines = useRef<(gsap.core.Timeline | null)[]>([]);
  const wibTime = useWIBClock();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".footer-reveal", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  // The wordmark strip renders two identical copies back to back; sliding by
  // exactly the second copy's measured offset (not a flat -50%) is what
  // lands back on the seam with no jump regardless of tracking/letter-
  // spacing rounding — same technique as the Trusted By marquee.
  useLayoutEffect(() => {
    const track = wordmarkTrackRef.current;
    if (!track || reducedMotion()) return;
    const secondCopy = track.children[1] as HTMLElement | undefined;
    const shiftPx = secondCopy ? secondCopy.offsetLeft : track.scrollWidth / 2;
    const tween = gsap.to(track, {
      x: -shiftPx,
      duration: shiftPx / 90,
      ease: "none",
      repeat: -1,
    });
    return () => {
      tween.kill();
    };
  }, []);

  useLayoutEffect(() => {
    NAV_SOCIALS.forEach((_, i) => {
      const icon = socialRefs.current[i];
      if (!icon) return;
      const d = reducedMotion() ? 0 : 1;
      const tl = gsap.timeline({ paused: true, defaults: { overwrite: "auto" } });
      tl.to(icon, { rotate: -14, duration: 0.1 * d, ease: "power1.out" })
        .to(icon, { rotate: 14, scale: 1.25, duration: 0.18 * d, ease: "power1.inOut" }, ">")
        .to(icon, { rotate: 0, scale: 1, duration: 0.22 * d, ease: "back.out(3)" }, ">");
      socialTimelines.current[i] = tl;
    });
    return () => {
      socialTimelines.current.forEach((tl) => tl?.kill());
      socialTimelines.current = [];
    };
  }, []);

  return (
    <footer
      ref={rootRef}
      className="relative overflow-hidden bg-[var(--footer-bg)] text-foreground"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-20 sm:px-10 sm:py-28 lg:flex-row lg:items-center lg:justify-between lg:px-16">
        <div className="footer-reveal max-w-md opacity-0">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Let&apos;s make something meaningful.
          </h2>
          <p className="mt-3 text-foreground/60">
            Research, technology, and ideas brought together.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center rounded-md border border-foreground/25 px-5 py-2.5 text-sm font-medium transition-colors hover:border-foreground/50"
            >
              Get in touch
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-sm font-medium text-foreground/60 underline decoration-[var(--line)] underline-offset-4 transition-colors hover:text-brand-blue"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>

        <div className="footer-reveal grid grid-cols-4 gap-1 opacity-0 sm:grid-cols-4">
          {FOOTER_MOSAIC.map((tile, i) => (
            <MosaicTile key={i} tile={tile} />
          ))}
        </div>
      </div>

      <div className="footer-reveal mx-auto flex max-w-5xl flex-col gap-10 border-t border-[var(--line)] px-6 py-14 opacity-0 sm:px-10 lg:flex-row lg:justify-between lg:px-16">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="MGM Laboratory" width={32} height={32} />
          </div>
          <p className="mt-4 font-display text-xl font-semibold">
            Media, Game, and Mobile Laboratory
          </p>
          <p className="mt-4 text-sm text-foreground/45">
            © {new Date().getFullYear()} MGM Research Laboratory. Built for research. Designed for
            impact.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
              Explore
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground/70">
              {EXPLORE_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="group inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    {l.label}
                    <span className="inline-block translate-x-0 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
              Location
            </p>
            <p className="mt-3 max-w-[200px] text-sm text-foreground/70">
              {HQ_ADDRESS_LINES.map((line, i) => (
                <span key={line}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </p>
            <p className="mt-3 font-mono text-xs text-foreground/45">
              Malang (ID) · {wibTime ?? "--:--"} WIB
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
              Connect
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {NAV_SOCIALS.map((social, i) => {
                const Glyph = SOCIAL_GLYPHS[social.label];
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    aria-label={social.label}
                    className="flex size-9 items-center justify-center rounded-full bg-foreground/10 transition-colors hover:bg-foreground/20"
                    onMouseEnter={() => socialTimelines.current[i]?.restart()}
                    onFocus={() => socialTimelines.current[i]?.restart()}
                  >
                    {Glyph ? (
                      <Glyph
                        className="size-4"
                        ref={(el) => {
                          socialRefs.current[i] = el;
                        }}
                      />
                    ) : null}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* A continuous outlined wordmark, purely decorative — hidden from
          assistive tech since the same brand name is already the page's
          h2/logo above, not new information. */}
      <div
        aria-hidden="true"
        className="footer-reveal overflow-hidden border-t border-[var(--line)] py-6 opacity-0"
      >
        <div ref={wordmarkTrackRef} className="flex w-max items-center whitespace-nowrap">
          {[0, 1].map((copy) => (
            <span key={copy} className="flex shrink-0 items-center">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="mx-4 flex shrink-0 items-center gap-4 sm:mx-6">
                  <span
                    className="font-display text-5xl font-semibold tracking-tight text-transparent opacity-[0.14] sm:text-7xl"
                    style={{ WebkitTextStroke: "1.5px var(--foreground)" }}
                  >
                    MGM LABORATORY
                  </span>
                  <PatternTile
                    kind="x"
                    bg="canvas"
                    fg="red"
                    className="size-6 shrink-0 sm:size-8"
                  />
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="footer-reveal mx-auto flex max-w-5xl flex-col items-center gap-3 border-t border-[var(--line)] px-6 py-6 text-xs text-foreground/45 opacity-0 sm:flex-row sm:justify-between sm:px-10 lg:px-16">
        <p>© {new Date().getFullYear()} MGM Laboratory. All rights reserved.</p>
        <div className="flex gap-5">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="transition-colors hover:text-foreground"
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
