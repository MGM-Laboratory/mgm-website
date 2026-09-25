"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { PortalController } from "@/components/transition/articles-portal-controller";
import { registerArticlePortalLayer } from "@/lib/article-transition";

type PrefetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>["kind"];
// Next's PrefetchKind.FULL (a string enum it doesn't export publicly).
const FULL_PREFETCH = "full" as unknown as PrefetchKind;

/**
 * The portal between the rest of the site and the articles library: the
 * transition any other page plays into /articles (and /articles/<slug>),
 * and the one the library plays back out to the real world. Mounted in the
 * root layout next to the project zoom, because it has to outlive both
 * sides of the navigation.
 *
 * It renders nothing: the controller (articles-portal-controller.ts)
 * listens for the navigations it owns and builds its layers on <body> only
 * while one plays. Its renderers (the DOM stage and the WebGL layer) are
 * dynamic imports, loaded when a link that leads through the portal is
 * hovered, focused or pressed, so the pages that never use it (the
 * Lighthouse-audited ones among them) ship neither, and three.js never
 * reaches the root chunk.
 */
export function ArticlesPortal() {
  const router = useRouter();
  const pathname = usePathname();
  const controllerRef = useRef<PortalController | null>(null);

  useEffect(() => {
    const controller = new PortalController({
      navigate: (href) => router.push(href),
      // The full payload (a dynamic page is otherwise not prefetched), so
      // the route can change the moment the portal covers the page.
      prefetch: (href) => router.prefetch(href, { kind: FULL_PREFETCH }),
      pathname: window.location.pathname,
    });
    controllerRef.current = controller;
    const unregister = registerArticlePortalLayer();
    return () => {
      unregister();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [router]);

  // A passive effect on purpose: it runs after every layout effect of the
  // page that just committed (the homepage's smooth scroller exists by
  // then, and the library world has decided its mode).
  useEffect(() => {
    controllerRef.current?.routeChanged(pathname);
  }, [pathname]);

  return null;
}
