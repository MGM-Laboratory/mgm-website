"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import "./loader.css";

import { reapplyBoot } from "@/components/loader/boot";
import { siteLoader, type LoaderSnapshot } from "@/components/loader/loader-core";
import { LoaderView } from "@/components/loader/loader-view";
import { LOADER_COPY } from "@/data/story";

/**
 * The site loading screen's host (mounted once, in the root layout). The
 * core (`loader-core.ts`) decides everything; this renders the parts that
 * must hold whatever the view looks like: a fixed layer shown only while
 * `html[data-loader="active"]` (so no-JS visitors never see it), a
 * `role="progressbar"` with a name and a value, and a polite live region.
 * The visuals are `LoaderView`, which the loader package replaces.
 */

export type LoaderViewProps = Readonly<{
  state: LoaderSnapshot;
  /** Call once the exit has played; the core then hides the loader. */
  onExited: () => void;
  /** Call when the exit starts to show the page (the page's entrance may start then). */
  onRevealing?: () => void;
}>;

export type LoaderViewComponent = (props: LoaderViewProps) => ReactNode;

type PrefetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>["kind"];
// Next's PrefetchKind.FULL (a string enum it doesn't export publicly).
const FULL_PREFETCH = "full" as unknown as PrefetchKind;

export function SiteLoader({ View = LoaderView }: Readonly<{ View?: LoaderViewComponent }>) {
  const state = useSyncExternalStore(
    siteLoader.subscribe,
    siteLoader.getSnapshot,
    siteLoader.getServerSnapshot,
  );
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const routerRef = useRef(router);
  // The first load's route: a client navigation never restarts the loader.
  const firstPath = useRef(pathname);

  useLayoutEffect(() => {
    routerRef.current = router;
  });

  useLayoutEffect(() => {
    reapplyBoot();
    siteLoader.start(firstPath.current, (href) => {
      routerRef.current.prefetch(href, { kind: FULL_PREFETCH });
    });
  }, []);

  // While it shows, a wheel or a swipe over it must not scroll the page underneath.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || state.phase === "done") return;
    const stop = (event: Event) => {
      event.preventDefault();
    };
    root.addEventListener("wheel", stop, { passive: false });
    root.addEventListener("touchmove", stop, { passive: false });
    return () => {
      root.removeEventListener("wheel", stop);
      root.removeEventListener("touchmove", stop);
    };
  }, [state.phase]);

  if (state.phase === "done") return null;
  const percent = Math.round(state.progress * 100);
  return (
    <div ref={rootRef} data-site-loader data-phase={state.phase} className="site-loader">
      <div
        role="progressbar"
        aria-label={LOADER_COPY.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent} percent`}
        className="site-loader-body"
      >
        <View state={state} onExited={siteLoader.exited} onRevealing={siteLoader.revealing} />
      </div>
      <p aria-live="polite" className="sr-only">
        {state.announcement}
      </p>
      <noscript>
        <style>{"[data-site-loader]{display:none!important}"}</style>
      </noscript>
    </div>
  );
}
