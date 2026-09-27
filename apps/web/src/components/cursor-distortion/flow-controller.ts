// Type only (erased): the engine and three.js stay in the dynamic import.
import type { FlowEngine, FlowFailure } from "@/components/cursor-distortion/flow-engine";
import { FlowSurfaces, pageColor } from "@/components/cursor-distortion/flow-surfaces";
import { isArticleTransitionBusy, onArticleTransitionChange } from "@/lib/article-transition";
import { setGlHost } from "@/lib/gl-host";
import {
  registerHeaderToneProvider,
  requestHeaderToneSample,
  type HeaderToneProvider,
} from "@/lib/header-tone";
import { probePoint } from "@/lib/header-tone-probe";
import { finePointer } from "@/lib/motion/pointer";
import { motionAllowed, onReducedMotion } from "@/lib/reduced-motion";

/**
 * The cursor flow's lifecycle for one visit (cursor-flow.tsx mounts it
 * from the smooth-scroll shell, so it spans every public route).
 *
 * - Who gets it: a fine pointer, motion allowed, a hardware WebGL2 context
 *   (a software renderer is rejected by name, and one that hides its name
 *   by a timed first frame). Everyone else keeps the plain CSS page. So do
 *   `?noflow` visits.
 * - When it loads: never in the first chunk. The engine (and three.js) is
 *   imported once the browser is idle after load, or soon after the first
 *   mouse move, whichever comes first.
 * - Where it shows: one stage for the whole visit. Routes that draw their
 *   own cursor effect (a project page, the articles library) hide it and
 *   release its big buffers; returning shows it again, already compiled.
 *   It also steps aside while an articles transition runs: the portal
 *   lifts the page like a sheet over the library's arch, which sits under
 *   the page just like this canvas would.
 * - What stops it for good: reduced motion switched on, a lost context,
 *   a renderer too slow to keep up. The page goes back to its CSS
 *   backgrounds and the canvas is removed.
 */

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

let probed: boolean | null = null;

/** three@0.186 needs WebGL2; the flow needs it on real hardware. */
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

function isDark() {
  return document.documentElement.classList.contains("dark");
}

function wanted() {
  return (
    motionAllowed() && finePointer() && !new URLSearchParams(window.location.search).has("noflow")
  );
}

/** Runs `callback` when the main thread is free (Safari has no idle callback: a timer). */
function whenIdle(callback: () => void, timeout: number) {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => {
      window.cancelIdleCallback(handle);
    };
  }
  const handle = globalThis.setTimeout(callback, Math.min(timeout, 1200));
  return () => {
    globalThis.clearTimeout(handle);
  };
}

class FlowController {
  /** The route wants the stage (cursor-flow.tsx). */
  private wanted = false;
  /** The route wants it and nothing asks it to step aside. */
  private active = false;
  private state: "idle" | "loading" | "ready" | "off" = "idle";
  private engine: FlowEngine | null = null;
  private shown = false;
  private readonly surfaces = new FlowSurfaces((color, shellChanged) => {
    // A scan the controller did not ask for (new content, hydration, a
    // resize) changed the page colour: repaint before the next frame.
    if (this.shown && this.engine) {
      this.engine.setBackground(color, isDark());
      this.engine.renderNow();
    }
    if (shellChanged) requestHeaderToneSample();
  });
  private readonly offs: Array<() => void> = [];
  private cancelIdle: (() => void) | null = null;
  private themeObserver: MutationObserver | null = null;
  private offTone: (() => void) | null = null;
  private resizeTimer = 0;

  constructor() {
    if (!wanted()) {
      this.state = "off";
      return;
    }
    this.offs.push(
      onReducedMotion(() => {
        this.shutdown();
      }),
      onArticleTransitionChange(() => {
        this.apply();
      }),
    );
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      window.removeEventListener("pointermove", onMove);
      // Soon, but not inside a busy frame of whatever the move started.
      this.cancelIdle?.();
      this.cancelIdle = whenIdle(() => {
        this.load();
      }, 400);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    this.offs.push(() => {
      window.removeEventListener("pointermove", onMove);
    });
    this.cancelIdle = whenIdle(() => {
      this.load();
    }, 2500);
  }

  setActive(active: boolean) {
    this.wanted = active;
    this.apply();
  }

  private apply() {
    this.active = this.wanted && !isArticleTransitionBusy();
    if (this.active) this.show();
    else this.hide();
  }

  /** A new page is on screen: its strokes start fresh and its surfaces are found. */
  routeChanged() {
    if (!this.shown || !this.engine) return;
    this.engine.resetField();
    const color = this.surfaces.scan();
    this.engine.setBackground(color, isDark());
    this.engine.renderNow();
  }

