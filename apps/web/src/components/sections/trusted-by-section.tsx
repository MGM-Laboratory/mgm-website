"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";

import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PARTNERS, type Partner } from "@/data/partners";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// How long the pointer can sit right at the edge of a logo before its
// tooltip closes. The tooltip itself is decorative (pointer-events-none, the
// logo is the whole click target), so this only exists to debounce quick
// mouse travel between adjacent logos, not to bridge a gap into the tooltip.
const CLOSE_DELAY_MS = 120;

// Base sizing/position classes shared by every logo image (both the
// interactive and decorative copies), factored out so the hover-lift
// treatment and light/dark asset swap stay in exactly one place.
const LOGO_IMG_CLASS = "h-full w-auto object-contain transition-transform duration-300 ease-out";

function LogoImage({
  partner,
  interactive,
  className,
}: {
  partner: Partner;
  interactive: boolean;
  className?: string;
}) {
  const lift = interactive ? "group-hover:-translate-y-2 group-focus-visible:-translate-y-2" : "";
  if (partner.logoDark) {
    return (
      <span className="relative block h-full">
        <img
          src={partner.logo}
          alt={partner.name}
          width={partner.logoWidth}
          height={partner.logoHeight}
          loading="lazy"
          draggable={false}
          className={cn(LOGO_IMG_CLASS, lift, "dark:hidden", className)}
        />
        <img
          src={partner.logoDark}
          alt=""
          aria-hidden="true"
          width={partner.logoWidth}
          height={partner.logoHeight}
          loading="lazy"
          draggable={false}
          className={cn(LOGO_IMG_CLASS, lift, "hidden dark:block", className)}
        />
      </span>
    );
  }
  return (
    <img
      src={partner.logo}
      alt={partner.name}
      width={partner.logoWidth}
      height={partner.logoHeight}
      loading="lazy"
      draggable={false}
      className={cn(LOGO_IMG_CLASS, lift, partner.invertInDark && "dark:invert", className)}
    />
  );
}

// Every logo keeps its real brand color in both themes — no plate, no
// grayscale. `invertInDark` and `logoDark` are the only per-theme escape
// hatches (see partners.ts). Hovering/focusing lifts the mark upward and
// opens the small tooltip below the strip; the mark itself is always the
// full click target straight to the article.
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
      <LogoImage
        partner={partner}
        interactive
        className="group-focus-visible:rounded-md group-focus-visible:ring-2 group-focus-visible:ring-brand-blue group-focus-visible:ring-offset-4 group-focus-visible:ring-offset-background"
      />
    </Link>
  );
}

// A logo with no article yet (nothing to navigate to) — shown in the strip
// for visual completeness but not clickable, and deliberately skips the
// hover-lift/tooltip treatment so it never implies a destination it doesn't
// have.
function PartnerMarkStatic({ partner }: { partner: Partner }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-center sm:h-12">
      <LogoImage partner={partner} interactive={false} />
    </div>
  );
}

// The second copy of the strip only exists so the GSAP loop can slide by
// exactly one copy-width and land back on a seam with no visible jump. It's
// permanently `aria-hidden` and must carry zero focusable/interactive
// elements — a real link in there would give keyboard users extra,
// invisible-to-them tab stops (axe: aria-hidden-focus).
function PartnerMarkDecorative({ partner }: { partner: Partner }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-center sm:h-12">
      <LogoImage partner={partner} interactive={false} />
    </div>
  );
}

// Deliberately generic — the logo itself already identifies the partner, so
// this only needs to communicate "yes, this is clickable." Purely
// decorative: pointer-events-none, since the whole mark above it is already
// the real click target and the pointer never needs to travel into it.
function PartnerTooltip() {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute -top-[5px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] border-l border-t border-[var(--line)] bg-[var(--surface-muted)]"
      />
      <span className="relative">Click to read the story</span>
    </>
  );
}

// Tooltip width estimate (the copy is fixed, so this doesn't vary per
// partner) used to clamp its position so it never overhangs the viewport
// when the hovered mark sits near either edge of the strip.
const POPUP_WIDTH_PX = 210;
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
  const [displayed, setDisplayed] = useState<string | null>(null);

  // Keeps the tooltip horizontally centered under whichever mark is actually
  // hovered — anchoring it to a fixed spot under the strip would leave it
  // stranded far from the cursor whenever the hovered logo sits near either
  // edge of a wide viewport. Runs every frame while a partner is active
  // (the marquee may still be decelerating), clamped so the tooltip never
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
    const wasOpen = displayed !== null;
    activeSlugRef.current = slug;
    setActive(slug);
    setDisplayed(slug);
    if (followRafId.current === null) followRafId.current = requestAnimationFrame(followActiveMark);
    if (!wasOpen) {
      requestAnimationFrame(() => {
        const el = panelRef.current;
        if (!el) return;
        gsap.killTweensOf(el);
        gsap.fromTo(
          el,
          { opacity: 0, y: -8, scale: 0.92 },
          { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "back.out(1.7)" },
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
        y: -6,
        scale: 0.94,
        duration: 0.18,
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
  // The track renders two back-to-back copies of the full logo set, and the
  // loop slides by exactly one copy-width (xPercent: -50) on a plain linear
  // repeat, so it always lands back on a seam with no reset/jump.
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
      tweenRef.current = gsap.to(track, { xPercent: -50, duration: 30, ease: "none", repeat: -1 });
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
    if (!partner.articleSlug) {
      return <PartnerMarkStatic key={key} partner={partner} />;
    }
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

      {/* Padded, not edge-to-edge: the strip sits inside the section's own
          gutters and fades out at its own left/right edges (a masked
          gradient on the overflow wrapper below) instead of hard-clipping,
          so logos appear to drift in and out of a "portal" rather than
          being cut off. This wrapper (not the overflow-hidden track below)
          is what the tooltip anchors to, so it's never clipped by the
          track's own horizontal overflow mask. */}
      <div ref={anchorRef} className="reveal-card relative mt-14 opacity-0">
        <div
          className={cn(
            "overflow-hidden motion-reduce:overflow-x-auto",
            "[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
            "[-webkit-mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
            "motion-reduce:[-webkit-mask-image:none] motion-reduce:[mask-image:none]",
          )}
        >
          <div ref={trackRef} className="flex w-fit gap-10 sm:gap-14">
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
            style={{ left: "50%" }}
            className="pointer-events-none absolute top-full z-30 mt-4 w-max -translate-x-1/2 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-medium whitespace-nowrap text-foreground opacity-0 shadow-lg shadow-black/10 dark:shadow-black/40"
          >
            <PartnerTooltip />
          </div>
        ) : null}
      </div>
    </section>
  );
}
