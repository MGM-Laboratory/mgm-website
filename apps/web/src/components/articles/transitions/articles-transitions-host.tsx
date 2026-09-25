"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ArticleTransitions } from "@/components/articles/transitions/article-transitions";

type PrefetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>["kind"];
// Next's PrefetchKind.FULL (a string enum it doesn't export publicly).
const FULL_PREFETCH = "full" as unknown as PrefetchKind;

/**
 * Hosts the transitions that play inside the library world: list to
 * article ("open"), article to list ("close") and article to article
 * ("swap"), see article-transitions.ts. Mounted by app/articles/layout.tsx
 * after the world host, so it lives exactly as long as the world does.
 * Renders nothing.
 */
export function ArticlesTransitionsHost() {
  const router = useRouter();
  const pathname = usePathname();
  const controllerRef = useRef<ArticleTransitions | null>(null);

  useEffect(() => {
    const controller = new ArticleTransitions({
      navigate: (href, options) => router.push(href, options),
      prefetch: (href) => router.prefetch(href, { kind: FULL_PREFETCH }),
      pathname: window.location.pathname,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [router]);

  // Passive on purpose: after the committed page's own layout effects.
  useEffect(() => {
    controllerRef.current?.routeChanged(pathname);
  }, [pathname]);

  return null;
}
