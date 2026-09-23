"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";

import { LogoMark } from "@/components/hero/shapes";
import { markRouteCoverStarted, markRouteRevealDone } from "@/lib/route-reveal";

/**
 * Full-screen page-transition curtain, two layers:
 *
 * 1. A plain white wash, behind everything else. It fades in first (the
 *    current page visibly bleaches to white) and only fades out last, after
 *    every other animation below has finished — so peeling back the curtain
 *    always lands on white before the real destination shows through,
 *    rather than cutting straight from the colored curtain to the page.
 * 2. The brand-blue backdrop with a white MGM mark on top of that wash. The
 *    mark scales up to giant and back down to its idle size, un-rotating as
 *    it settles. It holds there (with a breathing loop if the destination is
 *    genuinely slow), then reverses fast once the destination is ready.
 *
 * The giant scale is computed from the logo's own measured size and the
 * current viewport diagonal (not hardcoded), then multiplied by
 * GIANT_SCALE_MULTIPLIER for a dramatic close-up rather than a neatly fitted
 * mark — the same scale is used on both the cover-in and reveal-out.
 *
 * LOGO_PIVOT is the actual coverage mechanism, and it matters more than the
 * multiplier: scaling from an arbitrary point mostly reveals more of
 * whatever's immediately around that point, so a pivot sitting in the empty
 * gap between the mark's three shards just shows more gap as it grows — no
 * multiplier fixes that. LOGO_PIVOT instead sits on a point confirmed to be
 * inside solid fill (found empirically: render the mark alone at a
 * candidate pivot and scale, then sample element-under-pointer at all four
 * viewport corners plus center across several aspect ratios and scales).
 *
 * "Inside solid fill" isn't the whole story, though: dead center (50%,50%)
 * *is* white but sits close enough to a shard's edge that coverage was
 * non-monotonic (passed at one scale, failed at a larger one — the corner's
 * mapped-back point crossed the nearby edge as scale grew, which a truly
 * interior point can never do, since larger scale only pulls that mapped
 * point closer to the pivot). LOGO_PIVOT was chosen by additionally
 * requiring coverage to hold at *every* scale in an increasing range, which
 * rules out near-edge points like that one. Scaling from a genuine interior
 * point is a "zoom into a point" operation: sufficient scale is guaranteed
 * to fill the viewport with solid color regardless of aspect ratio —
 * confirmed for GIANT_SCALE_MULTIPLIER at 20 across seven aspect ratios,
 * including narrow ones (a tall mobile viewport's far corner needed 18x;
 * wide ones cover comfortably below 10x). Because scale=1 (idle) makes any
 * transform-origin a no-op, this pivot never visibly affects the centered
 * idle mark — it only matters while giant.
 *
 * Scope: this only ever engages for client-side navigations triggered by an
 * in-app link click (see the capture-phase click listener below) or a
 * browser back/forward. It never touches the very first paint of a hard
 * page load — an SSR-visible "always covering" default would hide real
 * content from anyone without JavaScript with no way to ever reveal it
 * again, which is a strictly worse outcome than skipping the boot moment.
 */

const WHITE_FADE_IN_DURATION = 0.1;
const WHITE_FADE_OUT_DURATION = 0.42;
const GIANT_SETTLE_DURATION = 0.06;
const SHRINK_DURATION = 0.5;
const SHRINK_FROM_ROTATION = -18;
const GROW_DURATION = 0.28;
const GROW_TO_ROTATION = 18;
const FADE_OUT_DURATION = 0.12;
const GIANT_SCALE_MARGIN = 1.15;
// Guarantees the idle mark is actually visible for a beat before reversing,
// even when the destination resolves almost instantly (a fast dev server or
// a fully static route can otherwise make coverAnimDone and routeReady flip
// true back-to-back, revealing before the idle mark ever really registers).
// Raised from 500ms after the whole curtain read as a blink (issue #60);
// the reveal side was slowed by the same proportion so the hold still reads
// as a deliberate beat rather than a stall.
const MIN_STAY_MS = 750;
// See LOGO_PIVOT above: 20x the "just covers the viewport" scale, verified
// empirically to fully cover every sampled corner across seven aspect
// ratios (a tall mobile viewport needed 18x; this leaves headroom above
// that for real-world variance in the measured logo size).
const GIANT_SCALE_MULTIPLIER = 20;
// A point near the mark's own center — close to the middle of the logo, but
// nudged up from dead-center to land on a genuinely interior point rather
// than the edge dead-center sits on (see the comment above). Expressed as a
// percentage of the mark's own viewBox (57.5 86.0265 660 660).
const LOGO_PIVOT = "50% 44%";
const CEILING_MS = 8000;
// Time-based, not tied to the pathname-change effect: if the destination is
// slow enough that even its loading.tsx shell hasn't arrived yet,
// usePathname() never fires and that effect never runs. The breathing loop
// still needs to start — it's the "still waiting" signal the ceiling timer
// backstops, not a reaction to a specific router event.
const HOLD_DELAY_MS = 600;

