"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";

import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PARTNERS, type Partner } from "@/data/partners";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// How long the pointer can sit in the gap between a logo and the popup below
// it before the popup closes. Long enough to cross the gap deliberately,
// short enough that it doesn't feel stuck open after the pointer leaves.
const CLOSE_DELAY_MS = 220;

// Every logo keeps its real brand color in both themes — no plate, no
// grayscale. `invertInDark` is the one per-theme escape hatch, reserved in
// partners.ts for marks that are otherwise near-invisible on a dark page
// (a solid black wordmark) and safe to invert (no meaningful saturated
// color to distort). Everything else renders unmodified in both themes.
function PartnerMark({
  partner,
  onOpen,
  onScheduleClose,
  onCancelClose,
  markRef,
}: {
  partner: Partner;
  onOpen: () => void;
  onScheduleClose: () => void;
  onCancelClose: () => void;
  markRef: (el: HTMLAnchorElement | null) => void;
}) {
  return (
    <Link
      href={`/articles/${partner.articleSlug}`}
      onMouseEnter={onOpen}
      onMouseLeave={onScheduleClose}
      onFocus={onOpen}
      onBlur={onScheduleClose}
      onTouchStart={onCancelClose}
      aria-label={`${partner.name}, read the story`}
      ref={markRef}
      className="trusted-mark group flex h-9 shrink-0 items-center justify-center outline-none sm:h-12"
    >
      <img
        src={partner.logo}
        alt={partner.name}
        width={partner.logoWidth}
        height={partner.logoHeight}
        loading="lazy"
        draggable={false}
        className={cn(
          "h-full w-auto object-contain transition-transform duration-300 ease-out group-hover:scale-125 group-focus-visible:scale-125 group-focus-visible:rounded-md group-focus-visible:ring-2 group-focus-visible:ring-brand-blue group-focus-visible:ring-offset-4 group-focus-visible:ring-offset-background",
          partner.invertInDark && "dark:invert",
        )}
      />
    </Link>
  );
}

// The second copy of the strip only exists so the GSAP loop can slide by
// exactly one copy-width and land back on a seam with no visible jump. It's
// permanently `aria-hidden` and must carry zero focusable/interactive
// elements — a real link in there would give keyboard users 29 extra,
// invisible-to-them tab stops (axe: aria-hidden-focus).
function PartnerMarkDecorative({ partner }: { partner: Partner }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-center sm:h-12">
      <img
        src={partner.logo}
        alt=""
        width={partner.logoWidth}
        height={partner.logoHeight}
        loading="lazy"
        draggable={false}
        className={cn("h-full w-auto object-contain", partner.invertInDark && "dark:invert")}
      />
    </div>
  );
}

function PartnerPopup({
  partner,
  onCancelClose,
  onScheduleClose,
}: {
  partner: Partner;
  onCancelClose: () => void;
  onScheduleClose: () => void;
}) {
  return (
    <Link
      href={`/articles/${partner.articleSlug}`}
      onMouseEnter={onCancelClose}
      onMouseLeave={onScheduleClose}
      className="group block w-full"
    >
      <p className="font-display font-semibold text-foreground">{partner.name}</p>
      <p className="mt-1.5 text-sm text-foreground/60">{partner.blurb}</p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue">
        Read the story
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-1"
          strokeWidth={2.25}
        />
      </span>
    </Link>
  );
}

// Popup width (keep in sync with the className below) used to clamp its
// position so it never overhangs the viewport when the hovered mark sits
// near either edge of the strip.
const POPUP_WIDTH_PX = 416; // 26rem
const POPUP_MARGIN_PX = 16;

