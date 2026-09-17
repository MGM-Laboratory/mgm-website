"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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

// Every mark's wrapper shares this row height, scaled per logo via the
// `--logo-scale` custom property (partners.ts `logoScale`, defaults to 1) —
// some marks read visually small or large at an identical literal pixel
// height, so the correction is per-logo rather than one shared number.
const MARK_SIZE_CLASS = "h-[calc(2.25rem*var(--logo-scale))] sm:h-[calc(3rem*var(--logo-scale))]";

function markSizeStyle(partner: Partner): CSSProperties {
  return { "--logo-scale": partner.logoScale ?? 1 } as CSSProperties;
}

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
      style={markSizeStyle(partner)}
      className={cn(
        "trusted-mark group flex shrink-0 items-center justify-center outline-none",
        MARK_SIZE_CLASS,
      )}
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
    <div
      style={markSizeStyle(partner)}
      className={cn("flex shrink-0 items-center justify-center", MARK_SIZE_CLASS)}
    >
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
    <div
      style={markSizeStyle(partner)}
      className={cn("flex shrink-0 items-center justify-center", MARK_SIZE_CLASS)}
    >
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

// Constant px/sec instead of a flat duration, so the loop feels equally
// fast regardless of the track's actual measured width (which changes
// across breakpoints as the inter-logo gap changes).
const MARQUEE_SPEED_PX_PER_SEC = 150;

export function TrustedBySection({
  compact = false,
}: {
  /** Tighter vertical padding for pages that stack this directly between
   * other sections (e.g. About) — the homepage default is untouched. */
  compact?: boolean;
} = {}) {
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
    activeSlugRef.current = slug;
    setActive(slug);
    setDisplayed(slug);
    if (followRafId.current === null) followRafId.current = requestAnimationFrame(followActiveMark);
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

  // Plays the entrance pop only on a fresh open (closed -> open), not when
  // sliding from one already-open mark to the next. A `useLayoutEffect` keyed
  // on `displayed` is what makes this reliable: it only runs after React has
  // actually committed the panel into the DOM, so `panelRef.current` is
  // guaranteed to exist. The previous version tried to defer this with a
  // `requestAnimationFrame` inside the event handler instead, racing React's
  // own commit — the rAF sometimes fired before the ref was attached, which
  // silently skipped the animation and left the tooltip stuck at its base
  // `opacity-0`, i.e. the "tooltip only shows up sometimes" bug.
  const wasDisplayedRef = useRef(false);
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) {
      wasDisplayedRef.current = false;
      return;
    }
    if (!wasDisplayedRef.current) {
      gsap.killTweensOf(el);
      gsap.fromTo(
        el,
        { opacity: 0, y: -8, scale: 0.92 },
        { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "back.out(1.7)" },
      );
    }
    wasDisplayedRef.current = true;
  }, [displayed]);

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
  // The track renders two back-to-back copies of the full logo set; sliding
  // by exactly the second copy's own start offset (in pixels, not a
  // hardcoded -50%) is what actually lands back on a seam with no jump.
  // MosaicMarquee can get away with a flat xPercent: -50 because its two
  // copies sit directly adjacent with zero gap between them, so 50% of the
  // whole track is exactly one copy-width; this track has a real visual gap
  // between every logo, including the one between the two copies, so 50% of
  // the *track's* width overshoots the seam by half that gap every cycle —
  // a small but real recurring hitch. Measuring the second copy's actual
  // rendered offset sidesteps the arithmetic entirely.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    if (reducedMotion()) {
      const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
      return () => tween?.scrollTrigger?.kill();
    }

    function startMarquee() {
      if (!track) return;
      const secondCopy = track.children[1] as HTMLElement | undefined;
      const shiftPx = secondCopy ? secondCopy.offsetLeft : track.scrollWidth / 2;
      tweenRef.current?.kill();
      tweenRef.current = gsap.to(track, {
        x: -shiftPx,
        duration: shiftPx / MARQUEE_SPEED_PX_PER_SEC,
        ease: "none",
        repeat: -1,
      });
    }

    // The gap between logos changes across breakpoints (gap-10 vs
    // sm:gap-14), which changes the exact pixel seam offset — recreate the
    // tween with a freshly measured offset when the *viewport* actually
    // resizes. Listening on `window` (not a ResizeObserver on the track
    // itself) deliberately ignores the track's own transient reflows from
    // async image loads early on, which would otherwise restart the tween
    // mid-flight for no real layout change.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (tweenRef.current) startMarquee();
      }, 200);
    };
    window.addEventListener("resize", onResize);

    const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: "top 85%", once: true } });
    tl.fromTo(
      gsap.utils.toArray<HTMLElement>(".reveal-card", root),
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", stagger: 0.1 },
    );
    tl.eventCallback("onComplete", startMarquee);

    return () => {
      window.removeEventListener("resize", onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
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
    <section
      ref={rootRef}
      className={cn(
        "bg-background px-6 sm:px-10 lg:px-16",
        compact ? "py-10 sm:py-14" : "py-20 sm:py-28",
      )}
    >
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

      {/* Padded, not edge-to-edge: the strip sits well inside the section's
          own gutters (extra side margin on top of the section's padding,
          narrowing the scrollable range) and fades out at its own left/right
          edges (a masked gradient on the overflow wrapper below) instead of
          hard-clipping, so logos appear to drift in and out of a "portal"
          rather than being cut off. This wrapper (not the overflow-hidden
          track below) is what the tooltip anchors to, so it's never clipped
          by the track's own horizontal overflow mask. */}
      <div
        ref={anchorRef}
        className="reveal-card relative mt-14 mr-8 ml-8 opacity-0 sm:mr-16 sm:ml-16 lg:mr-24 lg:ml-24"
      >
        <div
          className={cn(
            // Horizontal-only clipping: the marquee track must stay clipped
            // on the x-axis, but clipping the y-axis too (plain
            // `overflow-hidden`) cut off every logo's hover lift and any
            // mark whose scaled height exceeds the row's base height — the
            // "cut off by a rectangle" bug. Vertical overflow is left alone.
            "overflow-x-hidden py-3 motion-reduce:overflow-x-auto",
            "[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
            "[-webkit-mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
            "motion-reduce:[-webkit-mask-image:none] motion-reduce:[mask-image:none]",
          )}
        >
          {/* w-max (not w-fit): fit-content sizing clamps to the *available*
              width once an ancestor clips overflow, so the track quietly
              measured far narrower than its real two-copy content. GSAP's
              xPercent: -50 is a percentage of that measured width, so the
              loop was resetting partway through the first copy instead of
              exactly at the seam between copies — the visible "teleport". */}
          <div ref={trackRef} className="flex w-max gap-10 sm:gap-14">
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
