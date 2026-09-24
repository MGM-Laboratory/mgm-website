"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import type {
  ArticlesWorldApi,
  QualityTier,
  WorldRoute,
} from "@/components/articles/world/world-api";
import {
  getArticlesWorld,
  resetWorldState,
  setWorldState,
} from "@/components/articles/world/world-registry";
import { runThemeWave } from "@/components/articles/world/theme-wave";
import { articleDetailSlug, registerArticleWorldLayer } from "@/lib/article-transition";
import { registerHeaderToneProvider } from "@/lib/header-tone";
import { motionAllowed, onReducedMotion } from "@/lib/reduced-motion";
import { registerThemeSwitchHandler } from "@/lib/theme-switch";

// Layout effects on purpose (docs/animation-system.md gotcha #13): the
// world's cleanup must run in the commit that leaves /articles, before the
// root layout's scroll reset, like every JS scroller on this site.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Renderers that are really a CPU: the world would crawl there, so those visitors get the DOM list. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

let probed: boolean | null = null;

/**
 * three@0.186 is WebGL2-only. Needs a hardware context: a major performance
 * caveat fails the probe outright, and a renderer string that names a
 * software rasteriser (SwiftShader passes the caveat check, which is what
 * Playwright's headless Chromium and CI runners use) fails it too.
 */
function hardwareWebGL2() {
  if (probed !== null) return probed;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) {
      probed = false;
      return probed;
    }
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    probed = !SOFTWARE_RENDERER.test(renderer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    probed = false;
  }
  return probed;
}

function qualityTier(): QualityTier {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse) return memory <= 3 || cores <= 4 ? "low" : "medium";
  if (memory <= 4 || cores <= 4) return "medium";
  return "high";
}

function routeFor(pathname: string): WorldRoute {
  const slug = articleDetailSlug(pathname);
  return slug ? { kind: "detail", slug } : { kind: "list" };
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

/**
 * Hosts the library world for every articles route. Mounted once by
 * app/articles/layout.tsx (before the page, so its layout effects run
 * first) and kept across list and article navigations, which is what lets
 * the transitions between them play inside one continuous scene.
 *
 * Decides the mode once per visit (world-registry.ts): the WebGL world for
 * visitors with motion allowed and a hardware WebGL2 context, otherwise the
 * DOM list for the whole visit. Renders nothing itself: the engine appends
 * its canvas to <body>, outside the smooth-scroll wrapper.
 */
export function ArticlesWorldHost() {
  const pathname = usePathname();

  useIsomorphicLayoutEffect(() => {
    const offLayer = registerArticleWorldLayer();
    let cancelled = false;
    let engine: ArticlesWorldApi | null = null;
    const offs: (() => void)[] = [];

    const teardown = () => {
      for (const off of offs.splice(0)) off();
      engine?.dispose();
      engine = null;
    };

    if (
      !motionAllowed() ||
      !hardwareWebGL2() ||
      new URLSearchParams(window.location.search).has("noworld")
    ) {
      setWorldState("dom", null);
    } else {
      import("@/components/articles/world/engine")
        .then(({ LibraryEngine }) => {
          if (cancelled) return;
          let created: ArticlesWorldApi;
          try {
            created = new LibraryEngine({
              tier: qualityTier(),
              dark: isDark(),
              onContextLost: () => {
                teardown();
                setWorldState("dom", null);
              },
            });
          } catch {
            setWorldState("dom", null);
            return;
          }
          engine = created;
          created.setRoute(routeFor(window.location.pathname));

          // A toggle click stages a wave; the class change it commits plays it.
          let pendingWave: { dark: boolean; origin: { x: number; y: number } } | null = null;

          // Follow the site scheme from any source (the toggle, the OS, another tab).
          const observer = new MutationObserver(() => {
            if (!engine) return;
            const dark = isDark();
            if (pendingWave && pendingWave.dark === dark) {
              engine.setScheme(dark, { wave: pendingWave.origin });
              pendingWave = null;
            } else {
              engine.setScheme(dark);
            }
          });
          observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
          });
          offs.push(() => observer.disconnect());

          // Stage the header toggle's switch as a wave from the toggle.
          offs.push(
            registerThemeSwitchHandler((request) => {
              if (!engine || !motionAllowed()) return false;
              pendingWave = { dark: request.next === "dark", origin: request.origin };
              runThemeWave(request);
              return true;
            }),
          );

          // The adaptive header reads the fog behind it (the canvas is
          // invisible to hit testing).
          offs.push(
            registerHeaderToneProvider((zones) =>
              zones.map((zone) =>
                zone.points.map((point) => ({
                  color: created.colorAt(point.x, point.y),
                  media: false,
                })),
              ),
            ),
          );

          const onVisibility = () => {
            if (document.hidden) engine?.pause();
            else engine?.resume();
          };
          document.addEventListener("visibilitychange", onVisibility);
          offs.push(() => document.removeEventListener("visibilitychange", onVisibility));

          setWorldState("gl", created);
        })
        .catch(() => {
          if (!cancelled) setWorldState("dom", null);
        });
    }

    const offReduced = onReducedMotion(() => {
      teardown();
      setWorldState("dom", null);
    });

    return () => {
      cancelled = true;
      offReduced();
      teardown();
      offLayer();
      resetWorldState();
    };
  }, []);

  // Dress the world for the page on screen.
  useIsomorphicLayoutEffect(() => {
    getArticlesWorld()?.setRoute(routeFor(pathname));
  }, [pathname]);

  return null;
}
