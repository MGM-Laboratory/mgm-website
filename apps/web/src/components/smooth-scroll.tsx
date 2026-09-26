"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";

import { SITE_HEADER_HEIGHT } from "@/components/site-header";
import { InteractiveBackground } from "@/components/interactive-background";
import { isArticlesPath } from "@/lib/article-transition";
import { consumeScrollResetSkip, projectDetailSlug } from "@/lib/project-transition";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const pendingKillRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const pathname = usePathname();
  // Admin and the public forms own their chrome and scroll natively.
  const isAdminRoute =
    pathname.startsWith("/admin") || pathname === "/forms" || pathname.startsWith("/forms/");
  const isProjectDetail = projectDetailSlug(pathname) !== null;
  const isArticles = isArticlesPath(pathname);
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

  // Every real route change (not the first render, and not a same-page hash
  // navigation — usePathname() excludes the hash, so hero.tsx's anchor
  // scrolling never triggers this) should land at the very top of the new
  // page. Next's own "scroll to top on navigate" walks the DOM for a
  // scrollable, non-fixed element and gives up otherwise — ScrollSmoother
  // puts #smooth-wrapper at `position: fixed`, so on "/" that walk finds
  // nothing and silently skips the reset. Declared after the effect above so
  // a smoother for the page we're arriving on already exists by the time
  // this runs: on entry this forces its just-created position to 0 (instead
  // of whatever native scrollY it happened to read while mounting), and on
  // exit it resets the still-live outgoing smoother — clearing the stale
  // transform on #smooth-content — before its deferred kill() tears it down.
  //
  // One exception: the project list, entered back from a project through
  // the zoom transition, restores its own scroll position in its layout
  // effects (which run before this one) and asks to keep it.
  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (consumeScrollResetSkip(pathname)) return;
    window.scrollTo(0, 0);
    ScrollSmoother.get()?.scrollTo(0, false);
    const content = document.getElementById("smooth-content");
    if (content) content.style.transform = "";
  }, [pathname]);

  // The public-site header is deliberately outside this wrapper and the
  // content receives its 64px offset below. Admin owns its own chrome, so
  // retaining this wrapper there produced a blank, differently coloured band
  // above the workspace. Keep the CMS in the native document flow instead.
  if (isAdminRoute) return <>{children}</>;

  return (
    <>
      {/* Project detail pages draw their own ambient layer (the topography
          canvas, which also reacts to the cursor), and the articles pages
          live inside the library world (with cursor trails of its own): a
          second cursor effect on top would fight them and ignores their
          colours. */}
      {isProjectDetail || isArticles ? null : <InteractiveBackground />}
      <div id="smooth-wrapper">
        {/* Offsets every page's content below the fixed SiteHeader — the
          header lives outside this wrapper (see layout.tsx) so it stays
          pinned to the viewport instead of moving with the scroll transform. */}
        <div id="smooth-content" style={{ paddingTop: SITE_HEADER_HEIGHT }}>
          {children}
        </div>
      </div>
    </>
  );
}
