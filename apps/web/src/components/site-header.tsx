"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/nav/logo-mark";
import { NavMenu } from "@/components/nav/nav-menu";
import { useHeaderTone } from "@/hooks/use-header-tone";
import { hasAppAlreadyBooted } from "@/lib/app-boot";
import { articleListHref, waitForArticleReveal } from "@/lib/article-transition";
import { waitForProjectReveal } from "@/lib/project-transition";
import { waitForRouteReveal } from "@/lib/route-reveal";

/** A single project's detail page, `/projects/<slug>` (not the index). */
const PROJECT_DETAIL_PATH = /^\/projects\/[^/]+\/?$/;
/** A single article, `/articles/<slug>` (not the list). */
const ARTICLE_DETAIL_PATH = /^\/articles\/[^/]+\/?$/;

// Rendered outside the ScrollSmoother wrapper (see layout.tsx) and kept
// `fixed` — a `sticky` header inside smooth-scrolled content doesn't stick,
// since ScrollSmoother moves content via `transform`, which carries sticky
// descendants along with it instead of letting them stick to the viewport.
// The nav panel/overlay NavMenu renders are `fixed` themselves and sit at a
// lower z-index than this header, so the header (logo + toggle) stays
// crisp and clickable on top while the panel slides in below it.
//
// The frosted glass is the first child, not the <header> itself: see the
// .site-header block in globals.css for why the menu needs it that way.
export function SiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return <HeaderBar pathname={pathname} />;
}

/**
 * The bar itself, its own component so the adaptive tone hook only runs
 * while the header is on screen (never on /admin, and it starts afresh when
 * the header comes back from there).
 *
 * `data-header-zone` marks the zones the hook samples behind and colours:
 * the logo and the right-hand controls (the Back pill is its own centre
 * zone on wide screens). The controls wrapper also holds the nav menu's
 * fixed overlay and panel, so it must never get a filter, transform or
 * backdrop-filter (they would become its containing block).
 */
function HeaderBar({ pathname }: { pathname: string }) {
  const headerRef = useRef<HTMLElement>(null);
  useHeaderTone(headerRef);
  const onProjectDetail = PROJECT_DETAIL_PATH.test(pathname);
  const onArticleDetail = ARTICLE_DETAIL_PATH.test(pathname);

  return (
    <header
      ref={headerRef}
      className="site-header fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-4 px-6 sm:px-10"
    >
      <div aria-hidden className="site-header-glass" />

      <LogoMark />

      {/* The back pill comes first here so the tab order runs left to right
          on both layouts: centred in the bar on wide screens (absolutely
          positioned against the header), and an in-flow circle just left of
          the theme toggle at 812px and below. */}
      <div data-header-zone="controls" className="flex items-center gap-2 sm:gap-4">
        {onProjectDetail && <ProjectBackLink />}
        {onArticleDetail && <ArticleBackLink />}
        <ThemeToggle className="size-11 lg:size-8" />
        <NavMenu />
      </div>
    </header>
  );
}

export const SITE_HEADER_HEIGHT = 64;

/**
 * lusion.co-style "Back" pill for project detail pages. Its entrance, hover
 * slide-through and press are CSS (globals.css, `.project-back`). A fresh
 * load plays the entrance straight from the server HTML; arriving by
 * internal navigation mounts it under the route-transition curtain, so the
 * entrance is held until the curtain has revealed the page.
 */
function ProjectBackLink() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  // Read at first render (see lib/app-boot.ts): false on a fresh load or
  // reload, true when this mounted from a client-side navigation.
  const [arrivedInternally] = useState(hasAppAlreadyBooted);

  useLayoutEffect(() => {
    const link = linkRef.current;
    if (!link || !arrivedInternally) return;
    let cancelled = false;
    link.dataset.waiting = "";
    // Wait for whichever cover brought the page in: the route curtain or the
    // project zoom (which holds its final frame until the page is ready).
    void Promise.all([waitForRouteReveal(), waitForProjectReveal()]).then(() => {
      if (!cancelled) delete link.dataset.waiting;
    });
    return () => {
      cancelled = true;
    };
  }, [arrivedInternally]);

  return (
    <Link
      ref={linkRef}
      href="/projects"
      data-project-back=""
      aria-label="Back to projects"
      className="project-back"
    >
      <BackPillContent />
    </Link>
  );
}

/** The pill's arrows and label (shared by the project and article pills). */
function BackPillContent() {
  return (
    <>
      <ArrowLeft
        aria-hidden
        strokeWidth={2.25}
        className="project-back-icon project-back-icon-out"
      />
      <span className="project-back-label">Back</span>
      <ArrowLeft
        aria-hidden
        strokeWidth={2.25}
        className="project-back-icon project-back-icon-in"
      />
    </>
  );
}

/**
 * The same "Back" pill on an article page, back to the articles list as the
 * visitor left it (its filters, see `articleListHref`). The articles
 * transitions take its click (`data-article-back`) and play the list's
 * return; its entrance waits for whichever cover brought the article in.
 */
function ArticleBackLink() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [arrivedInternally] = useState(hasAppAlreadyBooted);
  // Read once when the pill appears: the list address the visitor opened
  // this article from (the plain list on a fresh load).
  const [href] = useState(articleListHref);

  useLayoutEffect(() => {
    const link = linkRef.current;
    if (!link || !arrivedInternally) return;
    let cancelled = false;
    link.dataset.waiting = "";
    void Promise.all([waitForRouteReveal(), waitForArticleReveal()]).then(() => {
      if (!cancelled) delete link.dataset.waiting;
    });
    return () => {
      cancelled = true;
    };
  }, [arrivedInternally]);

  return (
    <Link
      ref={linkRef}
      href={href}
      data-article-back=""
      aria-label="Back to articles"
      className="project-back"
    >
      <BackPillContent />
    </Link>
  );
}
