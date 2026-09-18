"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";

import { LogoMark } from "@/components/hero/shapes";

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
 * multiplier: scaling from the mark's own center pivots on a point that
 * sits in the empty space between its three shards, so growing from center
 * mostly reveals more of that empty gap, not more solid white — no
 * multiplier fixes that. LOGO_PIVOT instead re-centers the scale transform
 * on a point deep inside one shard's solid fill (found empirically — see
 * the PR description for the verification method: render the mark alone at
 * a candidate pivot and scale, then sample element-under-pointer at all
 * four viewport corners plus center across several aspect ratios). Scaling
 * from a true interior point is a "zoom into a point" operation: every
 * other point in the mark recedes from view as scale grows, so sufficient
 * scale is *guaranteed* to fill the viewport with solid color, regardless of
 * aspect ratio — confirmed at 8x for standard viewports but not for an
 * ultrawide (2560×1080) until 12x, which is why the multiplier below is 12,
 * not 8. Because scale=1 (idle) makes any transform-origin a no-op, this
 * off-center pivot never visibly affects the centered idle mark — it only
 * matters while giant.
 *
 * Scope: this only ever engages for client-side navigations triggered by an
 * in-app link click (see the capture-phase click listener below) or a
 * browser back/forward. It never touches the very first paint of a hard
 * page load — an SSR-visible "always covering" default would hide real
 * content from anyone without JavaScript with no way to ever reveal it
 * again, which is a strictly worse outcome than skipping the boot moment.
 */

const WHITE_FADE_DURATION = 0.3;
const GIANT_SETTLE_DURATION = 0.12;
const GIANT_HOLD_DELAY = 0.1;
const SHRINK_DURATION = 0.7;
const SHRINK_FROM_ROTATION = -18;
const GROW_DURATION = 0.4;
const GROW_TO_ROTATION = 18;
const FADE_OUT_DURATION = 0.22;
const GIANT_SCALE_MARGIN = 1.15;
// See LOGO_PIVOT above: 12x the "just covers the viewport" scale, verified
// empirically to fully cover every sampled corner across five aspect ratios
// (8x left the corners of an ultrawide viewport uncovered).
const GIANT_SCALE_MULTIPLIER = 12;
// A point inside the left leg's solid stroke, expressed as a percentage of
// the mark's own viewBox (57.5 86.0265 660 660) — see the multiplier
// comment above for how this was found and verified.
const LOGO_PIVOT = "30% 27%";
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
  routeReady: boolean;
  revealed: boolean;
  holdRequested: boolean;
  holdStarted: boolean;
  isPopstate: boolean;
  observer: MutationObserver | null;
  ceilingTimer: ReturnType<typeof setTimeout> | null;
  holdTimer: ReturnType<typeof setTimeout> | null;
};

function freshPendingState(): PendingState {
  return {
    active: false,
    coverAnimDone: false,
    routeReady: false,
    revealed: false,
    holdRequested: false,
    holdStarted: false,
    isPopstate: false,
    observer: null,
    ceilingTimer: null,
    holdTimer: null,
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

  // Requesting a hold and actually starting its tween are separate: the
  // shrink-in timeline may still be mid-flight (a fast dev server, or a
  // route whose loading.tsx sentinel appears within the first ~100ms, can
  // both request a hold well before the ~0.9s cover-in finishes). Starting
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
    if (state.coverAnimDone && state.routeReady && !state.revealed) {
      startReveal();
    }
  }

  function startReveal() {
    const state = pendingRef.current;
    state.revealed = true;
    clearCeiling();
    clearHoldTimer();
    state.observer?.disconnect();
    state.observer = null;
    holdTweenRef.current?.kill();
    holdTweenRef.current = null;

    if (!overlayRef.current || !logoRef.current || !whiteRef.current) {
      pendingRef.current = freshPendingState();
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
      },
    });
    // Fast grow back to giant, sliding off-center as it grows — covering the
    // whole screen a second time with a different solid region of the mark
    // — then the blue backdrop fades (revealing the white wash underneath),
    // and only once that's done does the white wash itself fade last,
    // gradually bringing the real destination into view.
    tl.to(logoRef.current, {
      scale: giantScale,
      rotation: GROW_TO_ROTATION,
      duration: GROW_DURATION,
      ease: "power2.in",
    });
    tl.to(overlayRef.current, { autoAlpha: 0, duration: FADE_OUT_DURATION, ease: "power1.in" });
    tl.to(whiteRef.current, { autoAlpha: 0, duration: WHITE_FADE_DURATION, ease: "power2.in" });
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
        pendingRef.current.routeReady = true;
        maybeReveal();
        return;
      }
      requestHold();
      const observer = new MutationObserver(() => {
        if (!document.querySelector("[data-route-loading]")) {
          observer.disconnect();
          pendingRef.current.observer = null;
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
        engageHoldIfNeeded();
        maybeReveal();
      },
    });
    // The white wash fades in first — the current page visibly bleaches to
    // white — then the blue backdrop + giant mark appear on top of it.
    tl.to(whiteRef.current, { autoAlpha: 1, duration: WHITE_FADE_DURATION, ease: "power2.out" }, 0);
    tl.set(overlayRef.current, { autoAlpha: 1 }, WHITE_FADE_DURATION);
    tl.to(
      logoRef.current,
      { scale: giantScale, duration: GIANT_SETTLE_DURATION },
      WHITE_FADE_DURATION,
    );
    tl.to(
      logoRef.current,
      {
        scale: 1,
        rotation: 0,
        duration: SHRINK_DURATION,
        ease: "power3.out",
      },
      WHITE_FADE_DURATION + GIANT_SETTLE_DURATION + GIANT_HOLD_DELAY,
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
      isPopstate: true,
    };

    setOverlayBlocking(true);
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
        </div>
      </div>
    </>
  );
}
