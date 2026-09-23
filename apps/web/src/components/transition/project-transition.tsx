"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ProjectZoom } from "@/components/transition/project-zoom";
import { registerProjectTransitionLayer } from "@/lib/project-transition";

type PrefetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>["kind"];
// Next's PrefetchKind.FULL (a string enum it doesn't export publicly).
const FULL_PREFETCH = "full" as unknown as PrefetchKind;

/**
 * The project zoom transition's persistent layer, mounted in the root layout
 * next to the route curtain. Clicking a project card zooms into its cover
 * and shifts the page to the project's theme on the way into
 * /projects/<slug>; going back zooms out and lands on the card again; back
 * and forward between two projects crossfade their colours. The motion
 * lives in project-zoom.ts (and its renderers); this component only owns
 * the markup and feeds it route changes.
 *
 * Stacking: the overlay sits at z-45, above the page, the nav menu (40) and
 * the cursor wake (40), and below the header (50), which stays visible and
 * takes on the project's colours while the zoom plays. The shield above the
 * header (51) only takes pointer input while a transition runs.
 */
export function ProjectTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const shieldRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ProjectZoom | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const layer = layerRef.current;
    const shield = shieldRef.current;
    if (!root || !layer || !shield) return;
    const zoom = new ProjectZoom({
      root,
      layer,
      shield,
      navigate: (href, options) => router.push(href, options),
      // The full payload (a dynamic page is otherwise not prefetched), so
      // the route can change the moment the zoom covers the page.
      prefetch: (href) => router.prefetch(href, { kind: FULL_PREFETCH }),
      pathname: window.location.pathname,
    });
    zoomRef.current = zoom;
    const unregister = registerProjectTransitionLayer();
    return () => {
      unregister();
      zoom.dispose();
      zoomRef.current = null;
    };
  }, [router]);

  useEffect(() => {
    zoomRef.current?.routeChanged(pathname);
  }, [pathname]);

  return (
    <>
      <div
        ref={rootRef}
        aria-hidden
        className="pointer-events-none invisible fixed inset-0 z-[45] overflow-hidden opacity-0"
      >
        {/* The theme colour: fades in over the page as the zoom plays. */}
        <div ref={layerRef} className="absolute inset-0 opacity-0" />
      </div>
      <div
        ref={shieldRef}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[51] h-16"
      />
    </>
  );
}