type PendingState = {
  active: boolean;
  coverAnimDone: boolean;
  coverAnimDoneAt: number | null;
  routeReady: boolean;
  revealed: boolean;
  holdRequested: boolean;
  holdStarted: boolean;
  isPopstate: boolean;
  observer: MutationObserver | null;
  ceilingTimer: ReturnType<typeof setTimeout> | null;
  holdTimer: ReturnType<typeof setTimeout> | null;
  minStayTimer: ReturnType<typeof setTimeout> | null;
};

function freshPendingState(): PendingState {
  return {
    active: false,
    coverAnimDone: false,
    coverAnimDoneAt: null,
    routeReady: false,
    revealed: false,
    holdRequested: false,
    holdStarted: false,
    isPopstate: false,
    observer: null,
    ceilingTimer: null,
    holdTimer: null,
    minStayTimer: null,
  };
}

export function RouteTransition() {
  const router = useRouter();
  const pathname = usePathname();

  const whiteRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<SVGSVGElement>(null);
  const holdTweenRef = useRef<gsap.core.Tween | null>(null);
  const pendingRef = useRef<PendingState>(freshPendingState());

  const dimsRef = useRef({ width: 0, height: 0 });

  // True while the destination is genuinely still loading (its loading.tsx
  // fallback is up): drives the "still loading" dot indicator on the
  // curtain, so a slow route reads as progress instead of a frozen screen.
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    function syncViewportSize() {
      dimsRef.current = { width: window.innerWidth, height: window.innerHeight };
    }
    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    return () => window.removeEventListener("resize", syncViewportSize);
  }, []);

  // Set once, never animated — see LOGO_PIVOT above. A no-op at scale:1, so
  // it never touches the centered idle appearance.
  useEffect(() => {
    if (logoRef.current) gsap.set(logoRef.current, { transformOrigin: LOGO_PIVOT });
  }, []);

  // Inline style, not a second Tailwind class: `pointer-events-auto` and the
  // static `pointer-events-none` default resolve by generated-CSS order,
  // not by which was added to the classList more recently, so toggling the
  // class never reliably took effect (confirmed in the PR description). An
  // inline style always wins over any class regardless of order.
  function setOverlayBlocking(blocking: boolean) {
    if (overlayRef.current) overlayRef.current.style.pointerEvents = blocking ? "auto" : "";
  }

  function getGiantScale() {
    if (!logoRef.current) return 20;
    const rect = logoRef.current.getBoundingClientRect();
    const logoSize = Math.max(rect.width, rect.height) || 1;
    const { width, height } = dimsRef.current;
    return (Math.hypot(width, height) / logoSize) * GIANT_SCALE_MARGIN * GIANT_SCALE_MULTIPLIER;
  }

  function clearCeiling() {
    if (pendingRef.current.ceilingTimer) {
      clearTimeout(pendingRef.current.ceilingTimer);
      pendingRef.current.ceilingTimer = null;
    }
  }

  function clearHoldTimer() {
    if (pendingRef.current.holdTimer) {
      clearTimeout(pendingRef.current.holdTimer);
      pendingRef.current.holdTimer = null;
    }
  }

  function clearMinStayTimer() {
    if (pendingRef.current.minStayTimer) {
      clearTimeout(pendingRef.current.minStayTimer);
      pendingRef.current.minStayTimer = null;
    }
  }

  // Requesting a hold and actually starting its tween are separate: the
  // shrink-in timeline may still be mid-flight (a fast dev server, or a
  // route whose loading.tsx sentinel appears within the first ~100ms, can
  // both request a hold well before the cover-in timeline finishes). Starting
  // a competing `scale` tween on the same element while the shrink is still
  // running is the exact hover-vs-entrance race documented in
  // docs/animation-system.md gotcha #3 — the two tweens fight over `scale`
  // and both lose. Engaging only after coverAnimDone, with a `.fromTo()`
  // baseline, is that gotcha's own fix pattern applied here.
  function requestHold() {
    pendingRef.current.holdRequested = true;
    engageHoldIfNeeded();
  }

  function engageHoldIfNeeded() {
    const state = pendingRef.current;
    if (!state.coverAnimDone || !state.holdRequested || state.holdStarted || state.revealed) return;
    if (!logoRef.current) return;
    state.holdStarted = true;
    holdTweenRef.current = gsap.fromTo(
      logoRef.current,
      { scale: 1 },
      { scale: 1.08, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 },
    );
  }

  function maybeReveal() {
    const state = pendingRef.current;
    if (!state.coverAnimDone || !state.routeReady || state.revealed) return;
    const elapsed = state.coverAnimDoneAt ? Date.now() - state.coverAnimDoneAt : MIN_STAY_MS;
    const remaining = MIN_STAY_MS - elapsed;
    if (remaining <= 0) {
      startReveal();
      return;
    }
    clearMinStayTimer();
    state.minStayTimer = setTimeout(() => {
      pendingRef.current.minStayTimer = null;
      maybeReveal();
    }, remaining);
  }

  function startReveal() {
    const state = pendingRef.current;
    state.revealed = true;
    setWaiting(false);
    clearCeiling();
    clearHoldTimer();
    clearMinStayTimer();
    state.observer?.disconnect();
    state.observer = null;
    holdTweenRef.current?.kill();
    holdTweenRef.current = null;

    if (!overlayRef.current || !logoRef.current || !whiteRef.current) {
      pendingRef.current = freshPendingState();
      markRouteRevealDone();
      return;
    }

    const giantScale = getGiantScale();

    const tl = gsap.timeline({
      onComplete: () => {
        if (overlayRef.current) {
          gsap.set(overlayRef.current, { autoAlpha: 0 });
          setOverlayBlocking(false);
        }
        if (logoRef.current) gsap.set(logoRef.current, { scale: 1, rotation: 0 });
        if (whiteRef.current) gsap.set(whiteRef.current, { autoAlpha: 0 });
        pendingRef.current = freshPendingState();
        // The page is fully visible again: entrance animations gated on the
        // curtain may now play.
        markRouteRevealDone();
      },
    });
    // Grow back to giant with a pronounced accelerating curve — starts slow,
    // then rushes — covering the whole screen a second time with a
    // different solid region of the mark. The blue backdrop then fades
    // (revealing the white wash underneath) with the same accelerating
    // character, and only once that's done does the white wash itself fade
    // — slower and smoother than the two above, so the destination page
    // eases into view gradually rather than snapping in.
    tl.to(logoRef.current, {
      scale: giantScale,
      rotation: GROW_TO_ROTATION,
      duration: GROW_DURATION,
      ease: "power4.in",
    });
    tl.to(overlayRef.current, { autoAlpha: 0, duration: FADE_OUT_DURATION, ease: "power3.in" });
    tl.to(whiteRef.current, {
      autoAlpha: 0,
      duration: WHITE_FADE_OUT_DURATION,
      ease: "sine.inOut",
    });
  }

  function watchForRouteReady() {
    // A frame after the new segment tree commits: real content resolved in
    // the same commit (no loading.tsx, or the fetch was already fast enough)
    // shows no sentinel, so reveal right away. Otherwise wait for the
    // sentinel — rendered by every route's loading.tsx fallback — to be
    // removed once the real content swaps in.
    requestAnimationFrame(() => {
      if (!pendingRef.current.active) return;
      const sentinel = document.querySelector("[data-route-loading]");
      if (!sentinel) {
        setWaiting(false);
        pendingRef.current.routeReady = true;
        maybeReveal();
        return;
      }
      // The destination's loading.tsx fallback is on screen: surface the
      // waiting indicator immediately (the breathing hold starts at
      // HOLD_DELAY_MS, which is tuned for cosmetics, not for honesty about
      // whether we are still waiting).
      setWaiting(true);
      requestHold();
      const observer = new MutationObserver(() => {
        if (!document.querySelector("[data-route-loading]")) {
          observer.disconnect();
          pendingRef.current.observer = null;
          setWaiting(false);
          pendingRef.current.routeReady = true;
          maybeReveal();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      pendingRef.current.observer = observer;
    });
  }

  // The route has committed (real content or a loading.tsx fallback) —
  // only meaningful while we're the ones who initiated the navigation.
  useEffect(() => {
    if (!pendingRef.current.active) return;
    watchForRouteReady();
    // pathname is the only dependency: query-string-only link targets are
    // deliberately not intercepted by the click handler below (this app's
    // filters are client-side state, not navigations), so watching
    // useSearchParams() here would add nothing but a Suspense-boundary
    // requirement for the whole layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function armTimers() {
    pendingRef.current.ceilingTimer = setTimeout(() => {
      pendingRef.current.routeReady = true;
      maybeReveal();
    }, CEILING_MS);
    pendingRef.current.holdTimer = setTimeout(() => {
      if (pendingRef.current.active && !pendingRef.current.revealed) requestHold();
    }, HOLD_DELAY_MS);
  }

  function startCover(href: string) {
    if (pendingRef.current.active || !overlayRef.current || !logoRef.current || !whiteRef.current)
      return;
    pendingRef.current = { ...freshPendingState(), active: true };

    setOverlayBlocking(true);
    markRouteCoverStarted();

    const giantScale = getGiantScale();
    // The logo starts already giant — that's the cover, on its own, the
    // instant it appears (LOGO_PIVOT is what makes this solid white rather
    // than empty gap) — settles for a beat, then shrinks and un-rotates
    // down into its idle position.
    gsap.set(logoRef.current, {
      scale: giantScale,
      rotation: SHRINK_FROM_ROTATION,
      opacity: 1,
    });

    const tl = gsap.timeline({
      onComplete: () => {
        pendingRef.current.coverAnimDone = true;
        pendingRef.current.coverAnimDoneAt = Date.now();
        engageHoldIfNeeded();
        maybeReveal();
      },
    });
    // The white wash fades in first — the current page visibly bleaches to
    // white — then the blue backdrop + giant mark appear on top of it.
    tl.to(
      whiteRef.current,
      { autoAlpha: 1, duration: WHITE_FADE_IN_DURATION, ease: "power2.out" },
      0,
    );
    tl.set(overlayRef.current, { autoAlpha: 1 }, WHITE_FADE_IN_DURATION);
    tl.to(
      logoRef.current,
      { scale: giantScale, duration: GIANT_SETTLE_DURATION },
      WHITE_FADE_IN_DURATION,
    );
    tl.to(
      logoRef.current,
      {
        scale: 1,
        rotation: 0,
        duration: SHRINK_DURATION,
        ease: "power3.out",
      },
      WHITE_FADE_IN_DURATION + GIANT_SETTLE_DURATION,
    );

    router.push(href);
    armTimers();
  }

  function startPopstateCover() {
    if (pendingRef.current.active || !overlayRef.current || !logoRef.current || !whiteRef.current)
      return;
    pendingRef.current = {
      ...freshPendingState(),
      active: true,
      coverAnimDone: true,
      coverAnimDoneAt: Date.now(),
      isPopstate: true,
    };

    setOverlayBlocking(true);
    markRouteCoverStarted();
    gsap.set(whiteRef.current, { autoAlpha: 1 });
    gsap.set(overlayRef.current, { autoAlpha: 1 });
    gsap.set(logoRef.current, { scale: 1, rotation: 0, opacity: 1 });

    armTimers();
  }

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
        return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/admin") || window.location.pathname.startsWith("/admin"))
        return;
      if (url.pathname === window.location.pathname) return;

      if (pendingRef.current.active) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      startCover(url.pathname + url.search + url.hash);
    }

    function onPopState() {
      startPopstateCover();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      clearCeiling();
      clearHoldTimer();
      clearMinStayTimer();
      pendingRef.current.observer?.disconnect();
      holdTweenRef.current?.kill();
    },
    [],
  );

  return (
    <>
      <div
        ref={whiteRef}
        aria-hidden
        className="pointer-events-none invisible fixed inset-0 z-[999] bg-white opacity-0"
      />
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none invisible fixed inset-0 z-[999] opacity-0 bg-[var(--brand-blue)]"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <LogoMark ref={logoRef} tone="white" solid className="h-24 w-24 sm:h-32 sm:w-32" />
          {waiting ? (
            <span
              data-route-transition-waiting
              className="rt-waiting absolute top-[calc(50%+4.5rem)] flex items-center gap-2 sm:top-[calc(50%+5.5rem)]"
            >
              <span className="rt-waiting-dot" />
              <span className="rt-waiting-dot [animation-delay:0.15s]" />
              <span className="rt-waiting-dot [animation-delay:0.3s]" />
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
