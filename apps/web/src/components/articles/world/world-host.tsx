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
import { mountWorldCursor } from "@/components/articles/world/cursor/world-cursor";
// Type only (erased): the engine and three.js stay in the dynamic import.
import type { LibraryEngine } from "@/components/articles/world/engine";
import { qualityOverrides } from "@/components/articles/world/quality";
import { runThemeWave, themeWaveMasksDom } from "@/components/articles/world/theme-wave";
import {
  articleDetailSlug,
  isArticleTransitionBusy,
  onArticleTransitionChange,
  registerArticleWorldLayer,
} from "@/lib/article-transition";
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

/** Visible time the engine may take to start before the visit falls back to the DOM list. */
const START_FAILSAFE_MS = 6000;

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

    // The theme switch, staged for the whole visit: with the world up, a
    // front from the toggle that the world and the page's DOM follow
    // together (the class change the switch commits starts the world's
    // half); in the DOM list, the page's half alone. Under reduced motion
    // the toggle switches at once.
    let waveSource: LibraryEngine | null = null;
    let pendingWave: { dark: boolean; origin: { x: number; y: number }; masked: boolean } | null =
      null;
    const offSwitch = registerThemeSwitchHandler((request) => {
      if (!motionAllowed()) return false;
      pendingWave = waveSource
        ? { dark: request.next === "dark", origin: request.origin, masked: themeWaveMasksDom() }
        : null;
      runThemeWave(request, waveSource);
      return true;
    });

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
      // The DOM cards stay hidden while the mode is pending (so the swap to
      // WebGL never shows): if the engine hasn't started after this much
      // visible time (a stalled chunk, a hung import), the visit goes DOM.
      // Visible time only: a background tab freezes frames, not timers
      // (docs/animation-system.md gotcha #18).
      let waited = 0;
      let last = performance.now();
      const failsafe = window.setInterval(() => {
        const now = performance.now();
        if (!document.hidden) waited += now - last;
        last = now;
        if (engine || cancelled) window.clearInterval(failsafe);
        else if (waited > START_FAILSAFE_MS) {
          window.clearInterval(failsafe);
          cancelled = true;
          setWorldState("dom", null);
        }
      }, 250);
      offs.push(() => window.clearInterval(failsafe));

      import("@/components/articles/world/engine")
        .then(async ({ LibraryEngine }) => {
          if (cancelled) return;
          const overrides = qualityOverrides(window.location.search);
          let created: InstanceType<typeof LibraryEngine>;
          try {
            created = new LibraryEngine({
              tier: overrides.tier ?? qualityTier(),
              dark: isDark(),
              route: routeFor(window.location.pathname),
              lockQuality: overrides.tier !== null || overrides.pixelRatio !== null,
              pixelRatio: overrides.pixelRatio,
              onContextLost: () => {
                teardown();
                setWorldState("dom", null);
              },
              // Far too slow to use (a software renderer that hides its
              // name): the DOM list serves the visit better. Never under a
              // running transition, which still draws in this world.
              onTooSlow: () => {
                const handOver = () => {
                  if (cancelled || isArticleTransitionBusy()) return false;
                  teardown();
                  setWorldState("dom", null);
                  return true;
                };
                if (handOver()) return;
                const off = onArticleTransitionChange(() => {
                  if (handOver()) off();
                });
                offs.push(off);
              },
            });
          } catch {
            setWorldState("dom", null);
            return;
          }
          engine = created;
          // Warm the shaders before the first frame (and before the pages
          // hand their cards over), so the world arrives without a hitch.
          await created.start();
          if (cancelled || engine !== created) return;
          created.setRoute(routeFor(window.location.pathname));

          // Follow the site scheme from any source (the toggle, the OS,
          // another tab). Only a real flip counts: other code may touch
          // <html>'s classes, and a stray mutation must not cut a wave short.
          let lastDark = isDark();
          created.setScheme(lastDark);
          const observer = new MutationObserver(() => {
            const dark = isDark();
            if (dark === lastDark) return;
            lastDark = dark;
            const wave = pendingWave;
            if (wave && wave.dark === dark) {
              created.setScheme(dark, { wave: wave.origin, masked: wave.masked });
              pendingWave = null;
            } else {
              created.setScheme(dark);
            }
          });
          observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
          });
          offs.push(() => observer.disconnect());
          waveSource = created;
          offs.push(() => {
            waveSource = null;
            pendingWave = null;
          });

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

    // The library's cursor ring: a fine pointer with motion allowed, in
    // either mode (it is DOM, the world need not run).
    let offCursor: (() => void) | null =
      motionAllowed() && window.matchMedia("(hover: hover) and (pointer: fine)").matches
        ? mountWorldCursor()
        : null;

    const offReduced = onReducedMotion(() => {
      teardown();
      offCursor?.();
      offCursor = null;
      setWorldState("dom", null);
    });

    return () => {
      cancelled = true;
      offSwitch();
      offReduced();
      offCursor?.();
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