  dispose() {
    this.shutdown();
  }

  private load() {
    this.cancelIdle = null;
    if (this.state !== "idle" || !this.active) return;
    if (!wanted() || !hardwareWebGL2()) {
      this.shutdown();
      return;
    }
    this.state = "loading";
    import("@/components/cursor-distortion/flow-engine")
      .then(({ FlowEngine }) => {
        if (this.state !== "loading") return;
        const params = new URLSearchParams(window.location.search);
        const dev = process.env.NODE_ENV !== "production";
        let engine: FlowEngine;
        try {
          engine = new FlowEngine({
            onFail: (reason) => {
              this.fail(reason);
            },
            grid: dev && params.has("flowgrid"),
          });
        } catch {
          this.shutdown();
          return;
        }
        this.engine = engine;
        engine.setBackground(pageColor(), isDark());
        if (!engine.prepare()) {
          this.shutdown();
          return;
        }
        this.state = "ready";
        if (dev) {
          Object.assign(window, { __cursorFlow: { engine, surfaces: this.surfaces } });
          if (params.has("flowdemo")) {
            void import("@/components/cursor-distortion/flow-demo").then(({ mountFlowDemo }) => {
              if (this.engine === engine) this.offs.push(mountFlowDemo(engine));
            });
          }
        }
        if (this.active) this.show();
      })
      .catch(() => {
        this.shutdown();
      });
  }

  private show() {
    const engine = this.engine;
    if (this.state === "idle" && !this.cancelIdle) {
      this.cancelIdle = whenIdle(() => {
        this.load();
      }, 2500);
      return;
    }
    if (this.state !== "ready" || !engine || this.shown) return;
    this.shown = true;
    // One task: the canvas has its first frame before any surface clears.
    engine.setBackground(pageColor(), isDark());
    engine.show();
    const color = this.surfaces.attach();
    engine.setBackground(color, isDark());
    engine.renderNow();

    // The theme: redraw in the same task as the class change, so a cleared
    // surface never shows the old page colour for a frame.
    this.themeObserver = new MutationObserver(() => {
      if (!this.shown) return;
      const next = this.surfaces.scan();
      engine.setBackground(next, isDark());
      engine.renderNow();
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("resize", this.onResize);
    this.offTone = registerHeaderToneProvider(this.headerTone);
    setGlHost(engine);
  }

  /**
   * The glass header looks through cleared surfaces to the body. Under a
   * page shell of its own colour it must see that colour instead, which is
   * what the stage paints there. Elsewhere the DOM probe is already right.
   */
  private readonly headerTone: HeaderToneProvider = (zones) => {
    const shell = this.surfaces.shellColor;
    if (!shell) return undefined;
    const content = document.getElementById("smooth-content");
    const skip = (element: Element) =>
      element.closest("header") !== null && !content?.contains(element);
    return zones.map((zone) =>
      zone.points.map((point) => probePoint(point.x, point.y, skip, shell)),
    );
  };

  private hide() {
    if (!this.shown) return;
    this.shown = false;
    setGlHost(null);
    this.offTone?.();
    this.offTone = null;
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    window.removeEventListener("resize", this.onResize);
    window.clearTimeout(this.resizeTimer);
    this.surfaces.detach();
    this.engine?.hide();
  }

  private readonly onResize = () => {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (this.shown) this.surfaces.scan();
    }, 120);
  };

  private fail(reason: FlowFailure) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[cursor-flow] stopped: ${reason}`);
    }
    this.shutdown();
  }

  /** Off for the rest of the visit: plain CSS backgrounds, no canvas. */
  private shutdown() {
    this.hide();
    this.state = "off";
    this.cancelIdle?.();
    this.cancelIdle = null;
    for (const off of this.offs.splice(0)) off();
    this.engine?.dispose();
    this.engine = null;
  }
}

let controller: FlowController | null = null;
let holders = 0;
let pendingDispose = 0;

/**
 * Mounts the visit's flow (idempotent). Returns the release: the stage is
 * torn down one tick after the last holder leaves, so Strict Mode's
 * synchronous remount keeps the same instance.
 */
export function retainCursorFlow() {
  window.clearTimeout(pendingDispose);
  holders += 1;
  controller ??= new FlowController();
  return () => {
    holders -= 1;
    if (holders > 0) return;
    pendingDispose = window.setTimeout(() => {
      if (holders > 0) return;
      controller?.dispose();
      controller = null;
    }, 0);
  };
}

export function cursorFlow() {
  return controller;
}
