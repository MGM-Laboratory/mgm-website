"use client";

import { useLayoutEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PatternTile, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";

// lucide-react in this repo ships no brand/logo icons (Instagram,
// Linkedin, etc. were dropped upstream) — drawn inline instead, matching
// the design system's stroke-only iconography rules.
function LinkedinGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="9" width="4" height="12" fill="currentColor" />
      <circle cx="5" cy="4.5" r="2.25" fill="currentColor" />
      <path
        d="M11 21V9h4v1.8c.9-1.3 2.3-2 4-2 3 0 5 2 5 5.5V21h-4v-6c0-1.5-.8-2.5-2.2-2.5S15 13.5 15 15v6z"
        fill="currentColor"
      />
    </svg>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.25" cy="6.75" r="1.1" fill="currentColor" />
    </svg>
  );
}

const FOOTER_MOSAIC: { kind: PatternKind; bg: PatternTone; fg: PatternTone }[] = [
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

const EXPLORE_LINKS = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Core Competencies", href: "/#process" },
  { label: "Portfolio", href: "/projects" },
  { label: "Achievements", href: "/#achievements" },
  { label: "Contact", href: "/contact" },
];

export function CtaFooter() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <footer ref={rootRef} className="bg-[var(--surface-inverse)] text-white">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-20 sm:px-10 sm:py-28 lg:flex-row lg:items-center lg:justify-between lg:px-16">
        <div className="reveal-card max-w-md opacity-0">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Let&apos;s make something meaningful.
          </h2>
          <p className="mt-3 text-white/60">Research, technology, and ideas — brought together.</p>
          <Link
            href="/contact"
            className="mt-6 inline-flex items-center rounded-md border border-white/25 px-5 py-2.5 text-sm font-medium transition-colors hover:border-white/50"
          >
            Get in touch
          </Link>
        </div>

        <div className="reveal-card grid grid-cols-4 gap-1 opacity-0 sm:grid-cols-4">
          {FOOTER_MOSAIC.map((tile, i) => (
            <PatternTile key={i} {...tile} className="size-14 sm:size-16" />
          ))}
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-10 border-t border-white/10 px-6 py-14 sm:px-10 lg:flex-row lg:justify-between lg:px-16">
        <div className="reveal-card max-w-sm opacity-0">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="MGM Laboratory" width={32} height={32} />
          </div>
          <p className="mt-4 font-display text-xl font-semibold">
            Media, Game, and Mobile Laboratory
          </p>
          <p className="mt-4 text-sm text-white/45">
            © {new Date().getFullYear()} MGM Research Laboratory. Built for research. Designed for
            impact.
          </p>
        </div>

        <div className="reveal-card grid grid-cols-2 gap-8 opacity-0 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-white/40 uppercase">Explore</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-white/70">
              {EXPLORE_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-white/40 uppercase">Location</p>
            <p className="mt-3 max-w-[200px] text-sm text-white/70">
              Faculty of Computer Science, Building F Room F10.4-5
              <br />
              Veteran Street No. 8, Malang, 65145, Indonesia
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-white/40 uppercase">Connect</p>
            <div className="mt-3 flex gap-3">
              <a
                href="https://linkedin.com"
                aria-label="LinkedIn"
                className="flex size-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <LinkedinGlyph className="size-4" />
              </a>
              <a
                href="https://instagram.com"
                aria-label="Instagram"
                className="flex size-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <InstagramGlyph className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
