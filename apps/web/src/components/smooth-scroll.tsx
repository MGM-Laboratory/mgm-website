"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";

import { SITE_HEADER_HEIGHT } from "@/components/site-header";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const pendingKillRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const shouldSmooth = pathname === "/";

  useLayoutEffect(() => {
    // Smoothing itself is a motion effect — reduced-motion visitors keep
    // native, unsmoothed scrolling instead.
    if (!shouldSmooth || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches)
      return;

    // React's Strict Mode (dev only) mounts, cleans up, and remounts this
    // effect synchronously on first render. Actually killing and
    // recreating ScrollSmoother across that churn — especially while the
    // page loaded already scrolled down (a reload elsewhere on the page)
    // — leaves GSAP's internal ScrollTrigger registry in a state where the
    // next trigger created throws. So: cancel any kill left pending by a
    // just-finished cleanup and reuse the still-live instance instead of
    // tearing it down and rebuilding it.
    if (pendingKillRef.current) {
      clearTimeout(pendingKillRef.current);
      pendingKillRef.current = null;
    }
    const smoother =
      ScrollSmoother.get() ?? ScrollSmoother.create({ smooth: 0.75, smoothTouch: 0 });

    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, { __smoother: smoother });
    }

    return () => {
      // Deferred to the next tick: if this is Strict Mode's remount (which
      // happens synchronously, before any timer fires), the effect above
      // cancels this and reuses `smoother`. Only a genuine unmount lets it
      // actually run.
      pendingKillRef.current = setTimeout(() => {
        smoother.kill();
        pendingKillRef.current = null;
      }, 0);
    };
  }, [shouldSmooth]);

  // The public-site header is deliberately outside this wrapper and the
  // content receives its 64px offset below. Admin owns its own chrome, so
  // retaining this wrapper there produced a blank, differently coloured band
  // above the workspace. Keep the CMS in the native document flow instead.
  if (isAdminRoute) return <>{children}</>;

  return (
    <div id="smooth-wrapper">
      {/* Offsets every page's content below the fixed SiteHeader — the
          header lives outside this wrapper (see layout.tsx) so it stays
          pinned to the viewport instead of moving with the scroll transform. */}
      <div id="smooth-content" style={{ paddingTop: SITE_HEADER_HEIGHT }}>
        {children}
      </div>
    </div>
  );
}
