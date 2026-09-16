"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PARTNERS, type Partner } from "@/data/partners";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// Every logo sits on a fixed light plate regardless of site theme. These are
// straight-from-the-source brand marks in wildly different native colors
// (crimson, navy, gold-on-transparent, gradient purple...) — a CSS invert
// for dark mode would either wash them out or flip a meaningful interior
// white shape to black. A constant light plate is the only treatment that
// keeps every mark's real color intact on hover in both themes; the plate
// itself carries the theme-awareness instead (see the shadow below).
function PartnerPlate({
  partner,
  active,
  onEnter,
  onLeave,
  onToggle,
}: {
  partner: Partner;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`${partner.name}, read the story`}
      className="trusted-plate group flex h-16 w-32 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] outline-none transition-shadow duration-300 focus-visible:ring-2 focus-visible:ring-brand-blue sm:h-20 sm:w-40"
      style={{ boxShadow: active ? "0 4px 18px rgba(0,0,0,0.16)" : undefined }}
    >
      <img
        src={partner.logo}
        alt={partner.name}
        width={partner.logoWidth}
        height={partner.logoHeight}
        loading="lazy"
        draggable={false}
        className="max-h-full max-w-full object-contain transition-[filter] duration-300"
        style={{ filter: active ? "none" : "grayscale(1)" }}
      />
    </button>
  );
}

// The second copy of the strip only exists so the GSAP loop can slide by
// exactly one copy-width and land back on a seam with no visible jump. It's
// permanently `aria-hidden` and must carry zero focusable/interactive
// elements — a real <button> in there would give keyboard users 29 extra,
// invisible-to-them tab stops (axe: aria-hidden-focus).
function PartnerPlateDecorative({ partner }: { partner: Partner }) {
  return (
    <div className="flex h-16 w-32 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] sm:h-20 sm:w-40">
      <img
        src={partner.logo}
        alt=""
        width={partner.logoWidth}
        height={partner.logoHeight}
        loading="lazy"
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{ filter: "grayscale(1)" }}
      />
    </div>
  );
}

function PartnerDetail({ partner }: { partner: Partner | null }) {
  return (
    <div className="mt-8 flex min-h-[6.5rem] items-center rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-6 py-5 sm:min-h-[5.5rem]">
      {partner ? (
        <div className="flex w-full flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-display font-semibold text-foreground">{partner.name}</p>
            <p className="mt-1 max-w-2xl text-sm text-foreground/60">{partner.blurb}</p>
          </div>
          <Link
            href={`/articles/${partner.articleSlug}`}
            className="group flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-blue"
          >
            Read the story
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.25}
            />
          </Link>
        </div>
      ) : (
        <p className="text-sm text-foreground/40">
          Hover or tap a logo to read how the partnership started.
        </p>
      )}
    </div>
  );
}

export function TrustedBySection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const activePartner = useMemo(() => PARTNERS.find((p) => p.slug === active) ?? null, [active]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    if (reducedMotion()) {
      const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
      return () => tween?.scrollTrigger?.kill();
    }

    // The infinite loop only starts once the section's own entrance
    // animation finishes, matching MosaicMarquee's convention: it keeps the
    // track motionless (and its transform deterministic) until the section
    // is actually visible, instead of burning rAF on an off-screen loop.
    const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: "top 85%", once: true } });
    tl.fromTo(
      gsap.utils.toArray<HTMLElement>(".reveal-card", root),
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", stagger: 0.1 },
    );
    tl.eventCallback("onComplete", () => {
      tweenRef.current = gsap.to(track, { xPercent: -50, duration: 60, ease: "none", repeat: -1 });
    });

    return () => {
      tl.kill();
      tweenRef.current?.kill();
      tweenRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (active) tweenRef.current?.pause();
    else tweenRef.current?.resume();
  }, [active]);

  function renderPlate(partner: Partner, key: string) {
    return (
      <PartnerPlate
        key={key}
        partner={partner}
        active={active === partner.slug}
        onEnter={() => setActive(partner.slug)}
        onLeave={() => setActive((cur) => (cur === partner.slug ? null : cur))}
        onToggle={() => setActive((cur) => (cur === partner.slug ? null : partner.slug))}
      />
    );
  }

  return (
    <section ref={rootRef} className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
          Trusted By
        </h2>
        <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">
          Universities, labs, and companies Lab MGM has researched, built, and taught alongside,
          past and present.
        </p>
      </div>

      {/* Negative margins cancel the section's own side padding so the strip
          bleeds edge-to-edge, matching the process section's mosaic marquee. */}
      <div className="reveal-card -mx-6 mt-12 overflow-hidden opacity-0 motion-reduce:overflow-x-auto sm:-mx-10 lg:-mx-16">
        <div ref={trackRef} className="flex w-fit gap-4 pl-6 sm:pl-10 lg:pl-16">
          <div className="flex shrink-0 gap-4">
            {PARTNERS.map((partner) => renderPlate(partner, `a-${partner.slug}`))}
          </div>
          <div className="flex shrink-0 gap-4 motion-reduce:hidden" aria-hidden="true">
            {PARTNERS.map((partner) => (
              <PartnerPlateDecorative key={`b-${partner.slug}`} partner={partner} />
            ))}
          </div>
        </div>
      </div>

      <div className="reveal-card mx-auto max-w-5xl opacity-0">
        <PartnerDetail partner={activePartner} />
      </div>
    </section>
  );
}