export function TrustedBySection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markElements = useRef(new Map<string, HTMLAnchorElement>());
  const activeSlugRef = useRef<string | null>(null);
  const followRafId = useRef<number | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [displayed, setDisplayed] = useState<Partner | null>(null);

  // Keeps the popup horizontally centered under whichever mark is actually
  // hovered — anchoring it to a fixed spot under the strip would leave it
  // stranded far from the cursor whenever the hovered logo sits near either
  // edge of a 1440px viewport. Runs every frame while a partner is active
  // (the marquee may still be decelerating), clamped so the popup never
  // overhangs the section.
  function followActiveMark() {
    const slug = activeSlugRef.current;
    if (!slug) {
      followRafId.current = null;
      return;
    }
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    const mark = markElements.current.get(slug);
    if (anchor && panel && mark) {
      const anchorRect = anchor.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();
      const desired = markRect.left + markRect.width / 2 - anchorRect.left;
      const half = POPUP_WIDTH_PX / 2;
      const clamped = Math.min(
        Math.max(desired, half + POPUP_MARGIN_PX),
        Math.max(anchorRect.width - half - POPUP_MARGIN_PX, half + POPUP_MARGIN_PX),
      );
      panel.style.left = `${clamped}px`;
    }
    // Self-healing: keeps polling even on frames where the panel hasn't
    // mounted yet (first open) or a mark ref is momentarily missing, instead
    // of giving up permanently.
    followRafId.current = requestAnimationFrame(followActiveMark);
  }

  function open(slug: string) {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const partner = PARTNERS.find((p) => p.slug === slug) ?? null;
    const wasOpen = displayed !== null;
    activeSlugRef.current = slug;
    setActive(slug);
    setDisplayed(partner);
    if (followRafId.current === null) followRafId.current = requestAnimationFrame(followActiveMark);
    if (!wasOpen) {
      requestAnimationFrame(() => {
        const el = panelRef.current;
        if (!el) return;
        gsap.killTweensOf(el);
        gsap.fromTo(
          el,
          { opacity: 0, y: -12, scale: 0.94 },
          { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.7)" },
        );
      });
    }
  }

  // Runs from a timer callback, not a React effect body, so animating out
  // and clearing `displayed` here (instead of reacting to `active` in an
  // effect) keeps this a plain event-driven state update.
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      activeSlugRef.current = null;
      setActive(null);
      const el = panelRef.current;
      if (!el) {
        setDisplayed(null);
        return;
      }
      gsap.killTweensOf(el);
      gsap.to(el, {
        opacity: 0,
        y: -8,
        scale: 0.96,
        duration: 0.22,
        ease: "power2.in",
        onComplete: () => setDisplayed(null),
      });
    }, CLOSE_DELAY_MS);
  }

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  useLayoutEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (followRafId.current !== null) cancelAnimationFrame(followRafId.current);
    },
    [],
  );

  // Entrance reveal, then the marquee's infinite loop only starts once that
  // finishes — matches MosaicMarquee's convention (keeps the track
  // motionless, and its transform deterministic, until actually visible).
  useLayoutEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    if (reducedMotion()) {
      const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
      return () => tween?.scrollTrigger?.kill();
    }

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

  // Smooth deceleration/acceleration instead of an instant freeze: tween the
  // running tween's own timeScale rather than calling pause()/resume(),
  // which snap to a dead stop with no easing curve at all.
  useLayoutEffect(() => {
    const tween = tweenRef.current;
    if (!tween) return;
    gsap.to(tween, {
      timeScale: active ? 0 : 1,
      duration: active ? 0.7 : 0.9,
      ease: active ? "power2.out" : "power2.inOut",
      overwrite: true,
    });
  }, [active]);

  function renderMark(partner: Partner, key: string) {
    return (
      <PartnerMark
        key={key}
        partner={partner}
        onOpen={() => open(partner.slug)}
        onScheduleClose={scheduleClose}
        onCancelClose={cancelClose}
        markRef={(el) => {
          if (el) markElements.current.set(partner.slug, el);
          else markElements.current.delete(partner.slug);
        }}
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
          bleeds edge-to-edge, matching the process section's mosaic marquee.
          This wrapper (not the overflow-hidden track below) is what the
          popup anchors to, so the popup is never clipped by the track's own
          horizontal overflow mask. */}
      <div
        ref={anchorRef}
        className="reveal-card relative -mx-6 mt-14 opacity-0 sm:-mx-10 lg:-mx-16"
      >
        <div className="overflow-hidden motion-reduce:overflow-x-auto">
          <div ref={trackRef} className="flex w-fit gap-10 pl-6 sm:gap-14 sm:pl-10 lg:pl-16">
            <div className="flex shrink-0 items-center gap-10 sm:gap-14">
              {PARTNERS.map((partner) => renderMark(partner, `a-${partner.slug}`))}
            </div>
            <div
              className="flex shrink-0 items-center gap-10 motion-reduce:hidden sm:gap-14"
              aria-hidden="true"
            >
              {PARTNERS.map((partner) => (
                <PartnerMarkDecorative key={`b-${partner.slug}`} partner={partner} />
              ))}
            </div>
          </div>
        </div>

        {displayed ? (
          <div
            ref={panelRef}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{ left: "50%" }}
            className="absolute top-full z-30 mt-5 w-[min(92vw,26rem)] -translate-x-1/2 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-6 py-5 opacity-0 shadow-2xl shadow-black/10 dark:shadow-black/40"
          >
            <PartnerPopup
              partner={displayed}
              onCancelClose={cancelClose}
              onScheduleClose={scheduleClose}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
